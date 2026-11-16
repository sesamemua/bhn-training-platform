/**
 * Workspace → Outreach → Dashboard. The marketing numbers in one place:
 * contacts by lifecycle stage, email performance, pipeline, what's due,
 * where sign-ups came from (UTM, totals only), and which forms feed the CRM.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { Card } from "@/components/ui/Card";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { FormCaptureToggles } from "@/components/workspace/crm/FormCaptureToggles";
import { captureFormSlugs, crmPeople } from "@/lib/outreach/crm-server";
import { ensureOutreachDirectory } from "@/lib/outreach/directory";
import { DEAL_STAGES, LIFECYCLE_STAGES, cad, pipelineTotals, scoreBand } from "@/lib/outreach/crm";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export default async function OutreachDashboardPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  await ensureOutreachDirectory((session.user as { id?: string }).id ?? null);

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since90 = new Date(now - 90 * DAY);
  const endOfToday = new Date(new Date().setHours(23, 59, 59, 999));

  const [people, sends30, campaigns, deals, tasksDue, stepsDue, signups, links, forms, capture] = await Promise.all([
    crmPeople(),
    prisma.outreachSend.findMany({ where: { status: "sent", sentAt: { gte: since30 } }, select: { openedAt: true, clickedAt: true } }),
    prisma.outreachCampaign.findMany({
      orderBy: { createdAt: "desc" }, take: 6,
      select: { id: true, name: true, sends: { where: { status: "sent" }, select: { openedAt: true, clickedAt: true } } },
    }),
    prisma.outreachDeal.findMany({ select: { stage: true, amount: true } }),
    prisma.outreachTask.findMany({ where: { doneAt: null, dueAt: { lte: endOfToday } }, select: { dueAt: true } }),
    prisma.outreachEnrollment.count({ where: { status: "active", nextDueAt: { lte: endOfToday } } }),
    prisma.event.findMany({ where: { name: "register", createdAt: { gte: since90 } }, select: { props: true } }),
    prisma.outreachLink.findMany({ orderBy: { clicks: "desc" }, take: 5, select: { slug: true, label: true, clicks: true } }),
    prisma.eventForm.findMany({ orderBy: { createdAt: "desc" }, take: 40, select: { slug: true, title: true } }),
    captureFormSlugs(),
  ]);

  const newContacts = people.filter((p) => new Date(p.createdAt).getTime() >= since30.getTime()).length;
  const byStage = LIFECYCLE_STAGES.map((s) => ({ ...s, n: people.filter((p) => p.lifecycle === s.key).length }));
  const maxStage = Math.max(1, ...byStage.map((s) => s.n));
  const hot = people.filter((p) => scoreBand(p.score) === "hot").length;
  const opened = sends30.filter((s) => s.openedAt).length;
  const clicked = sends30.filter((s) => s.clickedAt).length;
  const pipe = pipelineTotals(deals);
  const overdue = tasksDue.filter((t) => t.dueAt && t.dueAt.getTime() < new Date().setHours(0, 0, 0, 0)).length;

  const sources = new Map<string, number>();
  for (const e of signups) {
    const a = (e.props as { attribution?: { utm_source?: string } } | null)?.attribution;
    const src = a?.utm_source?.toLowerCase() || "direct / none";
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }
  const topSources = [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSource = Math.max(1, ...topSources.map(([, n]) => n));

  const tile = (label: string, value: string, sub: string, href?: string) => {
    const inner = (
      <>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{value}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>
      </>
    );
    return href
      ? <Link href={href} className="block rounded-xl border border-line bg-card-solid p-4 hover:border-brand-300">{inner}</Link>
      : <div className="rounded-xl border border-line bg-card-solid p-4">{inner}</div>;
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Gauge size={11} /> Workspace · Marketing</>}
        title="Outreach dashboard"
        description="Contacts, email performance, pipeline and what's due — the marketing numbers in one place."
      />
      <OutreachNav />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tile("Contacts", people.length.toLocaleString(), `${newContacts} new in 30 days · ${hot} hot`, "/admin/workspace/outreach/contacts")}
        {tile("Emails · 30 days", sends30.length.toLocaleString(), `${pct(opened, sends30.length)} opened · ${pct(clicked, sends30.length)} clicked`, "/admin/workspace/outreach/campaigns")}
        {tile("Open pipeline", cad(pipe.open), `${cad(pipe.weighted)} weighted · ${cad(pipe.won)} won`, "/admin/workspace/outreach/deals")}
        {tile("Due today", String(tasksDue.length + stepsDue), `${overdue} overdue · ${stepsDue} sequence email${stepsDue === 1 ? "" : "s"}`, "/admin/workspace/outreach/tasks")}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg">Contacts by lifecycle stage</h2>
          <ul className="mt-3 space-y-2">
            {byStage.map((s) => (
              <li key={s.key}>
                <Link href={`/admin/workspace/outreach/contacts?stage=${s.key}`} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs hover:text-brand-700">
                  <span className="truncate text-muted">{s.label}</span>
                  <span className="h-2 rounded-full bg-elevated"><span className="block h-2 rounded-full bg-brand-500" style={{ width: `${(s.n / maxStage) * 100}%` }} /></span>
                  <span className="text-right font-semibold tabular-nums text-fg">{s.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg">Recent campaigns</h2>
          {campaigns.length === 0 ? <p className="mt-3 text-xs text-muted">No campaigns yet.</p> : (
            <table className="mt-3 w-full text-left text-xs">
              <thead><tr className="text-[10px] uppercase tracking-[0.12em] text-subtle"><th className="pb-1.5 font-bold">Campaign</th><th className="pb-1.5 text-right font-bold">Sent</th><th className="pb-1.5 text-right font-bold">Opened</th><th className="pb-1.5 text-right font-bold">Clicked</th></tr></thead>
              <tbody className="divide-y divide-line">
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5 pr-2"><Link href={`/admin/workspace/outreach/campaigns/${c.id}`} className="font-medium text-fg hover:text-brand-700">{c.name}</Link></td>
                    <td className="py-1.5 text-right tabular-nums">{c.sends.length}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(c.sends.filter((s) => s.openedAt).length, c.sends.length)}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(c.sends.filter((s) => s.clickedAt).length, c.sends.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[11px] text-subtle">Opens are approximate: some mail apps load images automatically, others block them. Clicks are reliable.</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg">Platform sign-ups by source · 90 days</h2>
          {topSources.length === 0 ? <p className="mt-3 text-xs text-muted">No sign-ups in the last 90 days.</p> : (
            <ul className="mt-3 space-y-2">
              {topSources.map(([src, n]) => (
                <li key={src} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                  <span className="truncate text-muted">{src}</span>
                  <span className="h-2 rounded-full bg-elevated"><span className="block h-2 rounded-full bg-emerald-500" style={{ width: `${(n / maxSource) * 100}%` }} /></span>
                  <span className="text-right font-semibold tabular-nums text-fg">{n}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-subtle">From the utm_source on sign-up links. Make tagged links on <Link href="/admin/workspace/outreach/links" className="font-semibold text-brand-700 hover:underline">Tracked links</Link>.</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg">Pipeline by stage</h2>
          <ul className="mt-3 space-y-1.5 text-xs">
            {DEAL_STAGES.map((s) => {
              const ds = deals.filter((d) => d.stage === s.key);
              return (
                <li key={s.key} className="flex items-center justify-between">
                  <span className="text-muted">{s.label} <span className="text-subtle">· {ds.length}</span></span>
                  <span className="font-semibold tabular-nums text-fg">{cad(ds.reduce((a, d) => a + d.amount, 0))}</span>
                </li>
              );
            })}
          </ul>
          {links.length > 0 && (
            <>
              <h3 className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">Top tracked links</h3>
              <ul className="mt-2 space-y-1 text-xs">
                {links.map((l) => (
                  <li key={l.slug} className="flex justify-between gap-2"><span className="truncate text-muted">{l.label || `/go/${l.slug}`}</span><span className="font-semibold tabular-nums">{l.clicks}</span></li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-fg">Forms that add contacts</h2>
        <p className="mt-1 text-[12px] text-muted">When a form is on, each real submission adds the person to Contacts (or logs it on their record if they&apos;re already there). Tests never count.</p>
        <FormCaptureToggles forms={forms} initial={capture} />
      </Card>
    </div>
  );
}
