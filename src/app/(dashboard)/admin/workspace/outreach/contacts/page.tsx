/**
 * Workspace → Marketing → Outreach → Contacts. Admin-only contact directory +
 * lists for cross-promoting BHN programs. One person can sit on many lists
 * without duplication: shared fields live on the person (edit once, updates
 * everywhere), per-list fields live on the membership.
 */
import { redirect } from "next/navigation";
import { BookUser } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { OutreachBoard, type OutreachData } from "@/components/workspace/OutreachBoard";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import {
  ensureOutreachDirectory, getPersonColumns, DEFAULT_MEMBERSHIP_COLUMNS, type OutreachColumn,
} from "@/lib/outreach/directory";
import {
  getOutreachTemplateOverrides, resolveTemplates, OUTREACH_PLACEHOLDERS,
} from "@/lib/outreach/templates";
import { crmPeople } from "@/lib/outreach/crm-server";
import { sanitizeFilter } from "@/lib/outreach/crm";

export const dynamic = "force-dynamic";

const asValues = (v: unknown): Record<string, string> =>
  typeof v === "object" && v !== null ? (v as Record<string, string>) : {};

export default async function OutreachContactsPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  await ensureOutreachDirectory((session.user as { id?: string }).id ?? null);

  const [personColumns, lists, people, templateOverrides, crm] = await Promise.all([
    getPersonColumns(),
    prisma.outreachList.findMany({
      orderBy: { order: "asc" },
      include: {
        shareTokens: {
          orderBy: { createdAt: "desc" },
          select: { id: true, token: true, label: true, createdAt: true },
        },
        memberships: {
          orderBy: { order: "asc" },
          include: {
            person: {
              include: {
                memberships: { select: { listId: true, list: { select: { name: true } } } },
                touches: { orderBy: { happenedAt: "desc" }, take: 1, select: { happenedAt: true } },
                _count: { select: { touches: true } },
              },
            },
          },
        },
      },
    }),
    prisma.outreachPerson.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        memberships: { select: { listId: true, list: { select: { name: true } } } },
        touches: { orderBy: { happenedAt: "desc" }, take: 1, select: { happenedAt: true } },
        _count: { select: { touches: true } },
      },
    }),
    getOutreachTemplateOverrides(),
    crmPeople(),
  ]);
  const crmById = new Map(crm.map((p) => [p.id, p]));

  const data: OutreachData = {
    personColumns,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      columns: (Array.isArray(l.columns) ? (l.columns as unknown as OutreachColumn[]) : DEFAULT_MEMBERSHIP_COLUMNS),
      filter: sanitizeFilter(l.filter),
      shareLinks: l.shareTokens.map((t) => ({
        id: t.id, token: t.token, label: t.label, createdAt: t.createdAt.toISOString(),
      })),
      rows: l.memberships.map((m) => ({
        membershipId: m.id,
        personId: m.personId,
        personValues: asValues(m.person.values),
        values: asValues(m.values),
        addedByName: m.addedByName,
        createdAt: m.createdAt.toISOString(),
        otherLists: m.person.memberships.filter((x) => x.listId !== l.id).map((x) => x.list.name),
        touchCount: m.person._count.touches,
        lastTouchAt: m.person.touches[0]?.happenedAt.toISOString() ?? null,
      })),
    })),
    directory: people.map((p) => ({
      id: p.id,
      values: asValues(p.values),
      addedByName: p.addedByName,
      createdAt: p.createdAt.toISOString(),
      lists: p.memberships.map((m) => ({ listId: m.listId, name: m.list.name })),
      touchCount: p._count.touches,
      lastTouchAt: p.touches[0]?.happenedAt.toISOString() ?? null,
      introSentAt: p.introSentAt?.toISOString() ?? null,
      lifecycle: p.lifecycle,
      leadStatus: p.leadStatus,
      ownerName: p.ownerName,
      score: crmById.get(p.id)?.score ?? 0,
      unsubscribed: Boolean(p.unsubscribedAt),
    })),
  };

  const emailTemplates = resolveTemplates(templateOverrides);
  const senderName = (session.user as { name?: string }).name ?? "";

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><BookUser size={11} /> Workspace · Marketing</>}
        title="Outreach"
        description="One directory of contacts, organised into lists and smart lists. Edit shared details once and every list updates. Open a contact for their full record: stage, owner, lead score, tasks, deals and every touchpoint."
      />
      <OutreachNav />
      <OutreachBoard
        data={data}
        emailTemplates={emailTemplates}
        templatePlaceholders={OUTREACH_PLACEHOLDERS}
        senderName={senderName}
      />
    </div>
  );
}
