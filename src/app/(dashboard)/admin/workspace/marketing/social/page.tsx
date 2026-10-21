/**
 * Workspace → Marketing → Social.
 *
 * The queue of posts drafted from live EQUIP cycles. Everything here is
 * a draft until a person approves it. Direct publishing uses Buffer
 * and requires a separate, explicit publishing confirmation.
 */
import { notFound, redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { SocialQueue, type QueuePost } from "@/components/workspace/SocialQueue";
import { openCycles } from "@/lib/social/cycles";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";
import { findCompanyLogo, logoOverride } from "@/lib/social/company-logo";
import { SYMPOSIUM_SOCIAL_STREAM } from "@/lib/social/speakers";
import { CRS_EVENT_POST } from "@/lib/social/events";
import { SYMPOSIUM_CAMPAIGN_PLAN } from "@/lib/social/symposium-campaign";
import { withSocialTags } from "@/lib/social/tags";
import { loadSocialOrder } from "@/lib/social/order-store";
import { SYMPOSIUM_DAY_POSTS, SYMPOSIUM_DAY_PREFIX, SYMPOSIUM_DAY_NOTE } from "@/lib/social/symposium-day";
import { loadSymposiumDayOrder } from "@/lib/social/symposium-day-store";
import { SOCIAL_SOURCE_PREFIX, socialSource } from "@/lib/social/graphic-source";
import { isApproval, isReviewer, pagesOf, reviewerStates } from "@/lib/design-review/types";
import type { ArtworkViewData } from "@/components/workspace/DesignArtworkView";

export const dynamic = "force-dynamic";

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ tab?: string; post?: string; series?: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const { tab, post: postId, series } = await searchParams;
  const seriesReview = series === "symposium_2026";
  if (postId !== undefined && (!postId || typeof postId !== "string")) notFound();
  if (series !== undefined && (!seriesReview || postId !== undefined)) notFound();
  const socialOrder = await loadSocialOrder().catch(() => null);
  // Create once; revisiting the page must never overwrite someone's draft or graphic.
  const campaignByKey = new Map(SYMPOSIUM_CAMPAIGN_PLAN.map((post) => [`events:event:${post.slug}:0`, post]));
  await prisma.socialPost.createMany({ data: [CRS_EVENT_POST, ...SYMPOSIUM_DAY_POSTS, ...SYMPOSIUM_CAMPAIGN_PLAN.map((post) => ({
    stream: "events", kind: "event", deadlineId: post.slug,
    key: `events:event:${post.slug}:0`, body: withSocialTags(post.body),
    scheduledFor: new Date(post.suggestedDate),
    assetUrl: post.assetUrl ?? null,
    assetSpec: { title: post.title, campaign: "2026-symposium-training-week", sourceUrl: post.sourceUrl,
      graphicBrief: post.graphicBrief, ...(post.photoBrief ? { photoBrief: post.photoBrief } : {}) },
  }))], skipDuplicates: true });
  const dayOrder = await loadSymposiumDayOrder().catch(() => null);

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
  const speakersById = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const organizations = [...new Set(speakers.map((speaker) => speaker.organization).filter((name): name is string => !!name))];
  const companyLogos = new Map(event
    ? await Promise.all(organizations.map(async (name) => [name, await findCompanyLogo(prisma, event.id, name)] as const))
    : []);

  const rows = await prisma.socialPost.findMany({
    where: seriesReview ? { key: { in: [...campaignByKey.keys()] } } : postId ? { id: postId } : { OR: [
      { status: { in: ["draft", "approved", "scheduled", "publishing"] } },
      { key: { in: [...campaignByKey.keys()] } },
    ] },
    include: { approvedBy: { select: { name: true } } },
    orderBy: [{ scheduledFor: "asc" }],
    take: 200,
  });

  // Comments pinned on each post's graphic, kept in Design Review's records and shown in the post's card.
  const reviewed = await prisma.designArtwork.findMany({
    where: { sourceName: { in: rows.map((r) => socialSource(r.id)) } },
    include: { project: { select: { name: true } }, pins: { orderBy: { createdAt: "asc" } }, reviews: true },
  });
  const reviewers = reviewed.length
    ? (await prisma.user.findMany({
        where: { role: { in: ["instructor", "admin", "superadmin"] }, NOT: [{ email: { contains: "demo" } }, { email: { endsWith: ".test" } }] },
        select: { id: true, name: true, email: true }, orderBy: { name: "asc" },
      })).map((u) => ({ id: u.id, name: u.name || u.email || "Team member" })).filter((u) => isReviewer(u.name))
    : [];
  const reviewOf = new Map(reviewed.map((a): [string, ArtworkViewData] => [a.sourceName.slice(SOCIAL_SOURCE_PREFIX.length), {
    id: a.id, title: a.title, description: a.description, pages: pagesOf(a.pages),
    approval: isApproval(a.approval) ? a.approval : "pending", approvalNote: a.approvalNote, approvalAt: a.approvalAt?.toISOString() ?? null,
    round: a.round, locked: !!a.lockedAt, project: a.project.name,
    pins: a.pins.map((n) => ({ id: n.id, page: n.page, x: n.x, y: n.y, parentId: n.parentId, authorId: n.authorId, authorName: n.authorName, body: n.body, status: n.status, round: n.round, createdAt: n.createdAt.toISOString() })),
    reviewers: reviewerStates(reviewers, a.reviews),
  }]));
  const u = session.user as { id?: string; name?: string | null; email?: string | null; role?: string };
  const me = { id: u.id ?? "", name: u.name || u.email || "Team member", admin: u.role === "admin" || u.role === "superadmin" };

  const posts: QueuePost[] = rows
    .filter((r) => r.stream !== SYMPOSIUM_SOCIAL_STREAM || speakersById.has(r.deadlineId))
    .map((r) => {
    const cycle = byId.get(r.deadlineId);
    const campaign = campaignByKey.get(r.key);
    const speaker = r.stream === SYMPOSIUM_SOCIAL_STREAM
      ? speakersById.get(r.deadlineId)
      : undefined;
    return {
      id: r.id,
      stream: r.stream,
      kind: r.kind,
      status: r.status,
      bufferPostId: r.bufferPostId,
      publishError: r.publishError,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedByName: r.approvedBy?.name ?? null,
      symposiumDay: r.key.startsWith(SYMPOSIUM_DAY_PREFIX),
      cycleLabel: r.stream === "events"
        ? campaign?.title ?? (r.assetSpec as { title?: string } | null)?.title ?? "Event"
        : speaker?.fullName ?? cycle?.cycleLabel ?? "Closed cycle",
      daysBefore: r.daysBefore,
      body: r.body,
      editVersion: r.editVersion,
      trackChanges: r.trackChanges,
      assetUrl: speaker?.photoUrl ? `/api/admin/social/posts/${r.id}/image` : r.assetUrl,
      organization: speaker?.organization ?? null,
      companyLogoUrl: logoOverride(r.assetSpec) ?? (speaker?.organization ? companyLogos.get(speaker.organization) ?? null : null),
      assetSpec: r.assetSpec,
      campaign: !!campaign,
      campaignSlug: r.key.startsWith(SYMPOSIUM_DAY_PREFIX) ? r.id : campaign?.slug,
      requiresPhoto: !!campaign?.photoBrief,
      visualBrief: campaign?.photoBrief ?? campaign?.graphicBrief,
      publicationNote: r.key.startsWith(SYMPOSIUM_DAY_PREFIX) ? SYMPOSIUM_DAY_NOTE : campaign ? campaign.photoBrief
        ? "Hold until real photos are uploaded and the pictured activity is confirmed. Check participant consent and host permission before approval."
        : campaign.workshopSlug
        ? "Recheck registration status and the recommended seat plan before sharing. Do not promise a seat."
        : "Verify the current program and registration link before sharing."
        : undefined,
      scheduledFor: r.scheduledFor.toISOString(),
      graphicReview: reviewOf.get(r.id) ?? null,
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
  if (postId && !posts.length) notFound();

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · Marketing"
        title={seriesReview ? "Series review" : postId ? "Post review" : "Social"}
        description={postId || seriesReview ? undefined : "Draft, review and prepare social posts for events, VentureConnect and the 2026 Symposium. Posts stay here until a person approves and shares them."}
        icon={<Megaphone />}
      />
      <div className="mt-6">
        <SocialQueue key={series ?? postId ?? tab ?? "social"} initial={posts} initialOrder={socialOrder} initialDayOrder={dayOrder} reviewMode={!!postId} seriesReview={seriesReview} initialGroup={tab === "symposium_day" ? "symposium_day" : tab === "events" ? "events" : tab === "venture_connect" ? "venture_connect" : "symposium_2026"} me={me} />
      </div>
    </>
  );
}
