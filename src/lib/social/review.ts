/**
 * Review notes on a social post: comments, and "please review" requests
 * aimed at a named teammate. Stored as audit-log rows
 * (`social.post.comment`) so they sit in the same trail as the edits.
 *
 * Pure module: no Prisma.
 */
import { z } from "zod";

/** The stream for posts the team writes from scratch (no generator, no standing tags). */
export const LINKEDIN_STREAM = "linkedin";
export const SOCIAL_PILLARS = ["engage", "experience", "equip"] as const;

export function isSocialPillar(value: unknown): value is (typeof SOCIAL_PILLARS)[number] {
  return SOCIAL_PILLARS.some((pillar) => pillar === value);
}

export const SocialCommentDetail = z.object({
  body: z.string(),
  reviewerId: z.string().nullable().optional(),
  reviewerName: z.string().nullable().optional(),
  emailed: z.boolean().optional(),
});

export interface SocialComment {
  id: string;
  author: string;
  at: string;
  body: string;
  reviewerName?: string | null;
  /** The review request was also emailed to the reviewer. */
  emailed?: boolean;
}

/** Where a teammate reviews one post (they sign in first if needed). */
export const reviewPath = (postId: string) => `/admin/workspace/marketing/social?post=${encodeURIComponent(postId)}`;

/** The "please review" email: who's asking, what to check, the link, and the post itself. */
export function reviewRequestEmail(o: { reviewerName: string; requesterName: string; title: string; note: string; body: string; link: string }) {
  const first = o.reviewerName.trim().split(/\s+/)[0] || "there";
  const excerpt = o.body.trim().length > 1200 ? `${o.body.trim().slice(0, 1200)}…` : o.body.trim();
  return {
    subject: `Please review: ${o.title}`.slice(0, 150),
    text:
      `Hi ${first},\n\n` +
      `${o.requesterName} asked you to review a LinkedIn post before it goes out.\n\n` +
      `${o.requesterName}'s note:\n${o.note.trim()}\n\n` +
      `Review, edit or approve it here:\n${o.link}\n\n` +
      `The post as it stands:\n----\n${excerpt}\n----\n\n` +
      `Edits you make are tracked, and nothing is published until someone approves it.`,
  };
}

/**
 * Who the post is waiting on: the latest review request made after the
 * post was last approved. An approval answers every request before it.
 */
export function waitingOn(comments: SocialComment[], approvedAt: string | null | undefined): string | null {
  const since = approvedAt ? Date.parse(approvedAt) : -Infinity;
  const open = comments.filter((c) => c.reviewerName && Date.parse(c.at) > since);
  return open.at(-1)?.reviewerName ?? null;
}
