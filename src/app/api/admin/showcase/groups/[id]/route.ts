/**
 * PATCH  /api/admin/showcase/groups/[id] — edit name/eyebrow/intro/active, the written question (quotePrompt, quoteMaxWords) and photoLabel
 * DELETE /api/admin/showcase/groups/[id] — delete the group (submissions,
 *        which couple loosely by slug, are left in the dashboard).
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    eyebrow?: unknown;
    intro?: unknown;
    active?: unknown;
    linkedCohortId?: unknown;
    gateOnAttendance?: unknown;
    quotePrompt?: unknown;
    quoteMaxWords?: unknown;
    photoLabel?: unknown;
  };
  const data: {
    name?: string;
    eyebrow?: string | null;
    intro?: string | null;
    active?: boolean;
    linkedCohortId?: string | null;
    gateOnAttendance?: boolean;
    quotePrompt?: string | null;
    quoteMaxWords?: number;
    photoLabel?: string | null;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 160);
  }
  if (typeof body.eyebrow === "string") {
    data.eyebrow = body.eyebrow.trim() ? body.eyebrow.trim().slice(0, 160) : null;
  }
  if (typeof body.intro === "string") {
    data.intro = body.intro.trim() ? body.intro.trim().slice(0, 600) : null;
  }
  if (typeof body.active === "boolean") {
    data.active = body.active;
  }
  // Bind (or unbind) this cohort to a real PathwayCohort, and toggle the
  // attendance gate on the public submission page.
  if (typeof body.linkedCohortId === "string" || body.linkedCohortId === null) {
    data.linkedCohortId = (body.linkedCohortId as string | null) || null;
  }
  if (typeof body.gateOnAttendance === "boolean") {
    data.gateOnAttendance = body.gateOnAttendance;
  }
  // The written question (empty turns it off), its word limit, and what the photo is called.
  if (typeof body.quotePrompt === "string") data.quotePrompt = body.quotePrompt.trim().slice(0, 600) || null;
  if (typeof body.quoteMaxWords === "number" && Number.isInteger(body.quoteMaxWords)) data.quoteMaxWords = Math.min(1000, Math.max(10, body.quoteMaxWords));
  if (typeof body.photoLabel === "string") data.photoLabel = body.photoLabel.trim().slice(0, 120) || null;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const group = await prisma.showcaseGroup
    .update({ where: { id }, data })
    .catch(() => null);
  if (!group) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  await prisma.showcaseGroup.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
