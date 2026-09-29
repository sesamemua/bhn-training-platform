/**
 * The capacity monitor's data for pages that do not already load the
 * week's bookings (the home dashboard). The Training Week dashboard
 * builds the same rows from what it has loaded.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { isInternal } from "./internal";
import { loadInternalSet } from "./internal-server";
import { sessionCapacity, type MonitorSession } from "./capacity";

export async function loadCapacityMonitor(): Promise<MonitorSession[]> {
  // The Training Week event is the one carrying the most workshops — the
  // same pick the Training Week dashboard makes.
  const events = await prisma.bhnEvent.findMany({ select: { id: true, _count: { select: { workshops: true } } } });
  const event = [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0];
  if (!event) return [];
  const [workshops, internal] = await Promise.all([
    prisma.workshop.findMany({
      where: { eventId: event.id, isActive: true },
      orderBy: { startDateTime: "asc" },
      select: {
        id: true, slug: true, title: true, capacity: true, startDateTime: true,
        bookings: {
          select: {
            status: true,
            user: { select: { email: true } },
            submission: { select: { email: true, data: true } },
          },
        },
      },
    }),
    loadInternalSet(),
  ]);
  return workshops.map((w) => ({
    id: w.id,
    slug: w.slug,
    title: w.title,
    start: w.startDateTime.toISOString(),
    cap: sessionCapacity(
      w.capacity,
      w.bookings.map((b) => {
        const data = (b.submission?.data ?? null) as Record<string, unknown> | null;
        const trainee = typeof data?.trainee_email === "string" ? data.trainee_email : null;
        return { status: b.status, internal: isInternal([trainee, b.submission?.email, b.user?.email], data, internal.keys) };
      }),
    ),
  }));
}
