"use server";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviewInviteUserIds, sendStaffReviewInvites } from "@/lib/workspace-review-invites";
import { reviewSentHistory } from "@/lib/page-review/staff-history";

const ACTION = "design.review.invite";

export async function sendDesignReviewGroup(id: string, round: number, ids: string[]) {
  const session = await requireRole("instructor").catch(() => null);
  const actor = session?.user as { id?: string; name?: string; email?: string } | undefined;
  if (!actor?.id || !reviewInviteUserIds.safeParse(ids).success) return { sent: [], error: "Choose active staff reviewers." };
  const artwork = await prisma.designArtwork.findUnique({ where: { id }, select: { title: true, round: true, lockedAt: true } });
  if (!artwork || artwork.round !== round || artwork.lockedAt) return { sent: [], error: "Open the current review round before inviting colleagues." };
  const result = await sendStaffReviewInvites({ actor: { ...actor, id: actor.id }, userIds: ids, title: artwork.title,
    path: `/review/design/${encodeURIComponent(id)}`, instructions: "Sign in to leave feedback on the current artwork.",
    audit: { action: ACTION, targetType: "designArtwork", targetId: id, round } });
  const at = new Date();
  await Promise.all(result.sent.map((userId) => prisma.designReview.upsert({
    where: { artworkId_userId: { artworkId: id, userId } },
    create: { artworkId: id, userId, userName: "Team member", requestedAt: at, requestedByName: actor.name },
    update: { requestedAt: at, requestedByName: actor.name },
  }).catch(() => null)));
  return result;
}

export async function designReviewSentHistory(id: string) {
  if (!await requireRole("instructor").catch(() => null)) throw new Error("Forbidden");
  return reviewSentHistory(ACTION, id);
}
