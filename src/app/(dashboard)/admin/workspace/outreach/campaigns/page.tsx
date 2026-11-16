/**
 * Workspace → Marketing → Outreach → Campaigns. A campaign is a planned,
 * trackable cross-promotion push: one email template against a target audience
 * (a list, or everyone), with a per-recipient send roster and progress.
 */
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { crmPeople } from "@/lib/outreach/crm-server";
import { matchesFilter, sanitizeFilter } from "@/lib/outreach/crm";
import { CampaignsClient, type CampaignCard } from "@/components/workspace/CampaignsClient";
import { ensureOutreachDirectory } from "@/lib/outreach/directory";
import { getOutreachTemplateOverrides, resolveTemplates } from "@/lib/outreach/templates";

export const dynamic = "force-dynamic";

const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export default async function OutreachCampaignsPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  await ensureOutreachDirectory((session.user as { id?: string }).id ?? null);

  const [campaigns, lists, peopleCount, overrides] = await Promise.all([
    prisma.outreachCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { list: { select: { name: true } } },
    }),
    prisma.outreachList.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, filter: true, _count: { select: { memberships: true } } },
    }),
    prisma.outreachPerson.count(),
    getOutreachTemplateOverrides(),
  ]);

  const templates = resolveTemplates(overrides).map((t) => ({ id: t.id, label: t.label, when: t.when }));
  const listCount = new Map(lists.map((l) => [l.id, l._count.memberships]));
  // Smart lists have no memberships; count whoever matches right now.
  if (lists.some((l) => l.filter)) {
    const people = await crmPeople();
    for (const l of lists) {
      const f = sanitizeFilter(l.filter);
      if (f) listCount.set(l.id, people.filter((p) => matchesFilter(p, f)).length);
    }
  }

  const cards: CampaignCard[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    listId: c.listId,
    listName: c.list?.name ?? null,
    templateLabel: templates.find((t) => t.id === c.templateId)?.label ?? c.templateId,
    reached: asIds(c.sentPersonIds).length,
    total: c.listId ? (listCount.get(c.listId) ?? 0) : peopleCount,
    createdByName: c.createdByName,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Megaphone size={11} /> Workspace · Marketing</>}
        title="Outreach campaigns"
        description="Run a coordinated cross-promotion push: pick a target list and an email template, then work down a personalised roster — copy or open each email, and mark contacts reached to track progress. Every send is logged to the contact's reach-out history."
      />
      <OutreachNav />
      <CampaignsClient
        campaigns={cards}
        lists={lists.map((l) => ({ id: l.id, name: l.filter ? `${l.name} (smart)` : l.name, count: listCount.get(l.id) ?? 0 }))}
        peopleCount={peopleCount}
        templates={templates}
      />
    </div>
  );
}
