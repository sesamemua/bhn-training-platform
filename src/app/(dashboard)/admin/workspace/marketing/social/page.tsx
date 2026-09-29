/**
 * Workspace → Marketing → Social.
 *
 * The queue of posts drafted from live EQUIP cycles. Everything here is
 * a draft until a person approves it, and nothing on this platform can
 * publish to a network — the queue's job is to make the words and the
 * facts correct, and to stop a reminder going out with last month's
 * date on it.
 */
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { SocialQueue, type QueuePost } from "@/components/workspace/SocialQueue";
import { openCycles } from "@/lib/social/cycles";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";
import { findCompanyLogo, logoOverride } from "@/lib/social/company-logo";
import { SYMPOSIUM_SOCIAL_STREAM, syncSpeakerHighlights } from "@/lib/social/speakers";
import { CRS_EVENT_POST } from "@/lib/social/events";

export const dynamic = "force-dynamic";

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const { tab } = await searchParams;
  // Create once; revisiting the page must never overwrite someone's draft or graphic.
  await prisma.socialPost.createMany({ data: [CRS_EVENT_POST], skipDuplicates: true });

  const now = new Date();
  const cycles = await openCycles(prisma, now);
  const byId = new Map(cycles.map((c) => [c.deadlineId, c]));

  const event = await prisma.bhnEvent.findUnique({
    where: { slug: EVENT_SLUG },
    select: { id: true },
  });
  const speakers = event
    ? await prisma.speaker.findMany({
        where: { eventId: event.id },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true, fullName: true, title: true, organization: true,
          bio: true, photoUrl: true, sessionTitle: true, updatedAt: true,
        },
      })
    : [];
  await syncSpeakerHighlights(prisma, speakers, now);
  const speakersById = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const organizations = [...new Set(speakers.map((speaker) => speaker.organization).filter((name): name is string => !!name))];
  const companyLogos = new Map(event
    ? await Promise.all(organizations.map(async (name) => [name, await findCompanyLogo(prisma, event.id, name)] as const))
    : []);

  const rows = await prisma.socialPost.findMany({
    where: { status: { in: ["draft", "approved", "scheduled"] } },
    orderBy: [{ scheduledFor: "asc" }],
    take: 200,
  });

  const posts: QueuePost[] = rows
    .filter((r) => r.stream !== SYMPOSIUM_SOCIAL_STREAM || speakersById.has(r.deadlineId))
    .map((r) => {
    const cycle = byId.get(r.deadlineId);
    const speaker = r.stream === SYMPOSIUM_SOCIAL_STREAM
      ? speakersById.get(r.deadlineId)
      : undefined;
    return {
      id: r.id,
      stream: r.stream,
      kind: r.kind,
      status: r.status,
      cycleLabel: r.stream === "events"
        ? (r.assetSpec as { title?: string } | null)?.title ?? "Event"
        : speaker?.fullName ?? cycle?.cycleLabel ?? "Closed cycle",
      daysBefore: r.daysBefore,
      body: r.body,
      editVersion: r.editVersion,
      trackChanges: r.trackChanges,
      assetUrl: speaker?.photoUrl ? `/api/admin/social/posts/${r.id}/image` : r.assetUrl,
      organization: speaker?.organization ?? null,
      companyLogoUrl: logoOverride(r.assetSpec) ?? (speaker?.organization ? companyLogos.get(speaker.organization) ?? null : null),
      assetSpec: r.assetSpec,
      scheduledFor: r.scheduledFor.toISOString(),
      overdue: r.stream === "venture_connect" && r.scheduledFor.getTime() < now.getTime(),
      /*
       * The one thing the queue knows that the post does not.
       *
       * An approved post is never regenerated — somebody read those
       * exact words and said yes. If the cycle's deadline has since
       * moved, the date inside it is wrong and only this comparison can
       * say so.
       */
      stale: speaker
        ? speaker.updatedAt.getTime() > (r.approvedAt ?? r.updatedAt).getTime()
        : r.status === "approved" &&
          cycle !== undefined &&
          r.kind === "reminder" &&
          Math.abs(
            cycle.deadlineAt.getTime() - r.daysBefore * 86_400_000 - r.scheduledFor.getTime(),
          ) > 36 * 3_600_000,
    };
  });

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · Marketing"
        title="Social"
        description="Draft, review and prepare social posts for events, VentureConnect and the 2026 Symposium. Posts stay here until a person approves and shares them."
        icon={<Megaphone />}
      />
      <div className="mt-6">
        <SocialQueue initial={posts} initialGroup={tab === "events" ? "events" : "symposium_2026"} />
      </div>
    </>
  );
}
