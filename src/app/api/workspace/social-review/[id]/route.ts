import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrief } from "@/lib/page-review/brief";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";
import { overlaySource } from "@/lib/page-review/overlay-source";
import { canReviewSocialCopy, socialCopyReviewApi, socialCopyReviewId, socialCopyReviewPath, socialCopySnapshot, socialCopySnapshotHtml } from "@/lib/social/copy-review";
import { editSocialPost } from "@/lib/social/edit";
import { reportTransaction } from "@/lib/symposium-report/store";
import { z } from "zod";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { headers, status });
const partEdit = z.object({ part: z.number().int().nonnegative(), before: z.string().max(6000), after: z.string().max(6000) }).strict();
const textEdit = z.object({ round: z.number().int().positive(), version: z.number().int().nonnegative(),
  edits: z.array(partEdit).min(1).max(50) }).strict();

/** Edit the draft and snapshot in one transaction. Never publish, schedule or send. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const actor = (session?.user as { id?: string } | undefined)?.id;
  if (!actor) return json({ error: "Sign in with your Social admin account." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Use JSON." }, 415);
  const raw = await request.text();
  if (raw.length > 80000) return json({ error: "This edit is too long." }, 413);
  const input = textEdit.safeParse(await Promise.resolve().then(() => JSON.parse(raw)).catch(() => null));
  if (!input.success) return json({ error: "Provide the original paragraph and displayed revision." }, 400);
  const { id: postId } = await params;
  const id = socialCopyReviewId(postId);
  return reportTransaction(async tx => {
    const [post, review] = await Promise.all([
      tx.socialPost.findUnique({ where: { id: postId }, select: { status: true, editVersion: true, body: true, assetSpec: true, trackChanges: true } }),
      tx.pageReview.findUnique({ where: { id, kind: "social" }, select: { round: true, status: true, pastedHtml: true } }),
    ]);
    const change = input.data;
    if (!post || !review || review.status !== "open" || !canReviewSocialCopy(post.status) || review.round !== change.round ||
      post.editVersion !== change.version || review.pastedHtml !== JSON.stringify(socialCopySnapshot(post.body, post.assetSpec))) {
      return json({ error: "The draft or review changed. Your unsaved text is still available; copy it before reloading." }, 409);
    }
    const paragraphs = post.body.split(/(\n\s*\n)/);
    const seen = new Set<number>();
    for (const edit of change.edits) {
      if (seen.has(edit.part) || paragraphs[edit.part * 2] !== edit.before) return json({ error: "A selected paragraph changed. Reload before editing." }, 409);
      seen.add(edit.part);
      paragraphs[edit.part * 2] = edit.after;
    }
    const outcome = await editSocialPost(tx, actor, { id: postId, body: paragraphs.join(""), expectedVersion: change.version, trackChanges: post.trackChanges });
    if (!outcome.result.ok || !outcome.result.post) return json({ error: outcome.result.error || "The draft could not be saved." }, outcome.status);
    if (outcome.result.post.body === post.body) return json({ ok: true, unchanged: true });
    const snapshot = socialCopySnapshot(outcome.result.post.body, post.assetSpec);
    await tx.pageReviewVersion.create({ data: { reviewId: id, round: review.round, html: review.pastedHtml! } });
    await tx.pageReview.update({ where: { id }, data: { round: { increment: 1 }, pastedHtml: JSON.stringify(snapshot), title: snapshot.title } });
    await tx.auditLog.create({ data: { actorId: actor, action: "social.review.text-edit", targetType: "PageReview", targetId: id,
      detail: JSON.stringify({ round: review.round, nextRound: review.round + 1, edits: change.edits }) } });
    return json({ ok: true, round: review.round + 1 });
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const user = session?.user as { id?: string; name?: string } | undefined;
  if (!user?.id) return json({ error: "Sign in with your Social admin account." }, 403);
  const { id: postId } = await params;
  const id = socialCopyReviewId(postId);
  const { origin, searchParams } = new URL(request.url);
  if (searchParams.has("overlay")) return new Response(
    overlaySource(socialCopyReviewApi(postId), "Social Post Review", true, `/api/workspace/page-review/${encodeURIComponent(id)}`, "social"),
    { headers: { ...headers, "Content-Type": "application/javascript; charset=utf-8" } },
  );
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, select: { status: true } });
  if (!post) return json({ error: "No such post." }, 404);
  const where = { id, kind: "social" };
  const statusOf = (status: string) => canReviewSocialCopy(post.status) ? status : "closed";
  if (searchParams.get("comparison") === "1") {
    const row = await prisma.pageReview.findUnique({ where, select: {
      title: true, round: true, status: true, pastedHtml: true, versions: { select: { round: true } },
    } });
    if (!row?.pastedHtml) return json({ error: "Start the review first." }, 404);
    const review = { title: row.title, round: row.round, status: statusOf(row.status) };
    const availableRounds = [...new Set([...row.versions.map((version) => version.round), row.round])].sort((a, b) => a - b);
    const requested = searchParams.get("rounds");
    const rounds = requested === null ? availableRounds.slice(-2) : requested.split(",").map(Number).sort((a, b) => a - b);
    if (requested !== null && (rounds.length < 2 || rounds.length > 4 || new Set(rounds).size !== rounds.length ||
        rounds.some((round) => !availableRounds.includes(round)))) return json({ error: "Choose two to four different saved rounds." }, 400);
    if (rounds.length < 2) return json({ ok: true, review, comparison: null });
    const archived = await prisma.pageReviewVersion.findMany({ where: { reviewId: id, round: { in: rounds.filter((round) => round !== row.round) } }, select: { round: true, html: true } });
    const snapshots = new Map([...archived.map((version) => [version.round, version.html] as const), [row.round, row.pastedHtml]]);
    if (rounds.some((round) => !snapshots.has(round))) return json({ error: "A saved round is no longer available." }, 409);
    const versions = rounds.map((round) => ({ round, html: socialCopySnapshotHtml(snapshots.get(round)!) }));
    return json({ ok: true, review, comparison: { beforeHtml: versions[0].html, afterHtml: versions.at(-1)!.html, versions, availableRounds } });
  }
  const row = await prisma.pageReview.findUnique({ where, select: {
    title: true, round: true, status: true, comments: { orderBy: { createdAt: "asc" }, take: PAGE_REVIEW_COMMENT_LIMIT },
  } });
  if (!row) return json({ error: "Start the review first." }, 404);
  const { comments, ...metadata } = row;
  const review = { ...metadata, status: statusOf(metadata.status) };
  if (searchParams.get("brief") === "1") return json({ ok: true, brief: buildBrief({
    ...review, comments, url: new URL(socialCopyReviewPath(postId), origin).href,
  }) });
  return json({ ok: true, review, viewer: { name: user.name || "Team member" },
    comments: comments.map(({ authorUserId, reviewId, ...comment }) => ({ ...comment, isMine: authorUserId === user.id })) });
}
