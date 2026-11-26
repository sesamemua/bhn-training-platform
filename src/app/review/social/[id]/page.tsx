import { notFound, redirect } from "next/navigation";
import { deniedRedirect, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviewPath } from "@/lib/social/review";
import { canReviewSocialCopy, SocialCopySnapshot, socialCopyReviewId, socialCopyReviewPath, socialCopySnapshot } from "@/lib/social/copy-review";
import { SocialCopyReviewControls } from "@/components/workspace/SocialCopyReviewControls";
import { visibleTeamRound } from "@/lib/page-review/team-round";
import { SocialPostPhotos } from "@/components/workspace/SocialPostPhotos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Social Post Review | BioHubNet", robots: { index: false, follow: false } };

export default async function SocialCopyReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await requireRole("admin").catch(() => null)) redirect(await deniedRedirect(socialCopyReviewPath(id)));
  const [post, review, graphic] = await Promise.all([
    prisma.socialPost.findUnique({ where: { id }, select: { status: true, body: true, assetSpec: true, editVersion: true } }),
    prisma.pageReview.findUnique({ where: { id: socialCopyReviewId(id), kind: "social" }, select: { id: true, round: true, teamRound: true, status: true, pastedHtml: true } }),
    prisma.designArtwork.findFirst({ where: { sourceName: `social:${id}` }, select: { id: true } }),
  ]);
  if (!post) notFound();
  const latest = socialCopySnapshot(post.body, post.assetSpec);
  const saved = review?.pastedHtml ? SocialCopySnapshot.parse(JSON.parse(review.pastedHtml)) : latest;
  const open = canReviewSocialCopy(post.status) && (!review || review.status === "open");
  const canEdit = open && !!review && review.pastedHtml === JSON.stringify(latest);
  const teamRound = review ? visibleTeamRound(review) ?? 1 : undefined;
  return <main className="mx-auto max-w-4xl px-4 py-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold">Social Post Review</h1><p className="text-sm text-muted">{review ? `Team review · Round ${teamRound} · Saved version ${review.round} · ${open ? "In review" : "Read-only"}` : "No saved review"}</p></div>
      <div className="flex flex-wrap gap-2">
        <a href={reviewPath(id)} data-bhn-social-editor="" className="rounded-md border border-line px-3 py-2 text-sm font-semibold">Open post editor</a>
        {graphic && <a href={`/review/design/${encodeURIComponent(graphic.id)}`} className="rounded-md border border-line px-3 py-2 text-sm font-semibold">Review graphic</a>}
      </div>
    </header>
    <SocialCopyReviewControls postId={id} round={review?.round ?? 0} teamRound={teamRound} editVersion={post.editVersion}
      stale={!!review && review.pastedHtml !== JSON.stringify(latest)} open={canReviewSocialCopy(post.status) && review?.status !== "closed"} />
    <div data-social-review className="mt-5">
      <div id="social-copy-draft">
        <article data-copy-page data-copy-version={post.editVersion} data-copy-editable={canEdit} aria-label={saved.title} className="space-y-4 rounded-lg border border-line bg-card p-5 [overflow-wrap:anywhere]">
          <h2 className="text-lg font-bold">{saved.title}</h2>
          {saved.body.split(/\n\s*\n/).map((part, index) => <p key={index} data-copy-part={index} className="whitespace-pre-wrap leading-relaxed">{part}</p>)}
          <SocialPostPhotos postId={id} assetSpec={post.assetSpec} />
        </article>
      </div>
    </div>
  </main>;
}
