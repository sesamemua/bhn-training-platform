/**
 * The eligibility roster, for admins.
 *
 *   GET    /api/admin/eligibility            state, sources, recent imports
 *   POST   /api/admin/eligibility            add one person by hand
 *   PUT    /api/admin/eligibility            import a pasted CSV for one source
 *   DELETE /api/admin/eligibility?id=…       remove one person
 *
 * The add-by-hand path is not a convenience. The ENGAGE / EXPERIENCE
 * sheet is re-read nightly by /api/cron/eligibility-import, but the two
 * EQUIP workbooks are manual exports until somebody issues the Graph
 * credentials — so somebody accepted this morning can still be missing,
 * and this is how a coordinator fixes it in the ten seconds they have
 * while that person is on the phone.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailKey } from "@/lib/eligibility/email-key";
import { applyRoster, autoRefreshes } from "@/lib/eligibility/apply";
import { eligibilitySource, ELIGIBILITY_SOURCES } from "@/lib/eligibility/sources";
import { eligibilityGate } from "@/lib/eligibility/gate";
import { platformApplicantCount, rosterState } from "@/lib/eligibility/check";

export const runtime = "nodejs";

/** A pasted sheet, not a database. Past this it is a file upload. */
const MAX_IMPORT_CHARS = 2_000_000;

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
  const [applicants, perSource, imports] = await Promise.all([
    platformApplicantCount(),
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
    sources: ELIGIBILITY_SOURCES.map((s) => ({
      ...s,
      count: s.access === "platform" ? applicants : counts[s.id] ?? 0,
      // Whether anybody still has to remember to re-paste this one.
      auto: autoRefreshes(s.id),
    })),
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

  // Every address in the paste; the name only from a column headed as one.
  // Same path the nightly cron takes, so both leave the same audit trail.
  const done = await applyRoster({
    sourceId,
    text,
    method: "upload",
    filename: String(body.filename ?? "") || null,
    byId: me.user.id ?? null,
  });
  if (!done.ok) {
    return NextResponse.json(
      { error: "No email addresses found in that. Paste the sheet including the column that has them." },
      { status: 400 },
    );
  }

  const state = await rosterState();
  return NextResponse.json({
    ok: true,
    imported: done.rows,
    skipped: done.skipped,
    added: done.added,
    removed: done.removed,
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
