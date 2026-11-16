/** Workspace → Outreach → Sequences. Multi-step follow-up emails, sent by hand when each step is due. */
import { redirect } from "next/navigation";
import { ListOrdered } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { SequencesClient } from "@/components/workspace/crm/SequencesClient";
import { crmPeople } from "@/lib/outreach/crm-server";
import { matchesFilter, sanitizeFilter, sanitizeSteps } from "@/lib/outreach/crm";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const [sequences, lists, people] = await Promise.all([
    prisma.outreachSequence.findMany({
      where: { archived: false }, orderBy: { createdAt: "desc" },
      include: { enrollments: { select: { status: true } } },
    }),
    prisma.outreachList.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, filter: true, memberships: { select: { personId: true } } } }),
    crmPeople(),
  ]);
  const emailable = new Set(people.filter((p) => !p.unsubscribed && (p.values.email ?? "").includes("@")).map((p) => p.id));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><ListOrdered size={11} /> Workspace · Marketing</>}
        title="Sequences"
        description="A series of follow-up emails spaced over days. Enrol a list; each step waits on Tasks until someone previews and sends it. Unsubscribed contacts are never enrolled."
      />
      <OutreachNav />
      <SequencesClient
        sequences={sequences.map((s) => ({
          id: s.id, name: s.name, steps: sanitizeSteps(s.steps) ?? [],
          active: s.enrollments.filter((e) => e.status === "active").length,
          done: s.enrollments.filter((e) => e.status === "done").length,
          stopped: s.enrollments.filter((e) => e.status === "stopped").length,
        }))}
        lists={lists.map((l) => {
          const f = sanitizeFilter(l.filter);
          const ids = f ? people.filter((p) => matchesFilter(p, f)).map((p) => p.id) : l.memberships.map((m) => m.personId);
          return { id: l.id, name: f ? `${l.name} (smart)` : l.name, personIds: ids.filter((id) => emailable.has(id)) };
        })}
      />
    </div>
  );
}
