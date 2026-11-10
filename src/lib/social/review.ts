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
});

export interface SocialComment {
  id: string;
  author: string;
  at: string;
  body: string;
  reviewerName?: string | null;
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
