/**
 * Authenticated cross-origin collaboration for the live-page review overlay.
 * A signed reviewer credential is scoped to one review and carries the
 * colleague's platform identity; the share token alone grants no read/write.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  PAGE_REVIEW_COMMENT_LIMIT,
  PAGE_REVIEW_RATE_MAX,
  PAGE_REVIEW_RATE_WINDOW_MS,
} from "@/lib/page-review/limits";
import { verifyPageReviewViewerToken } from "@/lib/page-review/viewer";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "private, no-store",
};

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) =>
      value
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

const CommentSchema = z.object({
  body: z.string().trim().min(2, "Say a little more.").max(4000),
  parentId: z.string().min(1).max(64).optional().nullable(),
  anchorQuote: oneLine(600).optional().nullable(),
  anchorKey: oneLine(300).optional().nullable(),
  anchorPath: oneLine(600).optional().nullable(),
  anchorBlock: oneLine(200).optional().nullable(),
});

const UpdateCommentSchema = z.object({
  id: z.string().min(1).max(64),
  body: z.string().trim().min(2, "Say a little more.").max(4000),
});

const DeleteCommentSchema = z.object({
  id: z.string().min(1).max(64),
});

const COMMENT_SELECT = {
  id: true,
  parentId: true,
  round: true,
  anchorQuote: true,
  anchorKey: true,
  anchorPath: true,
  anchorBlock: true,
  anchorState: true,
  authorUserId: true,
  authorName: true,
  authorKind: true,
  body: true,
  status: true,
  editedAt: true,
  editedByName: true,
  createdAt: true,
} as const;

/**
 * Strips the author's user id and replaces it with a plain "is this mine"
 * flag — the overlay never needs to know who anyone is, only whether a
 * comment is the viewer's own.
 *
 * Named isMine rather than canEdit because it no longer gates editing:
 * every reviewer can edit every comment. It now only decides wording, e.g.
 * whether a confirmation says "your comment" or names the author.
 */
function commentForViewer<T extends { authorUserId: string | null }>(comment: T, viewerUserId: string) {
  const { authorUserId, ...publicComment } = comment;
  return { ...publicComment, isMine: authorUserId === viewerUserId };
}

/**
 * Writes stop the moment a round is exported: someone is working from that
 * brief, and the round they were handed should not move under them. Reading
 * stays open so the panel can still show what was filed. Starting the next
 * round reopens it.
 */
