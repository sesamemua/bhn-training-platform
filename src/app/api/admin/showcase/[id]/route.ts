/**
 * DELETE /api/admin/showcase/[id]
 *
 * Admin permanently removes a graduate showcase submission. Drops the
 * R2 headshot object best-effort, then the DB row. No soft-delete —
 * the public form is unauthenticated and spam should disappear cleanly
 * (otherwise it accumulates in /admin/showcase forever).
 *
 * The R2 cleanup runs first so we don't leak orphaned blobs if the DB
 * delete throws. If R2 cleanup fails (network blip, key already gone)
 * we swallow and continue — `deleteR2ObjectByUrl` is best-effort by
 * design and a stuck R2 object isn't a reason to keep a row of spam.
 *
 * Guard rails:
 *   • Admin role required (requireRole).
 *   • Returns 404 (not 403) when the row doesn't exist — admins are
 *     trusted enough that leaking existence here doesn't matter, and
 *     the clearer message helps debug stale UI state.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl } from "@/lib/r2";

export const runtime = "nodejs";

// Only workshop / ad-hoc tags are pills now — pathway & cohort membership is
// structured (ShowcaseMembership). Legacy pathway/cohort pills were migrated
// out; this keeps new ones from being written.
const PILL_KINDS = ["workshop"] as const;
type PillKind = (typeof PILL_KINDS)[number];
type Pill = { kind: PillKind; label: string; sub?: string };

/** Coerce arbitrary client input into a clean, capped list of pills.
 *  A pill may carry an optional `sub` — a nested sub-tag (e.g. a
 *  "Regulatory Affairs" pathway pill with sub "Cohort 1"). */
function sanitisePills(input: unknown): Pill[] {
  if (!Array.isArray(input)) return [];
  const out: Pill[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const kind = (raw as { kind?: unknown }).kind;
    const label = (raw as { label?: unknown }).label;
    const subRaw = (raw as { sub?: unknown }).sub;
    if (!PILL_KINDS.includes(kind as PillKind)) continue;
    const text = typeof label === "string" ? label.trim().slice(0, 80) : "";
    if (!text) continue;
    const sub = typeof subRaw === "string" ? subRaw.trim().slice(0, 80) : "";
    const pill: Pill = { kind: kind as PillKind, label: text };
    // Workshop pills may carry an optional sub-tag (e.g. a session label).
    if (sub) pill.sub = sub;
    out.push(pill);
    if (out.length >= 24) break; // hard cap — a card can't carry more
  }
  return out;
}

/**
 * PATCH /api/admin/showcase/[id]  { pills: Pill[] }
 *
 * Admin edits the membership pills (workshop / pathway / cohort tags), and/or the award round,
 * shown on a submission card. Replaces the whole array — the client
 * always sends the full desired set after an add / edit / remove.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { pills?: unknown; round?: unknown; quote?: unknown } | null;
  // Pills: a well-formed array or nothing — an unparseable/truncated body or a
  // non-array `pills` is rejected rather than silently treated as "clear all
  // pills" (a legitimate clear sends an explicit empty array).
  // Round: a whole number 1–99, or null to clear it. Assigned only here.
  if (!body || (body.pills === undefined && body.round === undefined && body.quote === undefined)) {
    return NextResponse.json({ error: "Send pills, round or quote." }, { status: 400 });
  }
  if (body.quote !== undefined && body.quote !== null && (typeof body.quote !== "string" || body.quote.length > 1200)) {
    return NextResponse.json({ error: "The quote must be text of 1,200 characters or fewer." }, { status: 400 });
  }
  // The quote: the team's edit of a testimonial's AI-drafted quote (empty clears it).
  const quote = body.quote === undefined ? undefined : ((body.quote as string | null)?.trim() || null);
  if (body.pills !== undefined && !Array.isArray(body.pills)) {
    return NextResponse.json({ error: "pills must be an array." }, { status: 400 });
  }
  if (body.round !== undefined && body.round !== null && !(Number.isInteger(body.round) && (body.round as number) >= 1 && (body.round as number) <= 99)) {
    return NextResponse.json({ error: "Round must be a whole number from 1 to 99." }, { status: 400 });
  }
  const pills = Array.isArray(body.pills) ? sanitisePills(body.pills) : undefined;
  const round = body.round === undefined ? undefined : (body.round as number | null);

  const existing = await prisma.showcaseSubmission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  await prisma.showcaseSubmission.update({ where: { id }, data: { ...(pills !== undefined && { pills }), ...(round !== undefined && { round }), ...(quote !== undefined && { quote }) } });
  return NextResponse.json({ ok: true, pills, round });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.showcaseSubmission.findUnique({
    where: { id },
    select: { id: true, photoKey: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  // R2 cleanup first, best-effort.
  try {
    await deleteR2ObjectByUrl(existing.photoKey);
  } catch (err) {
    console.warn("[admin/showcase] R2 delete failed (continuing):", err);
  }

  await prisma.showcaseSubmission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
