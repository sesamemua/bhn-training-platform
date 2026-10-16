import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { loadPeoplePlan } from "./people-plan-store";
import { applyPrintAction, mergePrintGuests, printPeople, PrintBoardSchema, type PrintAction, type PrintBoard, type PrintWorkspace, type PrintIdentity } from "./print-jobs";
import { fetchLumaPrintGuests, parseLumaPrintCsv } from "./print-luma";
import { buildPrintPdf } from "./print-pdf";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_PRINT_AGENDA } from "./print-agenda";

export const PRINT_BOARD_KEY = "symposium2026.printJobs.v1";
const artifactKey = (id: string) => `symposium2026.printPdf.${id}`;

export async function loadPrintStore(): Promise<{ snapshot: PrintWorkspace; raw: string | null; identities: PrintIdentity[] }> {
  const [saved, plan] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: PRINT_BOARD_KEY } }),
    loadPeoplePlan(),
  ]);
  const board: PrintBoard = saved ? PrintBoardSchema.parse(JSON.parse(saved.value)) : {
    guests: [], edits: {}, jobs: [], syncedAt: null, tentText: "BioHubNet\n2026 Annual Symposium",
    agendaText: DEFAULT_PRINT_AGENDA,
    tentTemplate: null, agendaTemplate: null,
  };
  const identities = plan.snapshot.people.filter(p => !p.archived).map(p => ({ fullName: p.fullName, email: p.email, organization: p.organization, title: p.title, tags: p.tags }));
  return { snapshot: { board, people: printPeople(board, identities), version: saved?.updatedAt.toISOString() ?? null }, raw: saved?.value ?? null, identities };
}

class PrintConflict extends Error {}

async function persistPrintStore(current: Awaited<ReturnType<typeof loadPrintStore>>, board: PrintBoard, pdf?: { id: string; bytes: Uint8Array }) {
  const now = new Date(Math.max(Date.now(), Date.parse(current.snapshot.version ?? "") + 1 || 0));
  const value = JSON.stringify(PrintBoardSchema.parse(board));
  await prisma.$transaction(async tx => {
    if (pdf) await tx.platformSetting.create({ data: { key: artifactKey(pdf.id), value: Buffer.from(pdf.bytes).toString("base64") } });
    if (current.raw === null) {
      await tx.platformSetting.create({ data: { key: PRINT_BOARD_KEY, value, updatedAt: now } });
    } else {
      const result = await tx.platformSetting.updateMany({ where: { key: PRINT_BOARD_KEY, value: current.raw, updatedAt: new Date(current.snapshot.version!) }, data: { value, updatedAt: now } });
      if (!result.count) throw new PrintConflict();
    }
  }, { timeout: 15000 });
  return { board, people: printPeople(board, current.identities), version: now.toISOString() } satisfies PrintWorkspace;
}

export async function changePrintStore(version: string | null, action: PrintAction, actor: string) {
  const current = await loadPrintStore();
  if (version !== current.snapshot.version) return { conflict: true, snapshot: current.snapshot };
  const at = new Date().toISOString(), id = randomUUID();
  let next: PrintBoard, pdf: { id: string; bytes: Uint8Array } | undefined;
  if (action.action === "sync" || action.action === "import") {
    const guests = action.action === "sync" ? await fetchLumaPrintGuests() : parseLumaPrintCsv(action.csv);
    // CSV imports without API IDs retain identities already established by a unique email match.
    for (const g of guests) {
      const matches = current.snapshot.board.guests.filter(old => old.source === "luma" && old.email && old.email === g.email);
      if (matches.length === 1 && (g.id.startsWith("luma-email:") || matches[0].id.startsWith("luma-email:"))) g.id = matches[0].id;
    }
    next = mergePrintGuests(current.snapshot.board, guests, at);
  } else {
    const result = applyPrintAction(current.snapshot.board, current.snapshot.people, action, actor, id, at);
    next = result.board;
    if (result.job) {
      const template = result.job.kind === "tents" ? next.tentTemplate : result.job.kind === "agenda" ? next.agendaTemplate : null;
      const source = template ? await prisma.platformSetting.findUnique({ where: { key: template.key } }) : null;
      if (template && !source) throw new Error("The saved design could not be loaded. Please upload it again.");
      const bytes = await buildPrintPdf(result.job, next, source ? Buffer.from(source.value, "base64") : undefined);
      if (bytes.byteLength > 4_000_000) throw new Error("This PDF is too large. Upload a smaller design or create a smaller batch.");
      pdf = { id, bytes };
    }
  }
  try { return { conflict: false, snapshot: await persistPrintStore(current, next, pdf), jobId: pdf?.id }; }
  catch (e) {
    if (e instanceof PrintConflict || (e as { code?: string }).code === "P2002") return { conflict: true, snapshot: (await loadPrintStore()).snapshot };
    throw e;
  }
}

export async function uploadPrintTemplate(version: string | null, kind: "tents" | "agenda", filename: string, bytes: Uint8Array) {
  const current = await loadPrintStore();
  if (version !== current.snapshot.version) return { conflict: true, snapshot: current.snapshot };
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() < 1 || doc.getPageCount() > (kind === "tents" ? 1 : 20)) throw new Error(kind === "tents" ? "Upload one PDF page for the table-tent design." : "Upload an agenda of up to 20 PDF pages.");
  const id = randomUUID(), board = structuredClone(current.snapshot.board);
  const template = { key: artifactKey(id), name: filename.slice(0, 200) };
  if (kind === "tents") board.tentTemplate = template; else board.agendaTemplate = template;
  try { return { conflict: false, snapshot: await persistPrintStore(current, board, { id, bytes }) }; }
  catch (e) {
    if (e instanceof PrintConflict || (e as { code?: string }).code === "P2002") return { conflict: true, snapshot: (await loadPrintStore()).snapshot };
    throw e;
  }
}

export async function printJobPdf(id: string) {
  const saved = await prisma.platformSetting.findUnique({ where: { key: PRINT_BOARD_KEY } });
  if (!saved) return null;
  const board = PrintBoardSchema.parse(JSON.parse(saved.value));
  const job = board.jobs.find(j => j.id === id);
  if (!job) return null;
  const artifact = await prisma.platformSetting.findUnique({ where: { key: artifactKey(id) } });
  return artifact ? { job, bytes: Buffer.from(artifact.value, "base64") } : null;
}
