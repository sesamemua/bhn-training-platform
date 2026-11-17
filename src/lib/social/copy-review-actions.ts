"use server";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportTransaction } from "@/lib/symposium-report/store";
import { reviewInviteUserIds, sendStaffReviewInvites, staffReviewRecipients } from "@/lib/workspace-review-invites";
import { reviewSentHistory } from "@/lib/page-review/staff-history";
import { SocialCommentDetail } from "./review";
import { canReviewSocialCopy, socialCopyReviewId, socialCopyReviewPath, socialCopySnapshot } from "./copy-review";

const INVITE = "social.copy_review.invite";

export async function saveSocialCopyReview(postId: string, expectedRound: number, expectedVersion: number) {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return { ok: false, error: "Admin access required." };
  const id = socialCopyReviewId(postId);
  return reportTransaction(async (tx) => {
    const post = await tx.socialPost.findUnique({ where: { id: postId }, select: { status: true, editVersion: true, body: true, assetSpec: true } });
    if (!post || !canReviewSocialCopy(post.status)) return { ok: false, error: "This post is no longer open for review." };
    if (post.editVersion !== expectedVersion) return { ok: false, error: "The draft changed. Refresh before saving a revision." };
    const snapshot = socialCopySnapshot(post.body, post.assetSpec);
    const serialized = JSON.stringify(snapshot);
    const current = await tx.pageReview.findUnique({ where: { id }, select: { kind: true, round: true, status: true, pastedHtml: true } });
    if (!current) {
      if (expectedRound !== 0) return { ok: false, error: "This review changed. Reload before saving." };
      await tx.pageReview.create({ data: { id, kind: "social", url: socialCopyReviewPath(postId), title: snapshot.title, pastedHtml: serialized, createdById: actorId } });
      const legacy = await tx.auditLog.findMany({
        where: { action: "social.post.comment", targetType: "socialPost", targetId: postId },
        select: { id: true, detail: true, createdAt: true, actorId: true, actor: { select: { name: true } } },
        orderBy: { createdAt: "asc" }, take: 1000,
      });
      const imported = legacy.flatMap((note) => {
        try {
          const detail = SocialCommentDetail.safeParse(JSON.parse(note.detail ?? "null"));
          if (!detail.success || detail.data.reviewerId || detail.data.reviewerName) return [];
          return [{ reviewId: id, authorUserId: note.actorId, authorName: note.actor.name ?? "Team member", body: detail.data.body, createdAt: note.createdAt }];
        } catch { return []; }
      });
      if (imported.length) await tx.pageComment.createMany({ data: imported });
      return { ok: true };
    }
    if (current.kind !== "social" || current.status === "closed" || current.round !== expectedRound) return { ok: false, error: "This review changed. Reload before saving." };
    if (current.pastedHtml === serialized) return { ok: true };
    if (current.pastedHtml) await tx.pageReviewVersion.create({ data: { reviewId: id, round: current.round, html: current.pastedHtml } });
    await tx.pageReview.update({ where: { id }, data: { round: { increment: 1 }, title: snapshot.title, status: "open", pastedHtml: serialized } });
    return { ok: true };
  });
}

export async function sendSocialCopyReviewGroup(postId: string, round: number, ids: string[]) {
  const session = await requireRole("admin").catch(() => null);
  const actor = session?.user as { id?: string; name?: string; email?: string } | undefined;
  if (!actor?.id || !reviewInviteUserIds.safeParse(ids).success) return { sent: [], error: "Choose active admins for this review." };
  const [review, post, count] = await Promise.all([
    prisma.pageReview.findUnique({ where: { id: socialCopyReviewId(postId) }, select: { title: true, round: true, status: true, pastedHtml: true } }),
    prisma.socialPost.findUnique({ where: { id: postId }, select: { status: true, body: true, assetSpec: true } }),
    prisma.user.count({ where: { ...staffReviewRecipients, id: { in: ids }, role: { in: ["admin", "superadmin"] } } }),
  ]);
  if (count !== new Set(ids).size) return { sent: [], error: "One or more people in this group do not have Social admin access. Use the individual reviewer picker." };
  if (!review || review.round !== round || review.status !== "open" || !post || !canReviewSocialCopy(post.status) ||
      review.pastedHtml !== JSON.stringify(socialCopySnapshot(post.body, post.assetSpec))) {
    return { sent: [], error: "Save the current draft as a review revision before inviting colleagues." };
  }
  return sendStaffReviewInvites({ actor: { ...actor, id: actor.id }, userIds: ids, title: review.title, path: socialCopyReviewPath(postId),
    instructions: "Sign in with your Social admin account to review the post. This does not publish anything.",
    audit: { action: INVITE, targetType: "socialPost", targetId: postId, round } });
}

export async function socialCopyReviewSentHistory(postId: string) {
  if (!await requireRole("admin").catch(() => null)) throw new Error("Forbidden");
  return reviewSentHistory(INVITE, postId);
}
