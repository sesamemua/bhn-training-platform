/**
 * Workspace → Process → Admin.
 *
 * The operational side of the registration flow the Flow Charts tab
 * designs: who gets a seat when a room is oversubscribed, how full each
 * room is, who is in it, and how to write to them.
 *
 * Scoped to the Training Week event rather than being a generic event
 * console — /admin/events already covers events in general, and a tool
 * that tries to be both ends up being neither.
 */
import { redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { TrainingAdmin } from "@/components/workspace/TrainingAdmin";
import { loadRules } from "./actions";

export const dynamic = "force-dynamic";

export default async function TrainingAdminPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  // The Training Week event is the one carrying the workshops. Picked by
  // workshop count rather than by slug: the slug still says 2025 and
  // renaming it is not this page's business.
  const events = await prisma.bhnEvent.findMany({
    select: { id: true, slug: true, title: true, _count: { select: { workshops: true } } },
  });
  const event = [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0] ?? null;

  if (!event) {
    return (
      <>
        <PageHero
          eyebrow="Workspace · Training Week"
          title="Dashboard"
          description="Seat allocation, workshop capacity, registrants and email for Training Week."
          icon={<SlidersHorizontal />}
        />
        <p className="mt-6 text-[13px] text-muted">
          No event with workshops exists yet, so there is nothing to administer.
          Create one under Events first.
        </p>
      </>
    );
  }

  const [rules, workshops] = await Promise.all([
    loadRules(),
    prisma.workshop.findMany({
      where: { eventId: event.id },
      orderBy: [{ startDateTime: "asc" }],
      select: {
        id: true, slug: true, title: true, kind: true, capacity: true,
        waitlistCapacity: true, requiresApproval: true, isActive: true,
        startDateTime: true, endDateTime: true, locationName: true,
        partnerOrganization: true, shortDescription: true,
        bookings: {
          select: {
            id: true, status: true, bookedAt: true, waitlistPosition: true, approvedAt: true,
            user: { select: { id: true, name: true, email: true, organization: true, country: true } },
          },
          orderBy: { bookedAt: "asc" },
        },
      },
    }),
  ]);

  return (
    <>
      <PageHero
        eyebrow="Workspace · Training Week"
        title="Dashboard"
        description="Seat allocation, workshop capacity, registrants and email for Training Week."
        icon={<SlidersHorizontal />}
      />
      <TrainingAdmin
        eventId={event.id}
        eventTitle={event.title}
        rules={rules}
        workshops={workshops.map((w) => ({
          ...w,
          startDateTime: w.startDateTime.toISOString(),
          endDateTime: w.endDateTime.toISOString(),
          bookings: w.bookings.map((b) => ({
            ...b,
            bookedAt: b.bookedAt.toISOString(),
            approvedAt: b.approvedAt ? b.approvedAt.toISOString() : null,
            user: b.user ?? null,
          })),
        }))}
      />
    </>
  );
}
