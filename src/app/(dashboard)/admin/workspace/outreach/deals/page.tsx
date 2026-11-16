/** Workspace → Outreach → Deals. Sponsorship and partnership pipeline by stage. */
import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { DealsBoard } from "@/components/workspace/crm/DealsBoard";

export const dynamic = "force-dynamic";

const label = (v: unknown) => {
  const o = (v ?? {}) as Record<string, string>;
  return [o.name, o.org].filter(Boolean).join(" · ") || o.email || "Unnamed";
};

export default async function DealsPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const [deals, people] = await Promise.all([
    prisma.outreachDeal.findMany({ orderBy: [{ order: "asc" }, { updatedAt: "desc" }], include: { person: { select: { values: true } } } }),
    prisma.outreachPerson.findMany({ select: { id: true, values: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><HandCoins size={11} /> Workspace · Marketing</>}
        title="Deals"
        description="Sponsorships and partnerships from first conversation to signed. Amounts are in Canadian dollars; the weighted total counts each deal by how likely its stage is to close."
      />
      <OutreachNav />
      <DealsBoard
        initial={deals.map((d) => ({
          id: d.id, name: d.name, org: d.org, stage: d.stage, amount: d.amount, closeDate: d.closeDate?.toISOString() ?? null,
          ownerName: d.ownerName, personId: d.personId, personName: d.person ? label(d.person.values) : null,
        }))}
        people={people.map((p) => ({ id: p.id, label: label(p.values) })).sort((a, b) => a.label.localeCompare(b.label))}
      />
    </div>
  );
}
