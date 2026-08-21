/**
 * Admin: approve or cancel a workshop booking on an attendee's behalf.
 *
 *   POST   /api/admin/events/[slug]/registrations/[rid]/workshop-bookings/[bookingId]
 *     body: { action: "approve" }
 *     Moves a pending booking → confirmed (if seats left) or waitlist
 *     (if waitlist has room). Idempotent on already-approved rows.
 *
 *   DELETE /api/admin/events/[slug]/registrations/[rid]/workshop-bookings/[bookingId]
 *     Cancels the WorkshopBooking and runs the standard side effects —
 *     if it was confirmed, the next waitlister is promoted; if it was
 *     on the waitlist, lower positions are renumbered. Pending →
 *     cancelled is also valid (effectively a "reject").
 *
 * Defence in depth: every layer (event slug → registration → booking)
 * must agree on ownership before we let the delete through, so an
 * admin can't accidentally touch a booking belonging to a different
 * event or attendee by hand-rolling URLs.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approveWorkshopBooking, cancelWorkshopBooking } from "@/lib/events/bookings";

export const runtime = "nodejs";

const APPROVE_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  cancelled: 409,
  waitlist_full: 409,
};

async function loadBookingOrErr(
  slug: string,
  rid: string,
  bookingId: string,
): Promise<
  | { ok: true; eventId: string; userId: string; workshopId: string }
  | { ok: false; status: number; error: string }
> {
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) return { ok: false as const, status: 404, error: "Event not found" };

  const registration = await prisma.registration.findUnique({
    where: { id: rid },
    select: { eventId: true, userId: true },
  });
  if (!registration || registration.eventId !== event.id) {
    return { ok: false as const, status: 404, error: "Registration not found for this event" };
  }

  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: { workshopId: true, userId: true, workshop: { select: { eventId: true } } },
  });
  /*
   * booking.userId is nullable since seats can belong to a public
   * registration with no account. This route is the account-holder
   * path, so a seat with no user on it is not the one being asked
   * about — checked explicitly rather than leaning on the comparison,
   * because `null !== someId` is true for the wrong reason.
   */
  if (
    !booking ||
    !booking.userId ||
    booking.userId !== registration.userId ||
    booking.workshop.eventId !== event.id
  ) {
    return { ok: false as const, status: 404, error: "Booking not found for this registration" };
  }
  return {
    ok: true as const,
    eventId: event.id,
    userId: booking.userId,
    workshopId: booking.workshopId,
  };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; rid: string; bookingId: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminUserId = (session.user as { id?: string }).id;
  if (!adminUserId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug, rid, bookingId } = await ctx.params;
  const guard = await loadBookingOrErr(slug, rid, bookingId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "approve") {
    return NextResponse.json(
      { error: "Unsupported action — use action=approve, or DELETE to cancel." },
      { status: 400 },
    );
  }

  const r = await approveWorkshopBooking(prisma, bookingId, adminUserId);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, code: r.code },
      { status: APPROVE_ERROR_STATUS[r.code] ?? 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    status: r.status,
    waitlistPosition: r.waitlistPosition,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; rid: string; bookingId: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug, rid, bookingId } = await ctx.params;
  const guard = await loadBookingOrErr(slug, rid, bookingId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const r = await cancelWorkshopBooking(prisma, guard.userId, guard.workshopId);
  if (!r.ok) {
    return NextResponse.json({ error: r.error, code: r.code }, { status: 400 });
  }
  return NextResponse.json({ ok: true, promoted: r.promoted });
}
