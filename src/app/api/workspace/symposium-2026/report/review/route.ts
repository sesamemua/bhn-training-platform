import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrief } from "@/lib/page-review/brief";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";
import { overlaySource } from "@/lib/page-review/overlay-source";
import { REPORT_API, REPORT_ID, REPORT_REVIEW_PATH, REPORT_TITLE, reportSchema } from "@/lib/symposium-report/document";
import { reportReviewSnapshot } from "@/lib/symposium-report/review-snapshot";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { headers, status });

export async function GET(request: Request) {
  const session = await requireRole("instructor").catch(() => null);
  const user = session?.user as { id?: string; name?: string } | undefined;
  if (!user?.id) return json({ error: "Sign in as a staff reviewer to open the report." }, 403);

  const { origin, searchParams } = new URL(request.url);
  if (searchParams.has("overlay")) {
    return new Response(overlaySource(`${REPORT_API}/review`, REPORT_TITLE, true, `/api/workspace/page-review/${REPORT_ID}`), {
      headers: { ...headers, "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  const where = { id: REPORT_ID, kind: "report" };
  if (searchParams.get("comparison") === "1") {
    const row = await prisma.pageReview.findUnique({ where, select: {
      title: true, round: true, status: true, pastedHtml: true, versions: { select: { round: true } },
    } });
    if (!row?.pastedHtml) return json({ error: "The report is not ready." }, 404);
    const { title, round, status, pastedHtml, versions: saved } = row;
    const review = { title, round, status };
    const availableRounds = [...new Set([round, ...saved.map((version) => version.round)])].sort((a, b) => a - b);
    const chosen = searchParams.get("rounds");
    const rounds = chosen === null ? availableRounds.slice(-2) : chosen.split(",").map(Number).sort((a, b) => a - b);
    if (chosen !== null && (rounds.length < 2 || rounds.length > 4 || new Set(rounds).size !== rounds.length ||
        rounds.some((value) => !availableRounds.includes(value)))) {
      return json({ error: "Choose two, three or four different saved rounds." }, 400);
    }
    if (rounds.length < 2) return json({ ok: true, review, comparison: null });
    const archived = await prisma.pageReviewVersion.findMany({
      where: { reviewId: REPORT_ID, round: { in: rounds.filter((value) => value !== round) } },
      select: { round: true, html: true },
    });
    const copies = new Map([...archived.map((version) => [version.round, version.html] as const), [round, pastedHtml]]);
    if (rounds.some((value) => !copies.has(value))) return json({ error: "One of these rounds is no longer available." }, 409);
    const versions = rounds.map((value) => ({ round: value, html: reportReviewSnapshot(reportSchema.parse(JSON.parse(copies.get(value)!)), origin) }));
    return json({ ok: true, review, comparison: { beforeHtml: versions[0].html, afterHtml: versions.at(-1)!.html, versions, availableRounds } });
  }

  const row = await prisma.pageReview.findUnique({ where, select: {
    title: true, round: true, status: true,
    comments: { orderBy: { createdAt: "asc" }, take: PAGE_REVIEW_COMMENT_LIMIT },
  } });
  if (!row) return json({ error: "The report is not ready." }, 404);
  const { comments, ...review } = row;
  if (searchParams.get("brief") === "1") {
    return json({ ok: true, brief: buildBrief({ ...review, comments, url: new URL(REPORT_REVIEW_PATH, origin).href }) });
  }
  return json({ ok: true, review, viewer: { name: user.name || "Team member" }, comments: comments.map(({
    id, parentId, round, anchorQuote, anchorKey, anchorPath, anchorBlock, anchorState, authorUserId, authorName, body, status, createdAt, editedAt, editedByName,
  }) => ({ id, parentId, round, anchorQuote, anchorKey, anchorPath, anchorBlock, anchorState, authorName, body, status, createdAt, editedAt, editedByName, isMine: authorUserId === user.id })) });
}
