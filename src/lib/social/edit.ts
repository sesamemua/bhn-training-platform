import type { Prisma } from "@prisma/client";
import { withSocialTags } from "./tags";
import type { SavedSocialText, SocialEditResponse } from "./edit-history";

const selectText = { id: true, body: true, status: true, editVersion: true, trackChanges: true } as const;

export async function editSocialPost(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: { id: string; body: string; expectedVersion: number; trackChanges: boolean },
): Promise<{ status: number; result: SocialEditResponse }> {
  const post = await tx.socialPost.findUnique({ where: { id: input.id }, select: selectText });
  if (!post) return { status: 404, result: { error: "Post not found." } };
  if (post.status === "published" || post.status === "skipped") {
    return { status: 409, result: { error: "This post can no longer be edited.", post } };
  }
  if (post.editVersion !== input.expectedVersion) {
    return { status: 409, result: { error: "Someone else changed this post. Review the latest version.", post } };
  }
  const body = withSocialTags(input.body.trim());
  if (!input.body.trim() || body.length > 6000) {
    return { status: 400, result: { error: "Use between 1 and 6,000 characters, including the standing tags." } };
  }
  const textChanged = body !== post.body;
  if (!textChanged && input.trackChanges === post.trackChanges) {
    return { status: 200, result: { ok: true, post } };
  }

  // Compare-and-swap protects both simultaneous editors and approval/status changes.
  const updated = await tx.socialPost.updateMany({
    where: { id: post.id, editVersion: post.editVersion, status: post.status, body: post.body },
    data: {
      body, trackChanges: input.trackChanges, editVersion: { increment: 1 },
      ...(textChanged ? { status: "draft", approvedAt: null, approvedById: null } : {}),
    },
  });
  if (updated.count !== 1) {
    const current = await tx.socialPost.findUnique({ where: { id: post.id }, select: selectText });
    return { status: 409, result: { error: "Someone else changed this post. Review the latest version.", ...(current ? { post: current } : {}) } };
  }
  const saved: SavedSocialText = {
    ...post, body, trackChanges: input.trackChanges, editVersion: post.editVersion + 1,
    status: textChanged ? "draft" : post.status,
  };
  if (!textChanged || !input.trackChanges) return { status: 200, result: { ok: true, post: saved } };

  const detail = { before: post.body, after: body, version: saved.editVersion };
  const entry = await tx.auditLog.create({
    data: { actorId, action: "social.post.edit", targetType: "socialPost", targetId: post.id, detail: JSON.stringify(detail) },
    select: { id: true, createdAt: true, actor: { select: { name: true } } },
  });
  return {
    status: 200,
    result: { ok: true, post: saved, change: { ...detail, id: entry.id, at: entry.createdAt.toISOString(), author: entry.actor.name ?? "Team member" } },
  };
}
