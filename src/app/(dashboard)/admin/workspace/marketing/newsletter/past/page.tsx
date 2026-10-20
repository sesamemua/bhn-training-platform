import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArrowRight } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentCycle } from "@/lib/newsletter/currentIssue";
import { PageHero } from "@/components/ui/PageHero";
import { NewsletterNav } from "@/components/workspace/NewsletterNav";

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
  return <div className="space-y-6">
    <PageHero eyebrow={<><Archive size={11} /> Workspace · Marketing</>} title="Past newsletter issues" />
    <NewsletterNav />
    {issues.length === 0 ? <p className="py-8 text-sm text-muted">No past issues yet.</p> : <ul className="divide-y divide-line">
      {issues.map((issue) => <li key={issue.id}>
        <Link href={`/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issue.id)}`} className="flex flex-wrap items-center gap-3 py-4 outline-none hover:bg-elevated/40 focus-visible:ring-2 focus-visible:ring-brand-500">
          <div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold">{issue.title}</h2><p className="mt-1 text-xs text-muted">{issue.dateline} · {issue._count.pieces} contributions · Updated {issue.updatedAt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}</p></div>
          <span className="text-xs font-semibold capitalize text-muted">{issue.status}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">View issue <ArrowRight size={14} /></span>
        </Link>
      </li>)}
    </ul>}
  </div>;
}
