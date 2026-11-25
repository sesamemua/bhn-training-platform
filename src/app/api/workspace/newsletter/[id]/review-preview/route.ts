/**
 * Staff-only, read-only view of saved newsletter HTML. Opening a pending
 * draft or a historical round never releases it, creates a review, or
 * starts a new round. This is deliberately separate from the live overlay.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  // The saved document stays byte-for-byte intact, but cannot run scripts,
  // submit forms, open popups or reach this site's cookies/storage/DOM.
  "Content-Security-Policy": "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return new NextResponse("Forbidden.", { status: 403, headers: HEADERS });

  const selected = new URL(req.url).searchParams.getAll("round");
  if (selected.length > 1 || (selected.length === 1 && (!/^[1-9]\d*$/.test(selected[0]) || !Number.isSafeInteger(Number(selected[0]))))) {
    return new NextResponse("Choose a positive whole-number revision.", { status: 400, headers: HEADERS });
  }
  const round = selected.length === 1 ? Number(selected[0]) : null;
  const { id } = await ctx.params;
  const issue = await prisma.newsletterIssue.findUnique({
    where: { id }, select: { renderedHtml: true },
  });
  if (!issue) return new NextResponse("Issue not found.", { status: 404, headers: HEADERS });

  const reviewId = `newsletter-${id}`;
  const review = await prisma.pageReview.findUnique({
    where: { id: reviewId }, select: { round: true, pastedHtml: true, snapshotHtml: true },
  });

  let html: string | null = null;
  if (round === null) {
    html = review?.pastedHtml?.trim() ? review.pastedHtml : issue.renderedHtml;
  } else if (review && round === review.round) {
    html = review.pastedHtml;
  } else if (review && round < review.round) {
    const version = await prisma.pageReviewVersion.findUnique({
      where: { reviewId_round: { reviewId, round } }, select: { html: true },
    });
    html = version?.html?.trim() ? version.html : round === review.round - 1 ? review.snapshotHtml : null;
  }

  if (!html?.trim()) return new NextResponse("This saved revision is unavailable.", { status: 404, headers: HEADERS });
  // Returning the source directly preserves whole documents and email-table
  // fragments alike. No wrapper, banner, overlay or regenerated pieces.
  return new NextResponse(html, {
    headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
