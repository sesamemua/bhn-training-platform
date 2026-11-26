import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canReviewSocialCopy, SOCIAL_COPY_REVIEW_PREFIX } from "@/lib/social/copy-review";
import { REPORT_ID } from "@/lib/symposium-report/document";
import { checkpointResponse, textCheckpoint } from "@/lib/page-review/text-checkpoint";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: Context) {
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) {
    return checkpointResponse({ error: "Open the review from the platform." }, 403);
  }
  const { id } = await ctx.params;
  const social = id.startsWith(SOCIAL_COPY_REVIEW_PREFIX);
  if (!social && id !== REPORT_ID) return checkpointResponse({ error: "No editable review." }, 404);
  const session = await requireRole(social ? "admin" : "instructor").catch(() => null);
  const owner = (session?.user as { id?: string } | undefined)?.id;
  if (!owner) return checkpointResponse({ error: "Sign in to save a draft." }, 403);
  const review = await prisma.pageReview.findUnique({
    where: { id, kind: social ? "social" : "report" }, select: { id: true, round: true, status: true },
  });
  if (!review) return checkpointResponse({ error: "No editable review." }, 404);
  if (social && request.method === "PUT") {
    const post = await prisma.socialPost.findUnique({ where: { id: id.slice(SOCIAL_COPY_REVIEW_PREFIX.length) }, select: { status: true } });
    if (!post || !canReviewSocialCopy(post.status)) return checkpointResponse({ error: "This post cannot be edited." }, 409);
  }
  return textCheckpoint(request, review, owner);
}

export { GET as PUT, GET as DELETE };
