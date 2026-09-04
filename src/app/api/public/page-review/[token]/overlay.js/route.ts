/** Live-page collaborative review overlay, served as cross-origin JavaScript. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlaySource } from "@/lib/page-review/overlay-source";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token },
    select: { title: true, status: true },
  });

  if (!review || review.status === "closed") {
    return new NextResponse(inactiveOverlaySource("This BioHubNet review is no longer active."), {
      headers: HEADERS,
    });
  }

  const origin = new URL(req.url).origin;
  const endpoint = `${origin}/api/public/page-review/${encodeURIComponent(token)}`;
  return new NextResponse(overlaySource(endpoint, review.title), { headers: HEADERS });
}

function inactiveOverlaySource(message: string) {
  return `(function(){
  var old = document.getElementById("bhn-review-overlay");
  if (old) old.remove();
  var box = document.createElement("div");
  box.id = "bhn-review-overlay";
  box.setAttribute("style", "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:14px 16px;border:1px solid #d8dee5;border-radius:8px;background:#fff;color:#17212b;box-shadow:0 12px 36px rgba(0,0,0,.22);font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;");
  box.textContent = ${JSON.stringify(message)};
  document.body.appendChild(box);
})();`;
}
