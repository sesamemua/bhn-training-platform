/**
 * Serves a pasted review as a page, with the review overlay on it.
 *
 * The webpage reviewer works by loading an overlay onto the page under
 * review. A paste has no page, so this is one — the markup, plus the
 * same overlay script, so every comment, share link and round works
 * exactly as it does on a live site. Nothing about the review system
 * needed changing to accept a paste; it needed somewhere to point.
 *
 * THE HEADER IS THE SECURITY CONTROL:
 *
 *   Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups
 *
 * A sandbox directive in a RESPONSE header does to a document what the
 * sandbox attribute does to an iframe: it gets an OPAQUE ORIGIN. So the
 * pasted markup runs with no access to this site's cookies, storage or
 * DOM — a campaign export carrying a script cannot touch an admin's
 * session, which is the risk that makes serving somebody else's HTML
 * from your own origin a bad idea.
 *
 * allow-scripts is nevertheless required, because the OVERLAY is a
 * script. That is safe here for a specific reason: the overlay
 * authenticates with `Authorization: Bearer <token>`, never a cookie,
 * so it does not need an origin to work. Checked, not assumed — see
 * the fetch calls in the overlay route.
 *
 * The token in the path is the review's own share token, the same one
 * the bookmarklet carries.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pasteDocument } from "@/lib/page-review/paste-document";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const review = await prisma.pageReview.findFirst({
    where: { shareToken: token, kind: "paste" },
    select: { id: true, title: true, pastedHtml: true, status: true },
  });
  if (!review?.pastedHtml) {
    return new NextResponse("No such review.", { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const overlay = `${origin}/api/public/page-review/${encodeURIComponent(token)}/overlay.js`;

  /*
   * A pasted document is served AS the document.
   *
   * Nesting one inside a wrapper's <body> is what the first version
   * did, and the parser will not have it: the inner html/head/body
   * tags go, and whatever lands inside a <table> gets foster-parented
   * out in front of it. A forty-table newsletter came out 1,800px wide
   * with its sections side by side — a page with nothing to scroll.
   */
  const doc = pasteDocument(review.pastedHtml, overlay, review.title);

  return new NextResponse(doc, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // An opaque origin: the markup below cannot reach this site's
      // cookies, storage or DOM. See the header comment.
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
