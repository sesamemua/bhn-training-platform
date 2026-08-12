/**
 * Workspace → Website Review.
 *
 * Two levels. With no ?r= you get the index: every page under review, led by
 * the number of items still open in its current round — the same set an
 * export would produce. Pick one and you get that review's threads.
 *
 * It used to drop you straight into the most recently touched review, which
 * meant there was no way to see across them at all.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { MessageSquareText, ArrowLeft, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { PageReviewClient } from "@/components/workspace/PageReviewClient";
import { NewPageReviewForm } from "@/components/workspace/NewPageReviewForm";
import { BookmarkletPanel } from "@/components/workspace/BookmarkletPanel";
import { ReviewIndex, ReviewIndexEmpty, type ReviewSummary } from "@/components/workspace/ReviewIndex";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";
import { createPageReviewViewerToken } from "@/lib/page-review/viewer";

export const dynamic = "force-dynamic";

export default async function WebsiteReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect("/dashboard");

  const { r } = await searchParams;
  const role = (session.user as { role?: string }).role ?? "";
  const isAdmin = role === "admin" || role === "superadmin";
  const meId = (session.user as { id?: string }).id ?? null;
  const meName = (session.user as { name?: string | null; email?: string | null }).name
    || (session.user as { email?: string | null }).email
    || "Team member";
  const requestHeaders = await headers();
  const requestHost = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    .trim();
  const requestProtocol = (requestHeaders.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const safeRequestOrigin = /^(https?)$/.test(requestProtocol)
    && /^[A-Za-z0-9.-]+(?::\d+)?$/.test(requestHost)
    ? `${requestProtocol}://${requestHost}`
    : null;
  const appOrigin = safeRequestOrigin
    ?? (process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "");

  const reviews = await prisma.pageReview.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true, url: true, title: true, status: true, round: true, updatedAt: true,
      _count: { select: { comments: true } },
    },
  });

  // Per-review counts for the CURRENT round only, and threads rather than
  // individual replies — so the headline number matches "Open items" in the
  // exported brief instead of a running total across every round.
  const threadCounts = reviews.length
    ? await prisma.pageComment.groupBy({
        by: ["reviewId", "round", "status"],
        where: { reviewId: { in: reviews.map((rv) => rv.id) }, parentId: null },
        _count: { _all: true },
      })
    : [];

  const summaries: ReviewSummary[] = reviews.map((rv) => {
    let openCount = 0;
    let settledCount = 0;
    for (const g of threadCounts) {
      if (g.reviewId !== rv.id || g.round !== rv.round) continue;
      if (g.status === "open") openCount += g._count._all;
      else settledCount += g._count._all;
    }
    return {
      id: rv.id, url: rv.url, title: rv.title, status: rv.status, round: rv.round,
      updatedAt: rv.updatedAt.toISOString(),
      openCount, settledCount, totalComments: rv._count.comments,
    };
  });

  // No ?r= means the index. Nothing is auto-selected.
  const active = r
    ? await prisma.pageReview.findUnique({
        where: { id: r },
        include: {
          comments: {
            orderBy: { createdAt: "asc" },
            take: PAGE_REVIEW_COMMENT_LIMIT,
          },
        },
      })
    : null;
  const viewerCredential = active && meId
    ? await createPageReviewViewerToken({ reviewId: active.id, userId: meId, name: meName })
    : null;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><MessageSquareText size={11} /> Workspace</>}
        title="Website Review"
        description="Leave comments on a live page, reply to each other, and resolve them as they land. When a round is done, export the open threads as a brief for Claude Code or Codex — anchored to the exact text on the page so the change lands where you meant it."
      />

      {active ? (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link
              href="/admin/workspace/website-review"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg"
            >
              <ArrowLeft size={13} /> All pages
            </Link>
            <a
              href={active.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-subtle hover:text-fg"
            >
              {active.url} <ExternalLink size={10} />
            </a>
          </div>

          {/* shareToken is nullable in the schema; every review the app creates has one. */}
          {active.status !== "closed" && active.shareToken && viewerCredential && (
            <BookmarkletPanel
              shareToken={active.shareToken}
              reviewId={active.id}
              url={active.url}
              appOrigin={appOrigin}
              viewerCredential={viewerCredential}
            />
          )}

          <PageReviewClient
            initialReview={{
              id: active.id, url: active.url, title: active.title,
              status: active.status, round: active.round,
              comments: active.comments.map((c) => ({
                id: c.id, parentId: c.parentId, round: c.round,
                anchorQuote: c.anchorQuote, anchorKey: c.anchorKey,
                anchorPath: c.anchorPath, anchorBlock: c.anchorBlock,
                anchorState: c.anchorState, authorUserId: c.authorUserId,
                authorName: c.authorName, authorKind: c.authorKind,
                body: c.body, status: c.status,
                editCount: c.editCount,
                editedAt: c.editedAt ? c.editedAt.toISOString() : null,
                editedByName: c.editedByName,
                createdAt: c.createdAt.toISOString(),
              })),
            }}
            meId={meId}
            isAdmin={isAdmin}
          />
        </>
      ) : (
        <>
          {isAdmin && <NewPageReviewForm />}
          {summaries.length > 0 ? (
            <ReviewIndex reviews={summaries} activeId={null} />
          ) : (
            <ReviewIndexEmpty isAdmin={isAdmin} />
          )}
        </>
      )}
    </div>
  );
}