function writeBlock(review: { status: string; round: number }) {
  if (review.status === "closed") return { error: "This review is closed." };
  if (review.status !== "open") {
    return { error: `Round ${review.round} was exported and is locked. It reopens when the next round starts.` };
  }
  return null;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

async function viewerFor(req: NextRequest, reviewId: string) {
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifyPageReviewViewerToken(match[1], reviewId);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token },
    select: { id: true, title: true, round: true, status: true },
  });
  if (!review) return json({ error: "This review link is no longer active." }, 404);
  if (review.status === "closed") return json({ error: "This review is closed." }, 409);

  const viewer = await viewerFor(req, review.id);
  if (!viewer) {
    return json({ error: "Open this review from the training platform to join as yourself." }, 401);
  }

  // Everything filed this round, plus anything still open from an earlier
  // one. Reopening a comment after a page revision is rolled back leaves it
  // in the round it was raised in, so a plain round filter made carried-over
  // items invisible on the very page they are about — the workspace list and
  // the brief already work this way.
  const comments = await prisma.pageComment.findMany({
    where: {
      reviewId: review.id,
      OR: [{ round: review.round }, { status: "open" }],
    },
    orderBy: { createdAt: "asc" },
    take: PAGE_REVIEW_COMMENT_LIMIT,
    select: COMMENT_SELECT,
  });

  return json({
    ok: true,
    review: { title: review.title, round: review.round, status: review.status },
    viewer: { id: viewer.userId, name: viewer.name },
    comments: comments.map((comment) => commentForViewer(comment, viewer.userId)),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token },
    select: { id: true, round: true, status: true },
  });
  if (!review) return json({ error: "This review link is no longer active." }, 404);
  const blocked = writeBlock(review);
  if (blocked) return json(blocked, 409);

  const viewer = await viewerFor(req, review.id);
  if (!viewer) {
    return json({ error: "Open this review from the training platform to join as yourself." }, 401);
  }

  const parsed = CommentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Check the comment." }, 400);
  }
  const data = parsed.data;

  const [recentCount, totalCount] = await prisma.$transaction([
    prisma.pageComment.count({
      where: {
        reviewId: review.id,
        createdAt: { gte: new Date(Date.now() - PAGE_REVIEW_RATE_WINDOW_MS) },
      },
    }),
    prisma.pageComment.count({ where: { reviewId: review.id } }),
  ]);
  if (recentCount >= PAGE_REVIEW_RATE_MAX) {
    return NextResponse.json(
      { error: "This review is receiving comments too quickly. Try again in a minute." },
      { status: 429, headers: { ...CORS, "Retry-After": "60" } },
    );
  }
  if (totalCount >= PAGE_REVIEW_COMMENT_LIMIT) {
    return json({ error: "This review has reached its comment limit." }, 409);
  }

  let parentId: string | null = null;
  let anchors = {
    anchorQuote: data.anchorQuote ?? null,
    anchorKey: data.anchorKey ?? null,
    anchorPath: data.anchorPath ?? null,
    anchorBlock: data.anchorBlock ?? null,
  };
  if (data.parentId) {
    const parent = await prisma.pageComment.findFirst({
      where: { id: data.parentId, reviewId: review.id },
      select: {
        id: true,
        parentId: true,
        anchorQuote: true,
        anchorKey: true,
        anchorPath: true,
        anchorBlock: true,
      },
    });
    if (!parent) return json({ error: "That thread is gone." }, 404);
    parentId = parent.parentId ?? parent.id;
    anchors = {
      anchorQuote: parent.anchorQuote,
      anchorKey: parent.anchorKey,
      anchorPath: parent.anchorPath,
      anchorBlock: parent.anchorBlock,
    };
  }

  const comment = await prisma.pageComment.create({
    data: {
      reviewId: review.id,
      parentId,
      round: review.round,
      ...anchors,
      authorUserId: viewer.userId,
      authorName: viewer.name,
      // From the signed token, never from the request body: whoever
      // holds a share link must not be able to file comments as though
      // they were a platform account.
      authorKind: viewer.kind,
      body: data.body,
    },
    select: COMMENT_SELECT,
  });
  await prisma.pageReview.update({ where: { id: review.id }, data: { updatedAt: new Date() } });

  return json({ ok: true, comment: commentForViewer(comment, viewer.userId) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token },
    select: { id: true, round: true, status: true },
  });
  if (!review) return json({ error: "This review link is no longer active." }, 404);
  const blocked = writeBlock(review);
  if (blocked) return json(blocked, 409);

  const viewer = await viewerFor(req, review.id);
  if (!viewer) {
    return json({ error: "Open this review from the training platform to join as yourself." }, 401);
  }

  const parsed = UpdateCommentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Check the comment." }, 400);
  }

  const existing = await prisma.pageComment.findFirst({
    where: { id: parsed.data.id, reviewId: review.id },
    select: { id: true, authorUserId: true },
  });
  if (!existing) return json({ error: "That comment is gone." }, 404);
  // No ownership check — any reviewer can edit any comment, matching the
  // workspace page. The signed viewer credential is still required, so a
  // bare share token cannot reach this. The editor is recorded because the
  // author's name no longer accounts for the wording.
  const comment = await prisma.pageComment.update({
    where: { id: existing.id },
    data: {
      body: parsed.data.body,
      editCount: { increment: 1 },
      editedAt: new Date(),
      editedById: viewer.userId,
      editedByName: viewer.name,
    },
    select: COMMENT_SELECT,
  });
  await prisma.pageReview.update({ where: { id: review.id }, data: { updatedAt: new Date() } });

  return json({ ok: true, comment: commentForViewer(comment, viewer.userId) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token },
    select: { id: true, round: true, status: true },
  });
  if (!review) return json({ error: "This review link is no longer active." }, 404);
  const blocked = writeBlock(review);
  if (blocked) return json(blocked, 409);

  const viewer = await viewerFor(req, review.id);
  if (!viewer) {
    return json({ error: "Open this review from the training platform to join as yourself." }, 401);
  }

  const parsed = DeleteCommentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Choose a comment to delete." }, 400);

  const existing = await prisma.pageComment.findFirst({
    where: { id: parsed.data.id, reviewId: review.id },
    select: { id: true, parentId: true, authorUserId: true },
  });
  if (!existing) return json({ error: "That comment is gone." }, 404);
  // No ownership check — a review is a shared workspace and any reviewer can
  // clear out any comment, matching the platform page. The signed viewer
  // credential is still required, so this is not open to a bare share token.
  // Editing stays author-only above: tidying up is not the same as rewording
  // someone else's point.

  const deleted = await prisma.pageComment.deleteMany({
    where: {
      reviewId: review.id,
      OR: [{ id: existing.id }, { parentId: existing.id }],
    },
  });
  await prisma.pageReview.update({ where: { id: review.id }, data: { updatedAt: new Date() } });

  return json({ ok: true, deletedCount: deleted.count, deletedThread: existing.parentId === null });
}
