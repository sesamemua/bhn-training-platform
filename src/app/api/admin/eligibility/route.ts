/**
 * The eligibility roster, for admins.
 *
 *   GET    /api/admin/eligibility            state, sources, recent imports
 *   POST   /api/admin/eligibility            add one person by hand
 *   PUT    /api/admin/eligibility            import a pasted CSV for one source
 *   DELETE /api/admin/eligibility?id=…       remove one person
 *
 * The add-by-hand path is not a convenience. Registration blocks on a
 * non-match, and every list here is a manual export until the Google
 * and Graph credentials exist — so somebody accepted this morning is
 * guaranteed to be missing, and this is how a coordinator fixes it in
 * the ten seconds they have while that person is on the phone.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailKey } from "@/lib/eligibility/email-key";
import { eligibilitySource, ELIGIBILITY_SOURCES } from "@/lib/eligibility/sources";
import { eligibilityGate } from "@/lib/eligibility/gate";
import { rosterState } from "@/lib/eligibility/check";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A pasted sheet, not a database. Past this it is a file upload. */
const MAX_IMPORT_CHARS = 2_000_000;
const MAX_IMPORT_ROWS = 20_000;

async function admin() {
  try {
    return (await requireRole("admin")) as { user: { id?: string } };
  } catch {
    return null;
  }
}
const DENIED = () =>
  NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });

export async function GET() {
  if (!(await admin())) return DENIED();

  const state = await rosterState();
  const [perSource, imports] = await Promise.all([
    prisma.eligibilityEntry.groupBy({ by: ["sourceId"], _count: { _all: true } }),
    prisma.eligibilityImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, sourceId: true, method: true, filename: true,
        rowsRead: true, rowsAccepted: true, rowsSkipped: true,
        addedEmails: true, removedEmails: true,
        error: true, createdAt: true,
      },
    }),
  ]);

  const counts = Object.fromEntries(perSource.map((r) => [r.sourceId, r._count._all]));
  return NextResponse.json({
    ok: true,
    gate: eligibilityGate(state, new Date()),
    total: state.total,
    lastImportAt: state.lastImportAt,
    sources: ELIGIBILITY_SOURCES.map((s) => ({ ...s, count: counts[s.id] ?? 0 })),
    imports,
  });
}

export async function POST(req: NextRequest) {
  const me = await admin();
  if (!me) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim();
  const name = String(body.name ?? "").trim().slice(0, 160) || null;
  const note = String(body.note ?? "").trim().slice(0, 300) || null;
  const sourceId = String(body.sourceId ?? "");

  if (!eligibilitySource(sourceId)) {
    return NextResponse.json({ error: "Pick which list they belong on." }, { status: 400 });
  }
  const key = emailKey(email);
  if (!key) {
    return NextResponse.json({ error: `That is not an email address: ${email}` }, { status: 400 });
  }

  const entry = await prisma.eligibilityEntry.upsert({
    where: { emailKey_sourceId: { emailKey: key, sourceId } },
    // Adding somebody who is already there is not an error — it is a
    // coordinator making sure, which should be free.
    update: { name: name ?? undefined, note: note ?? undefined, addedById: me.user.id ?? null },
    create: { emailKey: key, email, name, note, sourceId, addedById: me.user.id ?? null },
    select: { id: true, email: true, emailKey: true, name: true, sourceId: true, note: true },
  });
  return NextResponse.json({ ok: true, entry });
}

export async function PUT(req: NextRequest) {
  const me = await admin();
  if (!me) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sourceId = String(body.sourceId ?? "");
  const source = eligibilitySource(sourceId);
  if (!source) return NextResponse.json({ error: "No such list." }, { status: 404 });

  const text = String(body.text ?? "");
  if (text.length > MAX_IMPORT_CHARS) {
    return NextResponse.json({ error: "That is more than one paste can carry." }, { status: 413 });
  }

  /*
   * Every address in the paste, wherever it is.
   *
   * Nobody on this side controls those spreadsheets' headers, and they
   * have been renamed before. Rather than guess which column is the
   * email, take every address the text contains — a row without one is
   * a row we could not have used anyway.
   */
  const lines = text.split(/\r?\n/).slice(0, MAX_IMPORT_ROWS);
  const seen = new Set<string>();
  const rows: { emailKey: string; email: string; name: string | null }[] = [];
  let skipped = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(/[,\t;]/);
    const found = cells.map((c) => ({ raw: c, key: emailKey(c) })).find((c) => c.key);
    if (!found?.key) { skipped += 1; continue; }
    if (seen.has(found.key)) continue;
    seen.add(found.key);
    // The longest other cell that is not an address is very likely the
    // name. A guess, and a harmless one — it is only ever displayed.
    const name = cells
      .filter((c) => c !== found.raw && !emailKey(c))
      .map((c) => c.trim().replace(/^["']|["']$/g, ""))
      .filter((c) => c.length > 1 && c.length < 80 && /[\p{L}]/u.test(c))
      .sort((a, b) => b.length - a.length)[0] ?? null;
    rows.push({ emailKey: found.key, email: found.raw.trim(), name });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No email addresses found in that. Paste the sheet including the column that has them." },
      { status: 400 },
    );
  }

  /*
   * What this import changes, worked out BEFORE the rows are replaced.
   *
   * Compared against the whole source, hand-added rows included: an
   * admin who added somebody by hand last week does not want them
   * reported as "new" every time the sheet is re-imported. Removals are
   * only the rows an import owns — somebody added by hand survives the
   * replace below, so calling them removed would be a lie.
   */
  const before = await prisma.eligibilityEntry.findMany({
    where: { sourceId },
    select: { emailKey: true, email: true, addedById: true },
  });
  const beforeKeys = new Set(before.map((r) => r.emailKey));
  const incomingKeys = new Set(rows.map((r) => r.emailKey));
  const addedEmails = rows.filter((r) => !beforeKeys.has(r.emailKey)).map((r) => r.email);
  const removedEmails = before
    .filter((r) => r.addedById === null && !incomingKeys.has(r.emailKey))
    .map((r) => r.email);

  const record = await prisma.eligibilityImport.create({
    data: {
      sourceId,
      addedEmails,
      removedEmails,
      method: "upload",
      filename: String(body.filename ?? "").slice(0, 200) || null,
      rowsRead: lines.filter((l) => l.trim()).length,
      rowsAccepted: rows.length,
      rowsSkipped: skipped,
      byId: me.user.id ?? null,
    },
    select: { id: true },
  });

  /*
   * Replace this list's rows, leave the other lists alone. An import is
   * the list as it stands now — somebody removed from the programme
   * should stop being eligible, which a merge would never notice.
   * Anyone added by hand survives: they were added precisely because
   * the export was wrong.
   */
  await prisma.$transaction([
    prisma.eligibilityEntry.deleteMany({ where: { sourceId, addedById: null } }),
    prisma.eligibilityEntry.createMany({
      data: rows.map((r) => ({ ...r, sourceId, importId: record.id })),
      skipDuplicates: true,
    }),
  ]);

  const state = await rosterState();
  return NextResponse.json({
    ok: true,
    imported: rows.length,
    skipped,
    added: addedEmails,
    removed: removedEmails,
    gate: eligibilityGate(state, new Date()),
    total: state.total,
  });
}

export async function DELETE(req: NextRequest) {
  if (!(await admin())) return DENIED();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which person?" }, { status: 400 });
  await prisma.eligibilityEntry.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
