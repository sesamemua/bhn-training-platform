/**
 * Admin endpoints for Equip funding-window deadlines.
 *
 *   GET  /api/admin/equip/deadlines        list every row
 *   POST /api/admin/equip/deadlines        create a new window
 *
 * Authn: admin OR equip_review committee member. Committee
 * members who run the reviews should be able to schedule the
 * next cycle's window without bouncing back to a platform admin.
 */
import { NextResponse } from "next/server";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { listDeadlines } from "@/lib/equip/deadlines";
import { noonEasternOn, vcLaunchDate } from "@/lib/equip/calendar";

export const runtime = "nodejs";

const VALID_STREAMS = new Set(["venture_connect", "venture_lift"]);

export async function GET() {
  await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]);
  const rows = await listDeadlines();
  return NextResponse.json({ deadlines: rows });
}

export async function POST(req: Request) {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]);
  const actorId = (session.user as { id?: string }).id ?? "";
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const stream = typeof body.stream === "string" ? body.stream : "";
  const deadlineAtRaw = typeof body.deadlineAt === "string" ? body.deadlineAt : "";
  const cycleLabel = typeof body.cycleLabel === "string" ? body.cycleLabel.slice(0, 100) : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

  if (!VALID_STREAMS.has(stream)) {
    return NextResponse.json({ error: "Unknown stream" }, { status: 400 });
  }
  const deadlineAt = new Date(deadlineAtRaw);
  if (isNaN(deadlineAt.getTime())) {
    return NextResponse.json({ error: "Invalid deadline date/time" }, { status: 400 });
  }

  // A VC round that hasn't launched yet (first Tuesday of its month) is
  // "scheduled" — still the window applications count toward, but not
  // shown as open early.
  const launch = stream === "venture_connect"
    ? noonEasternOn(vcLaunchDate(deadlineAt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" })))
    : null;
  const created = await prisma.equipDeadline.create({
    data: {
      stream,
      deadlineAt,
      originalDeadlineAt: deadlineAt,
      status: launch && launch > new Date() ? "scheduled" : "open",
      cycleLabel: cycleLabel || null,
      note: note || null,
      createdById: actorId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "equip_deadline.create",
      targetType: "equip_deadline",
      targetId: created.id,
      detail: JSON.stringify({ stream, deadlineAt: deadlineAt.toISOString(), cycleLabel, note }),
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, deadline: created });
}
