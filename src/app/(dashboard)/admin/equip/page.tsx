/**
 * /admin/equip — review queue.
 *
 * Mirrors the layout of /admin/credit-applications so reviewers
 * who know that surface feel at home. Tab filter, table, per-row
 * "Review" links. Counts come from the same endpoint that lists
 * the apps.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, ArrowRight, AlertTriangle, Rocket, Beaker, Mail, Lightbulb } from "lucide-react";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { DSSection } from "@/components/design-system/DSSection";
import { DSStatGrid, DSStat } from "@/components/design-system/DSStatGrid";
import { EquipDemoTools } from "@/components/admin/equip/EquipDemoTools";
import {
  STREAM_META, STATUS_META,
  type EquipStatus, type EquipStream,
} from "@/lib/equip/types";
import { institutionLabel } from "@/lib/equip/institutions";
import { applicantOf } from "@/lib/equip/applicant";

export const dynamic = "force-dynamic";

const TABS: { id: string; label: string }[] = [
  { id: "open",        label: "Open" },
  { id: "submitted",   label: "Submitted" },
  { id: "under_review",label: "Under review" },
  { id: "approved",    label: "Approved" },
  { id: "rejected",    label: "Not selected" },
  { id: "funded",      label: "Funded" },
  { id: "all",         label: "All" },
];

export default async function AdminEquipPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) redirect("/dashboard");

  const params = await searchParams;
  const activeTab = params.status ?? "open";

  // Build the where clause manually since we want "open" =
  // submitted + under_review (a synthetic filter not stored as
  // a status value).
  const where = activeTab === "all"
    ? {}
    : activeTab === "open"
      ? { status: { in: ["submitted", "under_review"] } }
      : { status: activeTab };

  // Resilient: when the EquipApplication table is missing
  // (migration not yet provisioned), render the queue empty with
  // a banner instead of crashing.
  type QueueRow = {
    id: string;
    stream: string;
    status: string;
    requestedAmount: number | null;
    approvedAmount: number | null;
    institution: string | null;
    institutionOther: string | null;
    applicantType: string | null;
    submittedAt: Date | null;
    decidedAt: Date | null;
    fundedAt: Date | null;
    updatedAt: Date;
    /* Null for a public application — nobody signed in to file it.
       Read it through applicantOf() rather than here. */
    user: { id: string; name: string | null; email: string } | null;
    applicantName?: string | null;
    applicantEmail?: string | null;
    reviewer: { id: string; name: string | null } | null;
  };
  let apps: QueueRow[] = [];
  let counts: { status: string; _count: { _all: number } }[] = [];
  let totalFunded: { _sum: { approvedAmount: number | null } } = { _sum: { approvedAmount: 0 } };
  let tableMissing = false;
  try {
    [apps, counts] = await Promise.all([
      prisma.equipApplication.findMany({
        where,
        orderBy: [{ status: "asc" }, { submittedAt: "desc" }, { updatedAt: "desc" }],
        take: 100,
        select: {
          id: true, stream: true, status: true,
          requestedAmount: true, approvedAmount: true,
          institution: true, institutionOther: true,
          applicantType: true,
          submittedAt: true, decidedAt: true, fundedAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          applicantName: true, applicantEmail: true,
          reviewer: { select: { id: true, name: true } },
        },
      }),
      prisma.equipApplication.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);
    totalFunded = await prisma.equipApplication.aggregate({
      where: { OR: [{ status: "approved" }, { status: "funded" }] },
      _sum: { approvedAmount: true },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    console.error("[admin/equip] prisma query failed", {
      message: msg,
      name: (err as Error).name,
      stack: (err as Error).stack?.split("\n").slice(0, 5).join("\n"),
    });
    tableMissing = /does not exist|P2021|relation/i.test(msg);
  }

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const totalOpen = (byStatus.submitted ?? 0) + (byStatus.under_review ?? 0);
  const totalApproved = (byStatus.approved ?? 0) + (byStatus.funded ?? 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Back-link removed — the editorial hero owns the top of the
          page; the sidebar handles cross-page navigation. */}
      <DSPageHeader
        eyebrow="Admin · Equip pillar"
        title="Equip review queue"
        description={
          <>
            VentureConnect, VentureLift, and Innovation Fellowship submissions. Click a row to review, leave a note, and decide.
            {" "}For the program-management dashboard (apps in flight, stalled-app alerts, per-stream funnel),{" "}
            <Link href="/admin/equip/overview" className="text-amber-200 font-bold underline decoration-amber-200/60 underline-offset-2 hover:text-amber-100 transition-colors">open the Equip overview →</Link>
          </>
        }
      />

      {/* Quick action: the applicant-email gallery (VC + VL templates). */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/equip/email-templates"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Mail size={15} />
          <span className="font-extrabold tracking-tight">Email templates</span>
          <ArrowRight size={15} />
        </Link>
        <span className="text-[12px] text-muted">
          View, edit, and AI-rewrite every email applicants get — VentureConnect &amp; VentureLift, all lifecycle steps.
        </span>
      </div>

      {tableMissing && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-700 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-900 leading-relaxed">
            <p className="font-bold">EquipApplication table isn&apos;t provisioned yet.</p>
            <p className="mt-1">
              Migration <code className="font-mono bg-amber-100 px-1 rounded">20260620000000_equip_application_pipeline</code>{" "}
              hasn&apos;t run — likely because a prior attempt is marked failed in <code className="font-mono bg-amber-100 px-1 rounded">_prisma_migrations</code>.
              On Neon, run:
            </p>
            <pre className="bg-amber-900 text-amber-50 text-[11px] font-mono p-2 rounded mt-2 overflow-x-auto">
{`DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260620000000_equip_application_pipeline';`}
            </pre>
            <p className="mt-2">Then redeploy. The queue will populate on the next request.</p>
          </div>
        </section>
      )}

      <DSStatGrid>
        <DSStat label="Open" value={totalOpen} help="submitted + under review" tone="amber" />
        <DSStat label="Approved" value={totalApproved} help="approved + funded" tone="emerald" />
        <DSStat label="Funded $" value={`$${(totalFunded._sum.approvedAmount ?? 0).toLocaleString()}`} help="total approved amount" tone="violet" />
        <DSStat label="Drafts" value={byStatus.draft ?? 0} help="not yet submitted" tone="brand" />
      </DSStatGrid>

      {/* Tab filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const count = tab.id === "open"
            ? totalOpen
            : tab.id === "all"
              ? Object.values(byStatus).reduce((a, b) => a + b, 0)
              : (byStatus[tab.id] ?? 0);
          return (
            <Link
              key={tab.id}
              href={`/admin/equip?status=${tab.id}`}
              className={
                "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ring-1 transition-colors " +
                (isActive
                  ? "bg-brand-600 text-white ring-brand-700"
                  : "bg-card-solid text-fg ring-line hover:bg-elevated")
              }
            >
              {tab.label}
              <span className={"text-[10px] tabular-nums font-bold " + (isActive ? "text-white/70" : "text-muted")}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <DSSection eyebrow="Most-recent first" title="Applications" icon={<Rocket size={14} className="text-brand-600" />}>
        {apps.length === 0 ? (
          <p className="text-sm text-subtle">No applications in this view.</p>
        ) : (
          <div className="rounded-xl border border-line overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-subtle">
                <tr>
                  <th className="text-left px-3 py-2">Applicant</th>
                  <th className="text-left px-3 py-2">Stream</th>
                  <th className="text-left px-3 py-2">Institution</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-left px-3 py-2">Reviewer</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => {
                  // Defensive lookups — see equip/page.tsx for rationale.
                  const meta = STATUS_META[a.status as EquipStatus] ?? { label: a.status, tone: "neutral" as const };
                  const stream = STREAM_META[a.stream as EquipStream] ?? { name: a.stream, blurb: "", cadence: "", bestFor: "" };
                  return (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <p className="text-fg font-semibold">{applicantOf(a).name}</p>
                        <p className="text-[10px] text-subtle">{applicantOf(a).email}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-fg">
                          {a.stream === "venture_lift"
                            ? <Rocket size={11} />
                            : a.stream === "innovation_fellowship"
                              ? <Lightbulb size={11} />
                              : <Beaker size={11} />}
                          {stream.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted truncate max-w-[180px]">
                        {institutionLabel(a.institution, a.institutionOther)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-mono text-fg">
                        {a.approvedAmount
                          ? `$${a.approvedAmount.toLocaleString()}`
                          : a.requestedAmount
                            ? `$${a.requestedAmount.toLocaleString()}`
                            : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-subtle">
                        {a.submittedAt ? a.submittedAt.toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted">{a.reviewer?.name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={meta.tone} label={meta.label} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/admin/equip/${a.id}`}
                          className="text-xs font-bold text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5"
                        >
                          Review <ArrowRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DSSection>

      <EquipDemoTools />
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: string; label: string }) {
  const toneClass =
    tone === "emerald" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" :
    tone === "amber"   ? "bg-amber-50 text-amber-800 ring-amber-200" :
    tone === "rose"    ? "bg-rose-50 text-rose-800 ring-rose-200" :
    tone === "violet"  ? "bg-violet-50 text-violet-800 ring-violet-200" :
    tone === "brand"   ? "bg-brand-50 text-brand-800 ring-brand-200" :
                         "bg-elevated text-muted ring-line";
  return (
    <span className={"inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ring-inset " + toneClass}>
      {label}
    </span>
  );
}
