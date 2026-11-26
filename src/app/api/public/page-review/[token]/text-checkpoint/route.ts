import { prisma } from "@/lib/prisma";
import { verifyPageReviewViewerToken } from "@/lib/page-review/viewer";
import { checkpointHeaders, checkpointResponse, textCheckpoint } from "@/lib/page-review/text-checkpoint";

type Context = { params: Promise<{ token: string }> };
export const dynamic = "force-dynamic";

export function OPTIONS() { return new Response(null, { status: 204, headers: checkpointHeaders }); }

export async function GET(request: Request, ctx: Context) {
  const token = (await ctx.params).token;
  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token }, select: { id: true, kind: true, round: true, status: true },
  });
  const newsletter = review?.kind === "paste" && review.id.startsWith("newsletter-");
  if (!review || !newsletter && review.kind !== "url") return checkpointResponse({ error: "No editable review." }, 404);
  const credential = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const viewer = credential && await verifyPageReviewViewerToken(credential, review.id);
  if (!viewer || viewer.kind !== "user") return checkpointResponse({ error: "A signed-in reviewer is required." }, 403);
  const user = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { role: true, isActive: true } });
  if (!user?.isActive || newsletter && !["instructor", "admin", "superadmin"].includes(user.role)) {
    return checkpointResponse({ error: "This account cannot edit the review." }, 403);
  }
  if (newsletter && request.method === "PUT" &&
    !await prisma.newsletterIssue.findFirst({ where: { id: review.id.slice("newsletter-".length), status: { not: "sent" } }, select: { id: true } })) {
    return checkpointResponse({ error: "This issue cannot be edited." }, 409);
  }
  return textCheckpoint(request, review, viewer.userId);
}

export { GET as PUT, GET as DELETE };
