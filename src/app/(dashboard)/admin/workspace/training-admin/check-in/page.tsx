/**
 * Training Week → Check-in. The page an admin opens at a session's door:
 * on a phone it scans passes, on a laptop it is the list. Opens on the
 * session running now (or next); any other is one pick away.
 */
import { redirect } from "next/navigation";
import { ScanLine } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { CheckInDesk, type DeskSession } from "@/components/workspace/CheckInDesk";
import { sessionNow } from "@/lib/training-week/check-in";

export const dynamic = "force-dynamic";

export default async function TrainingWeekCheckInPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  // The Training Week event is the one carrying the most workshops — the
  // same way the Training admin page picks it.
  const events = await prisma.bhnEvent.findMany({ select: { id: true, _count: { select: { workshops: true } } } });
  const event = [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0] ?? null;

  const workshops = event
    ? await prisma.workshop.findMany({
        where: { eventId: event.id, isActive: true },
        select: { id: true, title: true, startDateTime: true, endDateTime: true, capacity: true, locationName: true },
        orderBy: { startDateTime: "asc" },
      })
    : [];
  const sessions: DeskSession[] = workshops.map((w) => ({
    id: w.id,
    title: w.title,
    start: w.startDateTime.toISOString(),
    end: w.endDateTime.toISOString(),
    capacity: w.capacity ?? 0,
    location: w.locationName,
  }));

  return (
    <>
      <PageHero
        eyebrow="Workspace · Training Week"
        title="Check-in"
        description="Scan passes at the door with a phone, or check people in from the list on a laptop. Both work at once, on as many devices as you have."
        icon={<ScanLine />}
      />
      <div className="mt-6">
        {sessions.length === 0 ? (
          <p className="text-[13px] text-muted">There are no active Training Week sessions to check people into.</p>
        ) : (
          <CheckInDesk sessions={sessions} initialId={sessionNow(sessions)} />
        )}
      </div>
    </>
  );
}
