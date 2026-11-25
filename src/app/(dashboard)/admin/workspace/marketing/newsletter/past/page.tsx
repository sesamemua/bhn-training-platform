import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArrowRight } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentCycle } from "@/lib/newsletter/currentIssue";
import { PageHero } from "@/components/ui/PageHero";
import { NewsletterNav } from "@/components/workspace/NewsletterNav";
import { newsletterArchiveKey, newsletterArchiveDateLabel, parseNewsletterArchiveMetadata } from "@/lib/newsletter/archive";

export const dynamic = "force-dynamic";

export default async function PastNewsletterIssuesPage() {
  if (!await requireRole("instructor").catch(() => null)) {
    redirect(await deniedRedirect("/admin/workspace/marketing/newsletter/past"));
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const cycle = await currentCycle(today);
  const current = cycle?.issueId ? await prisma.newsletterIssue.findFirst({
    where: { id: cycle.issueId, status: { not: "sent" } }, select: { id: true },
  }) : await prisma.newsletterIssue.findFirst({
    where: { status: { not: "sent" } }, orderBy: { createdAt: "desc" }, select: { id: true },
  });
  const upcoming = await prisma.newsletterCycle.findMany({
    where: { month: { gt: cycle?.month ?? `${today.slice(0, 7)}-01` }, issueId: { not: null } },
    select: { issueId: true },
  });
  const issues = await prisma.newsletterIssue.findMany({
    where: { id: { notIn: [current?.id, ...upcoming.map((c) => c.issueId)].filter((id): id is string => !!id) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, dateline: true, status: true, updatedAt: true, _count: { select: { pieces: true } } },
  });
  const sentIssues = issues.filter((issue) => issue.status === "sent");
  const earlierDrafts = issues.filter((issue) => issue.status !== "sent");
  const keys = sentIssues.map((issue) => newsletterArchiveKey(issue.id)).filter((key): key is string => !!key);
  const metadataRows = keys.length ? await prisma.platformSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } }) : [];
  const metadataByKey = new Map(metadataRows.map((row) => [row.key, row.value]));
  return <div className="space-y-6">
    <PageHero eyebrow={<><Archive size={11} /> Workspace · Marketing</>} title="Past newsletter issues" />
    <NewsletterNav />
    <section aria-labelledby="sent-newsletters-heading">
      <h2 id="sent-newsletters-heading" className="text-lg font-semibold">Sent issues <span className="text-sm font-normal text-muted">({sentIssues.length})</span></h2>
      <p className="mt-1 text-sm text-muted">Original sent newsletters, preserved as read-only copies.</p>
      {sentIssues.length === 0 ? <p className="py-6 text-sm text-muted">No sent issues archived yet.</p> : <ul className="mt-2 divide-y divide-line">
      {sentIssues.map((issue) => {
        const key = newsletterArchiveKey(issue.id);
        const metadata = parseNewsletterArchiveMetadata(key ? metadataByKey.get(key) : null, issue.id);
        const sent = newsletterArchiveDateLabel(metadata);
        return <li key={issue.id}>
          <Link href={`/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issue.id)}`} className="flex flex-wrap items-center gap-3 py-4 outline-none hover:bg-elevated/40 focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold">{issue.title}</h3><p className="mt-1 text-xs text-muted">{sent ? `Sent ${sent}` : issue.dateline}{metadata ? " · Mailchimp" : ""}</p></div>
            <span className="text-xs font-semibold text-muted">Read-only</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">View issue <ArrowRight size={14} aria-hidden="true" /></span>
          </Link>
        </li>;
      })}
      </ul>}
    </section>
    {earlierDrafts.length > 0 && <section aria-labelledby="earlier-newsletter-drafts-heading">
      <h2 id="earlier-newsletter-drafts-heading" className="text-lg font-semibold">Earlier drafts <span className="text-sm font-normal text-muted">({earlierDrafts.length})</span></h2>
      <p className="mt-1 text-sm text-muted">Preserved working versions. These are separate from the sent copies above.</p>
      <ul className="mt-2 divide-y divide-line">
      {earlierDrafts.map((issue) => <li key={issue.id}>
        <Link href={`/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issue.id)}`} className="flex flex-wrap items-center gap-3 py-4 outline-none hover:bg-elevated/40 focus-visible:ring-2 focus-visible:ring-brand-500">
          <div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold">{issue.title}</h3><p className="mt-1 text-xs text-muted">{issue.dateline} · {issue._count.pieces} contributions · Updated {issue.updatedAt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}</p></div>
          <span className="text-xs font-semibold capitalize text-muted">{issue.status}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">View issue <ArrowRight size={14} /></span>
        </Link>
      </li>)}
      </ul>
    </section>}
  </div>;
}
