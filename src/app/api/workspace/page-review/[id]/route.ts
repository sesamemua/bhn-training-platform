/**
 * Website review — one review.
 *
 *   POST /api/workspace/page-review/[id]  { action, ... }
 *   DELETE /api/workspace/page-review/[id]  (admin only)
 *
 *     addComment    (instructor+) — new thread, or a reply via parentId
 *     editComment   (any instructor+) — records who edited
 *     deleteComment (any instructor+) — cascades to its replies
 *     setStatus     (instructor+) — open | resolved | wontfix
 *     reopenComment (instructor+) — a settled item is outstanding again
 *     reopenRound   (admin)       — reopen everything a round settled
 *     export        (admin)       — build the brief of everything open
 *     startNextRound (admin)      — resolve current items and advance
 *
 * Editing preserves an audit trail via editCount/editedAt rather than a
 * separate history table: reviewers care that a comment changed and when,
 * not what every intermediate wording was.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrief } from "@/lib/page-review/brief";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";

export const dynamic = "force-dynamic";

const AddSchema = z.object({
  action: z.literal("addComment"),
  body: z.string().trim().min(2, "Say a little more.").max(4000),
  parentId: z.string().min(1).optional().nullable(),
  anchorQuote: z.string().trim().max(600).optional().nullable(),
  anchorKey: z.string().trim().max(300).optional().nullable(),
  anchorPath: z.string().trim().max(600).optional().nullable(),
  anchorBlock: z.string().trim().max(200).optional().nullable(),
});
const EditSchema = z.object({
  action: z.literal("editComment"),
  commentId: z.string().min(1),
  body: z.string().trim().min(2).max(4000),
});
const DeleteSchema = z.object({ action: z.literal("deleteComment"), commentId: z.string().min(1) });
const StatusSchema = z.object({
  action: z.literal("setStatus"),
  commentId: z.string().min(1),
  status: z.union([z.literal("open"), z.literal("resolved"), z.literal("wontfix")]),
});
const NextRoundSchema = z.object({ action: z.literal("startNextRound") });
const ReopenSchema = z.object({ action: z.literal("reopenComment"), commentId: z.string().min(1) });
const ReopenRoundSchema = z.object({ action: z.literal("reopenRound"), round: z.number().int().min(1) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meId = (session.user as { id?: string }).id ?? null;
  const meName = (session.user as { name?: string }).name ?? "Someone";
  const role = (session.user as { role?: string }).role ?? "";
  const isAdmin = role === "admin" || role === "superadmin";

  const review = await prisma.pageReview.findUnique({
    where: { id },
    select: { id: true, url: true, title: true, round: true, status: true },
  });
  if (!review) return NextResponse.json({ error: "No such review." }, { status: 404 });

  // Exporting hands the round to whoever is making the changes, so the round
  // freezes there: the brief someone is working from stays exactly what the
  // reviewers signed off. Starting the next round reopens it. Closed reviews
  // never accept writes again.
  //
  // Export itself stays available while locked — re-copying the same brief
  // changes nothing — and startNextRound is the way out.
  const WRITE_ACTIONS = ["addComment", "editComment", "deleteComment", "setStatus", "reopenComment", "reopenRound"];
  if (review.status !== "open" && WRITE_ACTIONS.includes(action)) {
    return NextResponse.json(
      {
        error: review.status === "closed"
          ? "This review is closed."
          : `Round ${review.round} was exported and is locked. Start Round ${review.round + 1} to comment again.`,
        locked: true,
      },
      { status: 409 },
    );
  }

  // ── add ──────────────────────────────────────────────────────
  if (action === "addComment") {
    const p = AddSchema.safeParse(body);
    if (!p.success) {
      return NextResponse.json({ error: p.error.issues[0]?.message ?? "Check the comment." }, { status: 400 });
    }
    const commentCount = await prisma.pageComment.count({ where: { reviewId: id } });
    if (commentCount >= PAGE_REVIEW_COMMENT_LIMIT) {
      return NextResponse.json(
        { error: "This review has reached its comment limit. Open a new review to continue." },
        { status: 409 },
      );
    }
    // A reply inherits its parent's anchor — the thread is about one element.
    let anchors = {
      anchorQuote: p.data.anchorQuote ?? null,
      anchorKey: p.data.anchorKey ?? null,
      anchorPath: p.data.anchorPath ?? null,
      anchorBlock: p.data.anchorBlock ?? null,
    };
    if (p.data.parentId) {
      const parent = await prisma.pageComment.findFirst({
        where: { id: p.data.parentId, reviewId: id },
        select: { anchorQuote: true, anchorKey: true, anchorPath: true, anchorBlock: true },
      });
      if (!parent) return NextResponse.json({ error: "That thread is gone." }, { status: 404 });
      anchors = parent;
    }
    await prisma.pageComment.create({
      data: {
        reviewId: id,
        parentId: p.data.parentId ?? null,
        round: review.round,
        ...anchors,
        authorUserId: meId,
        authorName: meName,
        authorKind: "user",
        body: p.data.body,
      },
    });
    await touch(id);
    return NextResponse.json({ ok: true, ...(await load(id)) });
  }

  // ── edit ─────────────────────────────────────────────────────
  if (action === "editComment") {
    const p = EditSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Check the comment." }, { status: 400 });
    const c = await prisma.pageComment.findFirst({
      where: { id: p.data.commentId, reviewId: id },
      select: { id: true, authorUserId: true },
    });
    if (!c) return NextResponse.json({ error: "No such comment." }, { status: 404 });
    // Any reviewer can edit any comment — corrections land in place instead
    // of as a reply nobody reads. Because that means the author's name no
    // longer accounts for the wording, the editor is recorded and shown
    // wherever the comment is: the thread, the overlay, and the brief.
    await prisma.pageComment.update({
      where: { id: c.id },
      data: {
        body: p.data.body,
        editCount: { increment: 1 },
        editedAt: new Date(),
        editedById: meId,
        editedByName: meName,
      },
    });
    await touch(id);
    return NextResponse.json({ ok: true, ...(await load(id)) });
  }

  // ── delete ───────────────────────────────────────────────────
  if (action === "deleteComment") {
    const p = DeleteSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const c = await prisma.pageComment.findFirst({
      where: { id: p.data.commentId, reviewId: id },
      select: { id: true, authorUserId: true },
    });
    if (!c) return NextResponse.json({ error: "No such comment." }, { status: 404 });
    // Deliberately no ownership check: a review is a shared workspace, and
    // anyone reviewing the page can clear out a comment — their own, a
    // colleague's, or a guest's. Reaching here already required
    // instructor+, so this is not open to the public capture endpoint,
    // which stays strictly append-only.
    //
    // Replies have no FK to their parent (parentId is a plain column), so
    // remove them explicitly or they'd be stranded as orphan threads.
    await prisma.$transaction([
      prisma.pageComment.deleteMany({ where: { reviewId: id, parentId: c.id } }),
      prisma.pageComment.delete({ where: { id: c.id } }),
    ]);
    await touch(id);
    return NextResponse.json({ ok: true, ...(await load(id)) });
  }

  // ── resolve / wontfix ────────────────────────────────────────
  if (action === "setStatus") {
    const p = StatusSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const c = await prisma.pageComment.findFirst({
      where: { id: p.data.commentId, reviewId: id },
      select: { id: true },
    });
    if (!c) return NextResponse.json({ error: "No such comment." }, { status: 404 });
    await prisma.pageComment.update({ where: { id: c.id }, data: { status: p.data.status } });
    await touch(id);
    return NextResponse.json({ ok: true, ...(await load(id)) });
  }

  // ── reopen a single settled comment ──────────────────────────
  // When a page revision is rolled back, the feedback it addressed applies
  // again. Reopening leaves the comment in the round it was raised in — that
  // is a fact about its history, not its state — and "open" is what marks it
  // outstanding. The brief exports every open item regardless of round.
  if (action === "reopenComment") {
    const p = ReopenSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const c = await prisma.pageComment.findFirst({
      where: { id: p.data.commentId, reviewId: id },
      select: { id: true, status: true },
    });
    if (!c) return NextResponse.json({ error: "No such comment." }, { status: 404 });
    if (c.status === "open") {
      return NextResponse.json({ error: "That comment is already open." }, { status: 409 });
    }
    await prisma.pageComment.update({ where: { id: c.id }, data: { status: "open" } });
    await touch(id);
    return NextResponse.json({ ok: true, ...(await load(id)) });
  }

  // ── reopen a whole round ─────────────────────────────────────
  // The bulk case: a revision round was reverted on the live page, so every
  // item it settled is outstanding again.
  if (action === "reopenRound") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const p = ReopenRoundSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const r = await prisma.pageComment.updateMany({
      where: { reviewId: id, round: p.data.round, status: { not: "open" } },
      data: { status: "open" },
    });
    if (r.count === 0) {
      return NextResponse.json({ error: `Round ${p.data.round} has nothing settled to reopen.` }, { status: 409 });
    }
    await touch(id);
    return NextResponse.json({ ok: true, reopened: r.count, ...(await load(id)) });
  }

  // ── start the next revision round ────────────────────────────
  if (action === "startNextRound") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const p = NextRoundSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    // Anything filed this round, plus anything outstanding from an earlier
    // one: a round holding only carried-over items still has work to settle.
    const currentCount = await prisma.pageComment.count({
      where: { reviewId: id, OR: [{ round: review.round }, { status: "open" }] },
    });
    if (currentCount === 0) {
      return NextResponse.json(
        { error: `Round ${review.round} has no feedback yet.` },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      // Every open item, not just ones raised in this round: a comment
      // carried back from an earlier round is outstanding work too, and
      // leaving it open would carry it forward for ever.
      prisma.pageComment.updateMany({
        where: { reviewId: id, status: "open" },
        data: { status: "resolved" },
      }),
      prisma.pageReview.update({
        where: { id },
        data: { round: { increment: 1 }, status: "open" },
      }),
    ]);
    return NextResponse.json({ ok: true, ...(await load(id)) });
  }

  // ── export the brief ─────────────────────────────────────────
  if (action === "export") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const comments = await prisma.pageComment.findMany({
      where: { reviewId: id },
      orderBy: { createdAt: "asc" },
      take: PAGE_REVIEW_COMMENT_LIMIT,
    });
    const brief = buildBrief({
      url: review.url, title: review.title, round: review.round, comments,
    });
    await prisma.pageReview.update({
      where: { id },
      data: { status: "exported" },
    });
    return NextResponse.json({ ok: true, brief, ...(await load(id)) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorId = (session.user as { id?: string }).id;
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      url: true,
      _count: { select: { comments: true } },
    },
  });
  if (!review) return NextResponse.json({ error: "No such review." }, { status: 404 });

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        actorId,
        action: "pageReview.delete",
        targetType: "pageReview",
        targetId: review.id,
        detail: JSON.stringify({
          title: review.title,
          url: review.url,
          commentCount: review._count.comments,
        }),
      },
    }),
    // PageComment.review uses onDelete: Cascade, so the session and every
    // thread disappear atomically.
    prisma.pageReview.delete({ where: { id: review.id } }),
  ]);

  return NextResponse.json({ ok: true });
}

function touch(id: string) {
  return prisma.pageReview.update({ where: { id }, data: { updatedAt: new Date() } });
}

async function load(id: string) {
  const review = await prisma.pageReview.findUnique({
    where: { id },
    include: {
      comments: {
        orderBy: { createdAt: "asc" },
        take: PAGE_REVIEW_COMMENT_LIMIT,
      },
    },
  });
  return { review };
}
