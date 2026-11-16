/**
 * Workspace → Outreach → one contact. The record: properties, lead score,
 * open tasks, deals, sequences, and a timeline of everything the platform
 * knows about them (reach-outs, campaign emails with opens/clicks, form
 * submissions, event registrations, account).
 */
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { CrmRecord } from "@/components/workspace/crm/CrmRecord";
import { crmOwners, crmPeople, timelineFor } from "@/lib/outreach/crm-server";

export const dynamic = "force-dynamic";

export default async function ContactRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { id } = await params;

  const person = await prisma.outreachPerson.findUnique({
    where: { id },
    include: {
      memberships: { select: { list: { select: { id: true, name: true } } } },
      tasks: { where: { doneAt: null }, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }] },
      deals: { orderBy: { updatedAt: "desc" } },
      enrollments: { include: { sequence: { select: { name: true, steps: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!person) notFound();

  const [people, timeline, owners, sequences] = await Promise.all([
    crmPeople(),
    timelineFor(id),
    crmOwners(),
    prisma.outreachSequence.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const crm = people.find((p) => p.id === id)!;

  return (
    <div className="space-y-5">
      <OutreachNav />
      <CrmRecord
        person={{
          id: person.id,
          values: crm.values,
          lifecycle: person.lifecycle,
          leadStatus: person.leadStatus,
          ownerId: person.ownerId,
          source: person.source,
          score: crm.score,
          unsubscribed: Boolean(person.unsubscribedAt),
          lists: person.memberships.map((m) => m.list),
        }}
        tasks={person.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, assigneeName: t.assigneeName }))}
        deals={person.deals.map((d) => ({ id: d.id, name: d.name, stage: d.stage, amount: d.amount }))}
        enrollments={person.enrollments.map((e) => ({
          id: e.id, name: e.sequence.name, status: e.status, step: e.step,
          total: Array.isArray(e.sequence.steps) ? e.sequence.steps.length : 0,
          nextDueAt: e.nextDueAt?.toISOString() ?? null,
        }))}
        timeline={timeline}
        owners={owners}
        sequences={sequences}
      />
    </div>
  );
}
