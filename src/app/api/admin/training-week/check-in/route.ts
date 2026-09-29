/**
 * Training Week check-in, for admins at the door.
 *
 *   GET  ?workshopId=…                         → the session's list and room count
 *   POST { workshopId, token }                 → a scanned pass
 *   POST { workshopId, bookingId }             → a seat picked from the laptop list
 *   POST { …, letIn: true }                    → let a waitlisted/undecided person in
 *   POST { workshopId, bookingId, undo: true } → take a check-in back
 *
 * Admin-only. Every answer carries the room count, so each device at a
 * door stays honest about how many chairs are left.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checkInAtDoor, sessionRoster, undoCheckIn } from "@/lib/training-week/pass";
import { tokenFromScan } from "@/lib/training-week/check-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;

async function admin() {
  const s = await requireRole("admin").catch(() => null);
  return s ? { id: (s.user as { id?: string }).id ?? null } : null;
}

export async function GET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });
  const workshopId = req.nextUrl.searchParams.get("workshopId") ?? "";
  if (!ID.test(workshopId)) return NextResponse.json({ error: "Which session?" }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await sessionRoster(workshopId)) });
}

export async function POST(req: NextRequest) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    workshopId?: unknown; token?: unknown; bookingId?: unknown; letIn?: unknown; undo?: unknown;
  };
  const workshopId = typeof body.workshopId === "string" ? body.workshopId : "";
  if (!ID.test(workshopId)) return NextResponse.json({ error: "Which session?" }, { status: 400 });
  const bookingId = typeof body.bookingId === "string" && ID.test(body.bookingId) ? body.bookingId : undefined;

  if (body.undo === true) {
    if (!bookingId) return NextResponse.json({ error: "Which seat?" }, { status: 400 });
    return NextResponse.json({ ok: true, room: await undoCheckIn(workshopId, bookingId) });
  }

  const token = typeof body.token === "string" ? tokenFromScan(body.token) ?? undefined : undefined;
  if (!token && !bookingId) return NextResponse.json({ error: "That is not a Training Week pass." }, { status: 400 });

  const card = await checkInAtDoor({
    workshopId, token, bookingId,
    letIn: body.letIn === true,
    adminId: me.id,
    method: token ? "scan" : "manual",
  });
  return NextResponse.json({ ok: true, card });
}
