/** Workspace → Outreach → Tasks. Follow-ups for the team, plus sequence emails that are due. */
import { redirect } from "next/navigation";
import { CheckSquare } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { TasksClient } from "@/components/workspace/crm/TasksClient";
import { crmOwners } from "@/lib/outreach/crm-server";
import { sanitizeSteps } from "@/lib/outreach/crm";
import { resolveOutreachTemplate } from "@/lib/outreach/templates";

export const dynamic = "force-dynamic";

const vals = (v: unknown) => (v ?? {}) as Record<string, string>;

export default async function TasksPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const me = session.user as { id?: string; name?: string };
  const endOfToday = new Date(new Date().setHours(23, 59, 59, 999));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [tasks, due, owners] = await Promise.all([
    prisma.outreachTask.findMany({
      where: { OR: [{ doneAt: null }, { doneAt: { gte: weekAgo } }] },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      include: { person: { select: { values: true } }, deal: { select: { name: true } } },
    }),
    prisma.outreachEnrollment.findMany({
      where: { status: "active", nextDueAt: { lte: endOfToday } },
      orderBy: { nextDueAt: "asc" },
      include: { person: { select: { values: true } }, sequence: { select: { name: true, steps: true } } },
    }),
    crmOwners(),
  ]);

  const steps = due.flatMap((e) => {
    const all = sanitizeSteps(e.sequence.steps);
    const st = all?.[e.step];
    if (!all || !st) return [];
    const v = vals(e.person.values);
    const { subject, body } = resolveOutreachTemplate(
      { id: "sequence", label: "", when: "", subject: st.subject, body: st.body },
      { firstName: (v.name ?? "").split(" ")[0], contactName: v.name ?? "", org: v.org ?? "", senderName: me.name ?? "" },
    );
    return [{
      id: e.id, personId: e.personId, personName: v.name || v.email || "Unnamed", email: v.email ?? "",
      sequenceName: e.sequence.name, step: e.step, total: all.length, dueAt: e.nextDueAt?.toISOString() ?? null, subject, body,
    }];
  });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><CheckSquare size={11} /> Workspace · Marketing</>}
        title="Tasks"
        description="Follow-ups for the team and the sequence emails that are due today."
      />
      <OutreachNav />
      <TasksClient
        meId={me.id ?? null}
        owners={owners}
        steps={steps}
        tasks={tasks.map((t) => ({
          id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, doneAt: t.doneAt?.toISOString() ?? null,
          assigneeId: t.assigneeId, assigneeName: t.assigneeName, personId: t.personId,
          personName: t.person ? (vals(t.person.values).name || vals(t.person.values).email || "Contact") : null,
          dealName: t.deal?.name ?? null,
        }))}
      />
    </div>
  );
}
