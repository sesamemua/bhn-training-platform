"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrief } from "@/lib/page-review/brief";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";

export async function getNewsletterReviewComments(input: unknown) {
  if (!await requireRole("instructor").catch(() => null)) return { ok: false, error: "Forbidden" } as const;
  const parsed = z.string().min(1).max(150).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid issue." } as const;
  const id = parsed.data;
  const issue = await prisma.newsletterIssue.findUnique({ where: { id }, select: { title: true } });
  if (!issue) return { ok: false, error: "Issue not found." } as const;
  const [review, earlier] = await Promise.all([
    prisma.pageReview.findUnique({ where: { id: `newsletter-${id}` }, select: {
      round: true, comments: { orderBy: { createdAt: "asc" }, take: PAGE_REVIEW_COMMENT_LIMIT },
    } }),
    prisma.newsletterComment.findMany({ where: { issueId: id, status: "open" }, orderBy: { createdAt: "asc" } }),
  ]);
  const round = review?.round ?? 1;
  const comments = [...(review?.comments ?? []), ...earlier.map((note) => ({
    id: note.id, parentId: null, round, body: note.body, status: note.status,
    authorName: note.authorName || "Team member", authorKind: "user", editedByName: note.editedByName,
    anchorQuote: note.anchorQuote, anchorKey: `Earlier newsletter note${note.anchorLabel ? `: ${note.anchorLabel}` : ""}`,
    anchorPath: note.cssPath, anchorBlock: note.pieceId, anchorState: "found", createdAt: note.createdAt,
  }))];
  // Copy is read-only: exporting a website brief would lock the review.
  return { ok: true, brief: buildBrief({
    title: issue.title, round, comments,
    url: `${(process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "")}/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(id)}`,
  }) } as const;
}
