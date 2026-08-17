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
import { NewsletterReviewClient } from "@/components/workspace/NewsletterReviewClient";
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
      description="Click any part of the issue to pin a note to it. Notes stay attached to their piece even after the layout is regenerated."
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

  return (
    <div className="space-y-6">
      {hero}
      <NewsletterNav />
      <NewsletterReviewClient
        issueId={issue.id}
        issueTitle={issue.title}
        initialHtml={html}
        initialComments={JSON.parse(JSON.stringify(comments))}
        unrendered={unrendered}
        signOff={{
          cycleId: resolved.cycleId,
          sendDate: resolved.sendDate,
          approvedAt: resolved.approvedAt ? resolved.approvedAt.toISOString() : null,
          approvedByName: resolved.approvedByName,
          viewerIsApprover: isApprover(config, (session.user as { email?: string }).email),
          approverName: config.approver.name,
        }}
      />
    </div>
  );
}
