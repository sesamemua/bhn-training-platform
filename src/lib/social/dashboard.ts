import type { LinkedInSnapshot } from "@/lib/metrics/linkedin";

export interface SocialBriefItem {
  id: string;
  title: string;
  url: string;
  at: string;
  note: string;
}
export interface SocialQueueSnapshot {
  recent: SocialBriefItem[];
  publishedCount: number;
  scheduled: SocialBriefItem[];
  scheduledCount: number;
  next: SocialBriefItem[];
  dueCount: number;
}
export interface SocialBrief {
  recent: { posts: SocialBriefItem[]; count: number | null; reactions: number | null; comments: number | null; source: "LinkedIn" | "Platform records" };
  scheduled: { posts: SocialBriefItem[]; count: number | null };
  next: { posts: SocialBriefItem[]; due: number | null };
}

export function socialQueueItem(post: {
  id: string; body: string; assetSpec: unknown; status: string; scheduledFor: Date;
  publishedAt: Date | null; bufferPostId: string | null; publishError: string | null;
}, now: Date): SocialBriefItem {
  const spec = post.assetSpec && typeof post.assetSpec === "object" && !Array.isArray(post.assetSpec)
    ? post.assetSpec as Record<string, unknown> : {};
  const title = typeof spec.title === "string" && spec.title.trim() ? spec.title.trim() : post.body.trim().split(/\r?\n/)[0] || "Untitled post";
  const note = post.status === "publishing" || (post.status === "scheduled" && post.bufferPostId && post.scheduledFor <= now)
    ? "Check delivery" : post.publishError ? "Retry required" : post.status === "approved" ? "Ready to schedule"
    : post.status === "draft" ? "Needs approval" : post.status === "scheduled" && !post.bufferPostId ? "Needs scheduling"
    : post.status === "scheduled" ? "Scheduled" : "Published";
  return { id: post.id, title: title.slice(0, 140), url: `/admin/workspace/marketing/social?post=${encodeURIComponent(post.id)}`,
    at: (post.status === "published" && post.publishedAt ? post.publishedAt : post.scheduledFor).toISOString(), note };
}

export function buildSocialBrief(queue: SocialQueueSnapshot | null, linkedin: LinkedInSnapshot | null, now: Date): SocialBrief {
  const cutoff = now.getTime() - 48 * 60 * 60_000;
  const visible = linkedin?.posts?.filter(p => {
    const at = Date.parse(p.published);
    return at >= cutoff && at <= now.getTime();
  }).sort((a, b) => b.published.localeCompare(a.published));
  const useLinkedIn = !!visible?.length;
  // Public engagement is never assigned to a different, merely similar platform draft.
  const hasPerformance = visible !== undefined && visible !== null && (useLinkedIn || !queue?.publishedCount);
  return {
    recent: {
      posts: useLinkedIn ? visible.slice(0, 2).map(p => ({ id: p.url, title: p.text || "LinkedIn post", url: p.url, at: p.published,
        note: `${p.reactions} reactions · ${p.comments} comments` })) : queue?.recent.slice(0, 2) ?? [],
      count: useLinkedIn ? visible.length : queue?.publishedCount ?? (hasPerformance ? 0 : null),
      reactions: hasPerformance ? visible!.reduce((n, p) => n + p.reactions, 0) : null,
      comments: hasPerformance ? visible!.reduce((n, p) => n + p.comments, 0) : null,
      source: useLinkedIn || (!queue?.publishedCount && hasPerformance) ? "LinkedIn" : "Platform records",
    },
    scheduled: { posts: queue?.scheduled.slice(0, 2) ?? [], count: queue?.scheduledCount ?? null },
    next: { posts: queue?.next.slice(0, 2) ?? [], due: queue?.dueCount ?? null },
  };
}
