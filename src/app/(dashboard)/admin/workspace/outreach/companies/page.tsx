/**
 * Workspace → Outreach → Companies. Every organisation in the directory,
 * grouped from the contacts' Org field, with reach, engagement and deals.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { Card } from "@/components/ui/Card";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { crmPeople } from "@/lib/outreach/crm-server";
import { cad, orgKey } from "@/lib/outreach/crm";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const [people, deals] = await Promise.all([
    crmPeople(),
    prisma.outreachDeal.findMany({ where: { stage: { notIn: ["lost"] } }, select: { org: true, amount: true, stage: true } }),
  ]);

  const orgs = new Map<string, { name: string; contacts: number; withEmail: number; touches: number; best: number; last: string | null; open: number; won: number }>();
  for (const p of people) {
    const name = (p.values.org ?? "").trim();
    if (!name) continue;
    const k = orgKey(name);
    const o = orgs.get(k) ?? { name, contacts: 0, withEmail: 0, touches: 0, best: 0, last: null, open: 0, won: 0 };
    o.contacts++;
    if ((p.values.email ?? "").includes("@")) o.withEmail++;
    o.touches += p.touchCount;
    o.best = Math.max(o.best, p.score);
    if (p.lastTouchAt && (!o.last || p.lastTouchAt > o.last)) o.last = p.lastTouchAt;
    orgs.set(k, o);
  }
  for (const d of deals) {
    const o = orgs.get(orgKey(d.org));
    if (!o) continue;
    if (d.stage === "won") o.won += d.amount; else o.open += d.amount;
  }
  const rows = [...orgs.values()].sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name));
  const th = "sticky top-0 bg-card-solid px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-subtle";

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Building2 size={11} /> Workspace · Marketing</>}
        title="Companies"
        description="Organisations, grouped from each contact's Org field. Open one to see its people on Contacts."
      />
      <OutreachNav />
      <Card className="max-h-[75vh] overflow-auto p-0">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="border-b border-line">
            <tr><th className={th}>Organisation</th><th className={`${th} text-right`}>Contacts</th><th className={`${th} text-right`}>Reach-outs</th><th className={`${th} text-right`}>Best score</th><th className={th}>Last touch</th><th className={`${th} text-right`}>Open deals</th><th className={`${th} text-right`}>Won</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((o) => (
              <tr key={o.name} className="hover:bg-elevated/30">
                <td className="px-3 py-2"><Link href={`/admin/workspace/outreach/contacts?q=${encodeURIComponent(o.name)}`} className="font-semibold text-fg hover:text-brand-700">{o.name}</Link></td>
                <td className="px-3 py-2 text-right tabular-nums">{o.contacts}<span className="text-subtle"> ({o.withEmail} with email)</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{o.touches}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.best}</td>
                <td className="px-3 py-2 text-muted">{o.last ? new Date(o.last).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.open ? cad(o.open) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.won ? cad(o.won) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No organisations yet — add an Org to your contacts.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
