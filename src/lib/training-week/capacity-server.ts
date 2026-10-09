/**
 * The capacity monitor's data for pages that do not already load the
 * week's bookings (the home dashboard). The Training Week dashboard
 * builds the same rows from what it has loaded.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { isInternal } from "./internal";
import { registrantName } from "@/lib/allocation/registrant-name";
import { loadInternalSet } from "./internal-server";
import { sessionCapacity, type MonitorSession } from "./capacity";
import { currentSeatSuggestions } from "@/lib/allocation/seat-suggestions-server";
import { WORKSHOP_STATUS_KEY, parseStatusMap, statusOf } from "./workshop-status";

export async function loadCapacityMonitor(): Promise<MonitorSession[]> {
  // The Training Week event is the one carrying the most workshops — the
  // same pick the Training Week dashboard makes.
  const events = await prisma.bhnEvent.findMany({ select: { id: true, _count: { select: { workshops: true } } } });
  const event = [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0];
  if (!event) return [];
  const [workshops, internal, suggestions, storedStatus] = await Promise.all([
    prisma.workshop.findMany({
      where: { eventId: event.id, isActive: true },
      orderBy: { startDateTime: "asc" },
      select: {
        id: true, slug: true, title: true, capacity: true, startDateTime: true,
        bookings: {
          select: {
            id: true, status: true, withdrawnAt: true,
            user: { select: { email: true } },
            submission: { select: { email: true, data: true } },
          },
        },
      },
    }),
    loadInternalSet(),
    currentSeatSuggestions(event.id),
    prisma.platformSetting.findUnique({ where: { key: WORKSHOP_STATUS_KEY }, select: { value: true } }),
  ]);
  const registration = parseStatusMap(storedStatus?.value);
  return workshops.map((w) => ({
    id: w.id,
    slug: w.slug,
    title: w.title,
    start: w.startDateTime.toISOString(),
    registration: statusOf(registration, w.slug),
    cap: sessionCapacity(
      w.capacity,
      w.bookings.map((b) => {
        const data = (b.submission?.data ?? null) as Record<string, unknown> | null;
        const trainee = typeof data?.trainee_email === "string" ? data.trainee_email : null;
        return { status: b.status, withdrawn: !!b.withdrawnAt, suggestion: suggestions.get(b.id)?.suggestion,
          internal: isInternal([trainee, b.submission?.email, b.user?.email], data, internal.keys) };
      }),
    ),
  }));
}

/** A place somebody gave up themselves, and whether its session has room again. */
export interface ReleasedSeat { bookingId: string; name: string; session: string; at: string; free: number }

/**
 * Seats released by registrants in the last three weeks, newest first —
 * what the dashboards announce, so a freed place gets offered to
 * somebody else rather than sitting empty.
 */
export async function loadReleasedSeats(): Promise<ReleasedSeat[]> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const rows = await prisma.workshopBooking.findMany({
    where: { withdrawnAt: { gte: since }, workshop: { isActive: true, endDateTime: { gte: new Date() } } },
    orderBy: { withdrawnAt: "desc" },
    take: 30,
    select: {
      id: true, withdrawnAt: true,
      user: { select: { name: true, email: true } },
      submission: { select: { email: true, data: true } },
      workshop: { select: { id: true, title: true, capacity: true } },
    },
  });
  if (!rows.length) return [];
  const taken = await prisma.workshopBooking.groupBy({
    by: ["workshopId"], where: { workshopId: { in: [...new Set(rows.map((r) => r.workshop.id))] }, status: "confirmed" }, _count: { _all: true },
  });
  const confirmed = new Map(taken.map((t) => [t.workshopId, t._count._all]));
  return rows.map((r) => {
    const typed = registrantName((r.submission?.data ?? {}) as Record<string, unknown>);
    return {
      bookingId: r.id,
      name: typed || r.user?.name?.trim() || r.submission?.email || r.user?.email || "A registrant",
      session: r.workshop.title,
      at: r.withdrawnAt!.toISOString(),
      free: Math.max(0, r.workshop.capacity - (confirmed.get(r.workshop.id) ?? 0)),
    };
  });
}
