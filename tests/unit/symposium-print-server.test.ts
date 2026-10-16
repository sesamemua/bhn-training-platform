import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { PrintBoardSchema, type PrintBoard } from "../../src/lib/events/print-jobs";

type Row = { key: string; value: string; updatedAt: Date };
let rows = new Map<string, Row>(), race = false, transactions = 0;
const prisma = {
  platformSetting: { findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null },
  bhnEvent: { findUnique: async () => ({ speakers: [] }) },
  eligibilityEntry: { findMany: async () => [{ name: "Jane Smith", email: "jane.smith@example.org", sourceId: "engage-experience" }] },
  user: { findMany: async () => [] },
  $transaction: async (fn: (tx: unknown) => Promise<void>) => {
    transactions++;
    const staged = new Map(rows);
    const tx = { platformSetting: {
      create: async ({ data }: { data: Row }) => { if (staged.has(data.key)) throw Object.assign(new Error("duplicate"), { code: "P2002" }); staged.set(data.key, { ...data, updatedAt: data.updatedAt ?? new Date() }); return data; },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const row = staged.get(where.key);
        if (race || !row || row.value !== where.value || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        staged.set(where.key, { ...row, ...data }); return { count: 1 };
      },
    } };
    await fn(tx);
    rows = staged;
  },
} as unknown as PrismaClient;
Reflect.set(globalThis, "prisma", prisma);
const server = import("../../src/lib/events/print-store");
const key = "symposium2026.printJobs.v1", version = "2026-10-16T15:00:00.000Z";
const board = (): PrintBoard => PrintBoardSchema.parse({ guests: [{ id: "one", name: "Jane Smith", email: "jane.smith@example.org", organization: "UofT", status: "approved", tickets: 1, source: "luma" }], edits: {}, jobs: [], syncedAt: version, tentText: "BioHubNet", agendaText: "Current agenda", tentTemplate: null, agendaTemplate: null });
const reset = () => { rows = new Map([[key, { key, value: JSON.stringify(board()), updatedAt: new Date(version) }]]); race = false; transactions = 0; };
const create = { action: "create" as const, kind: "badges" as const, label: "Batch 1", ids: ["one"], copies: 1, assignedTo: "Colleague", notes: "", allowReprint: false, skip: 0, offsetX: 0, offsetY: 0 };

test("empty storage reads the verified 2026 agenda and never writes during GET", async () => {
  rows = new Map(); const { loadPrintStore } = await server;
  const result = await loadPrintStore();
  assert.match(result.snapshot.board.agendaText, /Christopher Procyshyn/);
  assert.ok(!result.snapshot.board.agendaText.includes("Future of Biomanufacturing"));
  assert.equal(rows.size, 0);
});

test("connection status reflects configuration without exposing the Luma credential", async () => {
  reset(); const { loadPrintStore } = await server;
  const previous = process.env.LUMA_SESSION_KEY;
  try {
    delete process.env.LUMA_SESSION_KEY;
    assert.equal((await loadPrintStore()).snapshot.autoSyncAvailable, false);
    process.env.LUMA_SESSION_KEY = "  ";
    assert.equal((await loadPrintStore()).snapshot.autoSyncAvailable, false);
    process.env.LUMA_SESSION_KEY = "private-test-session";
    const result = (await loadPrintStore()).snapshot;
    assert.equal(result.autoSyncAvailable, true);
    assert.ok(!JSON.stringify(result).includes("private-test-session"));
  } finally {
    if (previous === undefined) delete process.env.LUMA_SESSION_KEY;
    else process.env.LUMA_SESSION_KEY = previous;
  }
});

test("CSV import records its source while retaining badge edits and print history", async () => {
  reset(); const { changePrintStore } = await server;
  const edited = await changePrintStore(version, { action: "edit", id: "one", badge: { name: "Jane Smith", organization: "University of Toronto", extra: "HQP Representative", reviewed: true } }, "Admin");
  const queued = await changePrintStore(edited.snapshot.version, create, "Admin");
  const result = await changePrintStore(queued.snapshot.version, { action: "import", csv: "name,email,approval_status,organization\nJane Smith,jane.smith@example.org,approved,UofT" }, "Admin");
  assert.equal(result.snapshot.board.syncSource, "csv");
  assert.equal(result.snapshot.board.jobs.length, 1);
  assert.equal(result.snapshot.board.jobs[0].printedIds.length, 0);
  assert.equal(result.snapshot.people[0].id, "one");
  assert.equal(result.snapshot.people[0].extra, "HQP Representative");
  assert.equal(result.snapshot.people[0].printStatus, "queued");
});

test("stale versions cannot overwrite shared badge edits", async () => {
  reset(); const { changePrintStore } = await server;
  const result = await changePrintStore(null, create, "Admin");
  assert.equal(result.conflict, true); assert.equal(transactions, 0);
});

test("verified surnames and their history persist and stale requests cannot replace them", async () => {
  reset();
  const original = board(); original.guests[0].name = "Jane";
  rows.set(key, { key, value: JSON.stringify(original), updatedAt: new Date(version) });
  const { changePrintStore } = await server;
  const result = await changePrintStore(version, { action: "verify_names" }, "Ruilin Yuan");
  assert.equal(result.conflict, false);
  assert.equal(result.snapshot.people[0].name, "Jane Smith");
  assert.equal(result.snapshot.board.nameHistory?.[0].by, "Ruilin Yuan");
  assert.match(result.snapshot.board.nameHistory![0].evidence, /engage-experience/);
  assert.equal((await changePrintStore(version, { action: "verify_names" }, "Other admin")).conflict, true);
  assert.equal(JSON.parse(rows.get(key)!.value).nameHistory.length, 1);
});

test("PDF bytes and queue metadata are committed atomically and remain fixed after edits", async () => {
  reset(); const { changePrintStore, printJobPdf } = await server;
  const result = await changePrintStore(version, create, "Admin");
  assert.equal(result.conflict, false); assert.ok(result.jobId);
  const before = await printJobPdf(result.jobId!);
  assert.ok(before?.bytes.subarray(0, 5).toString() === "%PDF-");
  assert.equal(before?.job.printedIds.length, 0);
  const edited = await changePrintStore(result.snapshot.version, { action: "edit", id: "one", badge: { name: "Jane Smith", organization: "Changed company", extra: "HQP Representative", reviewed: true } }, "Admin");
  assert.equal(edited.conflict, false);
  assert.deepEqual((await printJobPdf(result.jobId!))?.bytes, before?.bytes);
  assert.equal((await printJobPdf(result.jobId!))?.job.badges[0].organization, "University of Toronto");
  assert.equal(await printJobPdf("non-job-template"), null);
});

test("a compare-and-swap race rolls the PDF insert back together with the queue change", async () => {
  reset(); race = true; const { changePrintStore } = await server;
  assert.equal((await changePrintStore(version, create, "Admin")).conflict, true);
  assert.equal(rows.size, 1);
  assert.equal(JSON.parse(rows.get(key)!.value).jobs.length, 0);
});

test("corrupt stored data is not reset or overwritten", async () => {
  reset(); rows.get(key)!.value = "bad JSON";
  const { loadPrintStore } = await server;
  await assert.rejects(loadPrintStore());
  assert.equal(rows.get(key)!.value, "bad JSON");
});
