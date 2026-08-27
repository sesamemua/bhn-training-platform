/**
 * Workspace → Marketing → Newsletter → Code.
 *
 * Paste a block of code and leave notes on individual lines.
 *
 * Its own tab, and its own pair of tables, rather than an extension of
 * the Review tab. Two reasons, both load-bearing:
 *
 * Review renders the issue in a same-origin frame so a click layer can
 * reach into it — which is exactly why PastedHtmlReview next to it has
 * to sandbox anything pasted, and why notes cannot pin to a paste
 * there. Reading the SOURCE rather than the render sidesteps that: text
 * is never executed, so a click layer costs nothing.
 *
 * And the notes must not be NewsletterComments. That table's rows are
 * counted, without qualification, into the "N notes are still open"
 * line printed directly above Approve — so a remark about a Mailchimp
 * paste would make an approver hesitate over sending the issue, in the
 * one place in the app designed to make them stop and think.
 */
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { NewsletterNav } from "@/components/workspace/NewsletterNav";
import { CodeReviewClient } from "@/components/workspace/CodeReviewClient";
import { locate, splitLines } from "@/lib/codereview/anchor";

export const dynamic = "force-dynamic";

export default async function NewsletterCodeReviewPage() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect(await deniedRedirect("/admin/workspace/marketing/newsletter/code"));

  // The most recently touched open review, so the tab reopens on what
  // somebody was last looking at rather than an empty box.
  const row = await prisma.codeReview.findFirst({
    where: { status: "open" },
    orderBy: { updatedAt: "desc" },
    include: { notes: { orderBy: { createdAt: "asc" } } },
  });

  const initial = row
    ? {
        id: row.id,
        title: row.title,
        kind: row.kind,
        code: row.code,
        round: row.round,
        status: row.status,
        lines: splitLines(row.code).length,
        notes: row.notes.map((n) => ({
          id: n.id,
          round: n.round,
          body: n.body,
          status: n.status,
          anchorText: n.anchorText,
          anchorLine: n.anchorLine,
          anchorState: n.anchorState,
          authorName: n.authorName,
          located: locate(
            {
              line: n.anchorLine,
              lineText: n.anchorText,
              before: n.anchorBefore ?? undefined,
              after: n.anchorAfter ?? undefined,
            },
            row.code,
          ),
        })),
      }
    : null;

  return (
    <>
      <PageHero
        eyebrow={<><Mail size={11} /> Workspace · Marketing</>}
        title="Code review"
        description="Paste HTML, JSON or anything else and leave notes on individual lines. It is shown as text and never run, so a campaign export is safe to paste here — and a note finds its line again after the code is pasted a second time."
      />
      <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <NewsletterNav />
        <div className="mt-5">
          <CodeReviewClient initial={initial} />
        </div>
      </div>
    </>
  );
}
