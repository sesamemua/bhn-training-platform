import { Inbox, UserCog, Coins, Layers, Building2, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { QueueLane } from "@/components/admin/QueueLane";
import { ActivityFeed, type ActivityRow } from "@/components/admin/ActivityFeed";

export const dynamic = "force-dynamic";

/**
 * Admin "letter box" — one place to see everything waiting on an
 * admin's review. The four streams that funnel here are existing
 * pages (still individually accessible via the sidebar); this page
 * is a hub, not a replacement.
 */
export default async function AdminInboxPage() {
  await requireRole("admin");

  const [
    pendingRoleChanges,
    pendingCreditApps,
    pendingPathwayEnrolments,
    pendingAccessRequests,
    recentRoleChanges,
    recentCreditApps,
    recentPathway,
    recentAccess,
  ] = await Promise.all([
    prisma.roleChangeRequest.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.creditApplication.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.pathwayEnrollment.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.accessRequest.count({ where: { status: "pending" } }).catch(() => 0),

    prisma.roleChangeRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { name: true, email: true } } },
    }).catch(() => []),
    prisma.creditApplication.findMany({
      where: { status: "pending" },
      orderBy: { submittedAt: "desc" },
      take: 6,
      include: { user: { select: { name: true, email: true } } },
    }).catch(() => []),
    prisma.pathwayEnrollment.findMany({
      where: { status: "pending" },
      orderBy: { enrolledAt: "desc" },
      take: 6,
      include: { pathway: { select: { title: true } } },
    }).catch(() => []),
    prisma.accessRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }).catch(() => []),
  ]);

  const total = pendingRoleChanges + pendingCreditApps + pendingPathwayEnrolments + pendingAccessRequests;

  // Combine everything into a single time-ordered feed for the
  // unified-view at the bottom.
  const rows: ActivityRow[] = [
    ...recentRoleChanges.map((r) => ({
      kind: "Role change",
      icon: UserCog,
      iconCls: "bg-amber-50 text-amber-700 border-amber-200",
      title: `${r.user?.name ?? r.user?.email ?? "user"} → ${r.toRole}`,
      subtitle: r.fromRole ? `from ${r.fromRole}` : "",
      href: "/admin/role-requests",
      at: r.createdAt,
    })),
    ...recentCreditApps.map((c) => ({
      kind: "Credit application",
      icon: Coins,
      iconCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      title: `${c.user?.name ?? c.user?.email ?? "user"} · ${Math.round(c.requestedAmount)} credits`,
      subtitle: c.organization ?? "",
      href: "/admin/credit-applications",
      at: c.submittedAt,
    })),
    ...recentPathway.map((p) => ({
      kind: "Pathway enrolment",
      icon: Layers,
      iconCls: "bg-violet-50 text-violet-700 border-violet-200",
      title: p.pathway.title,
      subtitle: p.requestReason ? p.requestReason.slice(0, 80) : "",
      href: "/admin/pathway-enrollments",
      at: p.enrolledAt,
    })),
    ...recentAccess.map((a) => ({
      kind: "Access request",
      icon: Building2,
      iconCls: "bg-brand-50 text-brand-700 border-brand-200",
      title: `${a.kind === "employer" ? "Employer" : "Trainee"} · ${a.name ?? a.email}`,
      subtitle: a.company ?? "",
      href: "/admin/access-requests",
      at: a.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Inbox size={11} /> Admin</>}
        title="Admin inbox"
        description="Everything waiting on admin review, in one place. Each stream still has its own dedicated page in the sidebar — this is the hub for what needs my attention."
      />

      {total === 0 ? (
        <section className="bg-card border border-line rounded-2xl p-16 text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3" />
          <p className="font-semibold text-fg">All caught up</p>
          <p className="text-sm text-muted mt-1">Nothing in any of the four queues. Treat yourself.</p>
        </section>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QueueLane
            href="/admin/role-requests"
            icon={UserCog}
            label="Role changes"
            count={pendingRoleChanges}
            tone="amber"
          />
          <QueueLane
            href="/admin/credit-applications"
            icon={Coins}
            label="Credit apps"
            count={pendingCreditApps}
            tone="emerald"
          />
          <QueueLane
            href="/admin/pathway-enrollments"
            icon={Layers}
            label="Pathway enrolments"
            count={pendingPathwayEnrolments}
            tone="violet"
          />
          <QueueLane
            href="/admin/access-requests"
            icon={Building2}
            label="Access requests"
            count={pendingAccessRequests}
            tone="brand"
          />
        </div>
      )}

      {rows.length > 0 && <ActivityFeed title="Most recent" rows={rows} meta={`${rows.length} of ${total}`} />}
    </div>
  );
}
