/**
 * Workspace → Marketing → Newsletter → Review.
 *
 * The current issue rendered exactly as it will send, with a click layer
 * for pinning notes to individual elements. Renders from the live pieces
 * rather than the stored `renderedHtml`, so a reviewer is never reading a
 * stale generate.
 */
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { resolveCurrentIssue } from "@/lib/newsletter/currentIssue";
import { getNewsletterConfig, isApprover } from "@/lib/newsletter/config";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { NewsletterNav } from "@/components/workspace/NewsletterNav";
import { NewsletterReviewClient, SignOff } from "@/components/workspace/NewsletterReviewClient";
import { NewsletterPageReview } from "@/components/workspace/NewsletterPageReview";
import { PastedNewsletterReview } from "@/components/workspace/PastedNewsletterReview";
import { renderIssue } from "@/lib/newsletter/render";
import {
  EMPTY_LAYOUT,
  SECTIONS,
  isSection,
  type PieceLayout,
  type Section,
} from "@/lib/newsletter/types";

export const dynamic = "force-dynamic";

export default async function NewsletterReviewPage() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect(await deniedRedirect("/admin/workspace/marketing/newsletter/review"));

  // The most recently touched paste, so the section reopens on what
  // somebody was last reviewing rather than an empty box.
  const pastedRow = await prisma.codeReview.findFirst({
    where: { status: "open" },
    orderBy: { updatedAt: "desc" },
    include: { notes: { orderBy: { createdAt: "asc" } } },
  });
  const pastedReview = pastedRow
    ? {
        id: pastedRow.id,
        title: pastedRow.title,
        code: pastedRow.code,
        round: pastedRow.round,
        status: pastedRow.status,
        notes: pastedRow.notes.map((n) => ({
          id: n.id, body: n.body, status: n.status,
          anchorQuote: n.anchorQuote, anchorLabel: n.anchorLabel,
          cssPath: n.cssPath, anchorState: n.anchorState, authorName: n.authorName,
        })),
      }
    : null;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const [resolved, config] = await Promise.all([
    resolveCurrentIssue(today),
    getNewsletterConfig(),
  ]);
  const issue = await prisma.newsletterIssue.findUnique({
    where: { id: resolved.issueId },
    include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
  });

  const hero = (
    <PageHero
      eyebrow={
        <>
          <Mail size={11} /> Workspace · Marketing
        </>
      }
      title="Newsletter review"
      description="One shared review per issue, with revision rounds and threaded feedback."
    />
  );

  if (!issue) {
  
  return (
      <div className="space-y-6">
        {hero}
        <NewsletterNav />
        <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-fg">Nothing to review yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
            Open the Compose tab to start this month&apos;s issue. Once it has
            contributions, the rendered version shows up here for review.
          </p>
        </div>
      </div>
    );
  }

  const bySection = {} as Record<Section, PieceLayout[]>;
  const idsBySection = {} as Record<Section, string[]>;
  for (const s of SECTIONS) {
    bySection[s] = [];
    idsBySection[s] = [];
  }
  let unrendered = 0;
  for (const p of issue.pieces) {
    if (p.status === "excluded" || !isSection(p.section)) continue;
    const layout = (p.layout as PieceLayout | null) ?? {
      ...EMPTY_LAYOUT,
      headline: "Not yet laid out",
      body: [p.rawBody.slice(0, 400)],
    };
    if (!p.layout) unrendered++;
    bySection[p.section].push(layout);
    idsBySection[p.section].push(p.id);
  }

  const html = renderIssue({
    dateline: issue.dateline,
    preheader: issue.preheader,
    bySection,
    idsBySection,
  });

  const comments = await prisma.newsletterComment.findMany({
    where: { issueId: issue.id },
    orderBy: { createdAt: "asc" },
  });

  const review = await prisma.pageReview.findUnique({
    where: { id: `newsletter-${issue.id}` },
    select: { id: true, round: true, status: true, _count: { select: { comments: { where: { status: "open", parentId: null } } } } },
  });
  const role = (session.user as { role?: string }).role;
  const signOff = {
    cycleId: resolved.cycleId,
    sendDate: resolved.sendDate,
    approvedAt: resolved.approvedAt ? resolved.approvedAt.toISOString() : null,
    approvedByName: resolved.approvedByName,
    viewerIsApprover: isApprover(config, (session.user as { email?: string }).email),
    approverName: config.approver.name,
  };

  return (
    <div className="space-y-6">
      {hero}
      <NewsletterNav />
      {unrendered > 0 && <p className="text-sm text-muted">{unrendered} contributions still need layout in Compose.</p>}
      <NewsletterPageReview
        issueId={issue.id}
        html={html}
        initialReview={review ? { id: review.id, round: review.round, status: review.status } : null}
        canEdit={role === "admin" || role === "superadmin"}
        initialPaste={pastedReview?.title.toLowerCase().includes(issue.dateline.toLowerCase()) ? pastedReview.code : ""}
      />
      <SignOff signOff={signOff} openCount={(review?._count.comments ?? 0) + comments.filter((comment) => comment.status === "open").length} />
      {comments.length > 0 && <details>
        <summary className="cursor-pointer text-sm font-semibold text-muted">Earlier newsletter notes ({comments.length})</summary>
      <NewsletterReviewClient
        issueId={issue.id}
        issueTitle={issue.title}
        initialHtml={html}
        initialComments={JSON.parse(JSON.stringify(comments))}
        unrendered={unrendered}
        signOff={signOff}
        hideSignOff
      />
      </details>}
      {pastedReview && <details>
        <summary className="cursor-pointer text-sm font-semibold text-muted">Earlier pasted review</summary>
        <PastedNewsletterReview initial={pastedReview} />
      </details>}
    </div>
  );
}
