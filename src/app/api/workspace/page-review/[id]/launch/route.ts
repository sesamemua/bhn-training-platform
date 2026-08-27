import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PAGE_REVIEW_HASH_KEY, PAGE_REVIEW_VIEWER_KEY } from "@/lib/page-review/access";
import { createPageReviewViewerToken } from "@/lib/page-review/viewer";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = session.user as { id?: string; name?: string | null; email?: string | null };
  if (!user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { id },
    select: { id: true, url: true, status: true, shareToken: true },
  });
  if (!review || !review.shareToken) {
    return NextResponse.json({ error: "No such review." }, { status: 404 });
  }
  if (review.status === "closed") {
    return NextResponse.json({ error: "This review is closed." }, { status: 409 });
  }

  const viewerToken = await createPageReviewViewerToken({
    reviewId: review.id,
    userId: user.id,
    name: user.name || user.email || "Team member",
  });
  /* A pasted review's url is a path on this site — the route that
     serves the paste with the overlay on it — so it is resolved
     against this request's origin. A live review's url is absolute and
     the base is ignored. */
  const target = new URL(review.url, new URL(req.url).origin);
  const fragment = new URLSearchParams();
  fragment.set(PAGE_REVIEW_HASH_KEY, review.shareToken);
  fragment.set(PAGE_REVIEW_VIEWER_KEY, viewerToken);
  target.hash = fragment.toString();

  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
