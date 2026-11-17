"use server";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrief } from "@/lib/page-review/brief";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";
import { reviewSentHistory } from "@/lib/page-review/staff-history";
import { trainingEmailReviewId, trainingEmailReviewLink } from "@/lib/training-week/email-review";
import { reportTransaction } from "@/lib/symposium-report/store";
import { loadTrainingEmailReview } from "./email-review-actions";

export async function copyTrainingReviewFeedback(eventId: string) {
  if (!await requireRole("admin").catch(() => null) || !/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)) throw new Error("Forbidden");
  const review = await prisma.pageReview.findUnique({ where: { id: trainingEmailReviewId(eventId) }, select: {
    title: true, round: true, comments: { orderBy: { createdAt: "asc" }, take: PAGE_REVIEW_COMMENT_LIMIT },
  } });
  if (!review) throw new Error("No such review");
  return buildBrief({ ...review, url: new URL(trainingEmailReviewLink(eventId), process.env.NEXTAUTH_URL || "https://bhn-training-platform.vercel.app").href });
}

export async function trainingReviewSentHistory(eventId: string) {
  if (!await requireRole("admin").catch(() => null) || !/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)) throw new Error("Forbidden");
  return reviewSentHistory("training_week.email_review.invite", trainingEmailReviewId(eventId));
}

export async function approveTrainingReview(eventId: string, round: number) {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId || !/^[a-zA-Z0-9_-]{1,100}$/.test(eventId) || !Number.isSafeInteger(round)) return { ok: false, error: "Admin access required." };
  const loaded = await loadTrainingEmailReview(eventId);
  if (!loaded.ok || loaded.bundle.stale || loaded.bundle.review?.round !== round) return { ok: false, error: "Save the current revision first." };
  const id = trainingEmailReviewId(eventId);
  return reportTransaction(async (tx) => {
    const outstanding = await tx.pageComment.count({ where: { reviewId: id, status: "open", parentId: null } });
    if (outstanding) return { ok: false, error: "Resolve outstanding review threads before approving." };
    const changed = await tx.pageReview.updateMany({ where: { id, round, status: "open" }, data: { status: "approved" } });
    if (!changed.count) return { ok: false, error: "This round changed. Reload before approving." };
    await tx.auditLog.create({ data: { actorId, action: "training_week.email_review.approve", targetType: "pageReview", targetId: id, detail: JSON.stringify({ round }) } });
    return { ok: true };
  });
}
