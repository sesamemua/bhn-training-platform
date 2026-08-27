/**
 * /admin/equip/overview — Equip program-management dashboard.
 *
 * Audience: admins + equip_review committee. The existing
 * /admin/equip page is a tab-filtered review QUEUE — this is the
 * complementary command-center surface that answers "how is the
 * Equip program doing right now?" at a glance.
 *
 * Sections, top to bottom:
 *   1. Studio hero with 4 stat tiles — apps in flight, approved
 *      this quarter, $ funded YTD, open windows.
 *   2. Alerts row — stalled-in-submitted, stalled-in-review,
 *      deadlines closing soon. Each links into a filtered view
 *      of the review queue.
 *   3. Per-stream funnel — VentureConnect + VentureLift side by
 *      side, status → count, ordered by the pipeline shape.
 *   4. Open deadlines panel — currently-open windows, their
 *      close timestamps, and how many in-flight apps are
 *      competing in each.
 *   5. Recent activity — last 10 status changes across all apps,
 *      chronological newest first.
 *   6. Committee bench — active equip_review members count + a
 *      shortcut to /admin/committees.
 *
 * All counts come from a single batched Promise.all so the page
 * server-renders fast. Studio styling is opted into via a
 * top-level DesignSystemProvider override — the rest of /admin/*
 * stays on the platform-default DS.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Rocket, Beaker, Activity, AlertTriangle,
  Clock, DollarSign, FileText, ListChecks, Users2, CalendarClock,
  Sparkles, ChevronRight,
} from "lucide-react";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { DesignSystemProvider } from "@/components/ui/DesignSystemProvider";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { DSSection } from "@/components/design-system/DSSection";
import { DSStatGrid, DSStat } from "@/components/design-system/DSStatGrid";
import { STATUS_META, STREAM_META, type EquipStatus, type EquipStream } from "@/lib/equip/types";
import { applicantOf } from "@/lib/equip/applicant";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7  * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export default async function EquipOverviewPage() {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) redirect("/dashboard");

  const now = new Date();
  const sevenDaysAgo    = new Date(now.getTime() - SEVEN_DAYS_MS);
  const fourteenDaysAgo = new Date(now.getTime() - FOURTEEN_DAYS_MS);
  const twoDaysFromNow  = new Date(now.getTime() + TWO_DAYS_MS);
  const startOfQuarter  = (() => {
    // Calendar quarter — Jan/Apr/Jul/Oct 1st.
    const m = now.getMonth();
    const qStart = m - (m % 3);
    return new Date(now.getFullYear(), qStart, 1);
  })();
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [
    inFlightCount,
    approvedThisQuarterCount,
    fundedYtdSum,
    openWindowsCount,
    stalledSubmittedCount,
    stalledReviewCount,
    closingDeadlines,
    perStreamCounts,
    openDeadlines,
    recentActivity,
    activeCommittee,
    rejectedThisQuarterCount,
  ] = await Promise.all([
    prisma.equipApplication.count({
      where: { status: { in: ["submitted", "under_review", "pre_screen_approved"] } },
    }),
    prisma.equipApplication.count({
      where: { status: { in: ["approved", "funded"] }, decidedAt: { gte: startOfQuarter } },
    }),
    prisma.equipApplication.aggregate({
      where: { status: { in: ["approved", "funded"] }, decidedAt: { gte: startOfYear } },
      _sum: { approvedAmount: true },
    }),
    prisma.equipDeadline.count({
      where: { status: { in: ["open", "extended"] }, deadlineAt: { gte: now } },
    }),
    prisma.equipApplication.count({
      where: { status: "submitted", submittedAt: { lt: sevenDaysAgo } },
    }),
    prisma.equipApplication.count({
      where: { status: "under_review", reviewedAt: { lt: fourteenDaysAgo } },
    }),
    prisma.equipDeadline.findMany({
      where: { status: { in: ["open", "extended"] }, deadlineAt: { gte: now, lte: twoDaysFromNow } },
      orderBy: { deadlineAt: "asc" },
      take: 5,
    }),
    prisma.equipApplication.groupBy({
      by: ["stream", "status"],
      _count: { _all: true },
    }),
    prisma.equipDeadline.findMany({
      where: { status: { in: ["open", "extended"] }, deadlineAt: { gte: now } },
      orderBy: { deadlineAt: "asc" },
      take: 6,
    }),
    prisma.equipApplication.findMany({
      where: { status: { not: "draft" } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true, stream: true, status: true, requestedAmount: true, approvedAmount: true,
        submittedAt: true, decidedAt: true, fundedAt: true, updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.committeeMembership.count({ where: { committee: "equip_review", active: true } }),
    prisma.equipApplication.count({
      where: { status: { in: ["rejected", "pre_screen_rejected"] }, decidedAt: { gte: startOfQuarter } },
    }),
  ]);

  const fundedYtd = fundedYtdSum._sum.approvedAmount ?? 0;

  // Reshape groupBy into nested map: { venture_connect: { submitted: N, … } }
  const byStream: Record<string, Record<string, number>> = { venture_connect: {}, venture_lift: {} };
  for (const row of perStreamCounts) {
    const s = row.stream;
    const st = row.status;
    if (!byStream[s]) byStream[s] = {};
    byStream[s][st] = (byStream[s][st] ?? 0) + row._count._all;
  }

  // Per-deadline open apps counted in a second pass (need this
  // outside the Promise.all because it depends on openDeadlines).
  const deadlineAppCounts: Record<string, number> = {};
  await Promise.all(
    openDeadlines.map(async (d) => {
      deadlineAppCounts[d.id] = await prisma.equipApplication.count({
        where: { stream: d.stream, status: { in: ["submitted", "under_review", "pre_screen_approved"] } },
      });
    }),
  );

  // Decision velocity — average days from submittedAt to decidedAt
  // for apps decided this quarter. Compute in-memory from the rows
  // we already pulled.
  const decidedThisQuarter = await prisma.equipApplication.findMany({
    where: {
      decidedAt: { gte: startOfQuarter },
      submittedAt: { not: null },
      status: { in: ["approved", "rejected", "funded", "pre_screen_rejected"] },
    },
    select: { submittedAt: true, decidedAt: true },
  });
  const avgDaysToDecision = decidedThisQuarter.length > 0
    ? Math.round(
        decidedThisQuarter.reduce<number>((s, r) => {
          if (!r.submittedAt || !r.decidedAt) return s;
          return s + (r.decidedAt.getTime() - r.submittedAt.getTime()) / (24 * 60 * 60 * 1000);
        }, 0) / decidedThisQuarter.length,
      )
    : null;

  return (
    // Previously route-scoped to Studio; reverted to platform default
    // (Cinematic as of 2026-05-17) so admin tools share the same
    // editorial look as the rest of the platform. HR Overview at
    // /employer keeps its Studio override; admin Equip overview is a
    // workspace surface, not a brand stage.
    <DesignSystemProvider value="cinematic">
      <div className="space-y-6">
        {/* Back-link removed — the editorial hero is the absolute top
            of the page; the sidebar's EQUIP entry handles navigation
            back to the review queue. */}
        <DSPageHeader
          eyebrow="Equip · program overview"
          title="How the funding pillar is doing"
          description={
            <>
              Aggregate health of both Equip streams. Stat tiles cover open work, recent decisions, and YTD funding.
              Alerts and the per-stream funnel below let you spot bottlenecks before they age out.
            </>
          }
          aside={
            <DSStatGrid>
              <DSStat onDark icon={<Activity size={12} />}     label="Apps in flight"    value={inFlightCount} help="submitted + under review" />
              <DSStat onDark icon={<Sparkles size={12} />}     label="Approved this Q"   value={approvedThisQuarterCount} help={rejectedThisQuarterCount > 0 ? `${rejectedThisQuarterCount} not selected` : undefined} />
              <DSStat onDark icon={<DollarSign size={12} />}   label="$ approved YTD"    value={`$${fundedYtd.toLocaleString()}`} help="across both streams" />
              <DSStat onDark icon={<CalendarClock size={12} />} label="Open windows"     value={openWindowsCount} help="future-dated cycles" />
            </DSStatGrid>
          }
        />

        {/* ── Alerts row ─────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AlertCard
            tone={stalledSubmittedCount > 0 ? "rose" : "neutral"}
            icon={<AlertTriangle size={16} />}
            title="Apps stalled in submitted"
            value={stalledSubmittedCount}
            blurb={stalledSubmittedCount > 0
              ? "Submitted but not claimed in >7 days. Reviewers should pick these up."
              : "Nothing stalled. Reviewers are on it."}
            href="/admin/equip?status=submitted"
          />
          <AlertCard
            tone={stalledReviewCount > 0 ? "amber" : "neutral"}
            icon={<Clock size={16} />}
            title="Under review > 14 days"
            value={stalledReviewCount}
            blurb={stalledReviewCount > 0
              ? "Claimed but no decision in 2 weeks. Nudge the reviewer."
              : "All in-review apps are within the 14-day window."}
            href="/admin/equip?status=under_review"
          />
          <AlertCard
            tone={closingDeadlines.length > 0 ? "violet" : "neutral"}
            icon={<CalendarClock size={16} />}
            title="Deadlines closing in <48 h"
            value={closingDeadlines.length}
            blurb={closingDeadlines.length > 0
              ? closingDeadlines.map((d) => d.stream === "venture_connect" ? "VC" : "VL").join(" · ")
              : "Nothing closing in the next 48 hours."}
            href="/admin/equip/deadlines"
          />
        </section>

        {/* ── Decision velocity + committee bench ─────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard
            icon={<Activity size={16} />}
            title="Avg days to decision"
            value={avgDaysToDecision == null ? "—" : `${avgDaysToDecision}d`}
            blurb={avgDaysToDecision == null ? "No decided apps this quarter yet." : "Submitted → decided · this quarter"}
          />
          <MetricCard
            icon={<Users2 size={16} />}
            title="Equip review bench"
            value={activeCommittee}
            blurb="Active committee members"
            href="/admin/committees"
          />
          <MetricCard
            icon={<ListChecks size={16} />}
            title="Window competition"
            value={openDeadlines.length > 0 ? openDeadlines.reduce<number>((s, d) => s + (deadlineAppCounts[d.id] ?? 0), 0) : 0}
            blurb="In-flight apps competing across all open windows"
            href="/admin/equip/deadlines"
          />
        </section>

        {/* ── Per-stream funnel ───────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StreamFunnel stream="venture_connect" counts={byStream.venture_connect ?? {}} />
          <StreamFunnel stream="venture_lift"    counts={byStream.venture_lift    ?? {}} />
        </section>

        {/* ── Open deadlines panel ────────────────────────────── */}
        <DSSection eyebrow="Schedule" title="Open funding windows" icon={<CalendarClock size={14} className="text-brand-600" />}>
          {openDeadlines.length === 0 ? (
            <p className="text-xs text-subtle italic">No open windows right now. New apps are blocked until an admin schedules the next cycle.</p>
          ) : (
            <ul className="space-y-2">
              {openDeadlines.map((d) => {
                const stream = STREAM_META[d.stream as EquipStream] ?? { name: d.stream };
                const competing = deadlineAppCounts[d.id] ?? 0;
                return (
                  <li key={d.id} className="rounded-xl bg-elevated/40 border border-line p-3 flex items-center gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      {d.stream === "venture_lift" ? <Rocket size={14} /> : <Beaker size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-fg">{stream.name}{d.cycleLabel ? ` · ${d.cycleLabel}` : ""}</p>
                      <p className="text-[11px] text-muted font-mono">
                        Closes {new Date(d.deadlineAt).toLocaleString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })}
                      </p>
                    </div>
                    <span className="text-[11px] uppercase tracking-wider font-bold bg-brand-100 text-brand-800 ring-1 ring-brand-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Activity size={10} /> {competing} in flight
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </DSSection>

        {/* ── Recent activity ─────────────────────────────────── */}
        <DSSection eyebrow="Newest first" title="Recent activity" icon={<FileText size={14} className="text-brand-600" />}>
          {recentActivity.length === 0 ? (
            <p className="text-xs text-subtle italic">No application activity yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentActivity.map((a) => {
                const meta = STATUS_META[a.status as EquipStatus] ?? { label: a.status, tone: "neutral" as const };
                const stream = STREAM_META[a.stream as EquipStream] ?? { name: a.stream };
                return (
                  <li key={a.id}>
                    <Link href={`/admin/equip/${a.id}`} className="block rounded-xl bg-card-solid hover:bg-elevated border border-line p-3 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 mt-0.5">
                          {a.stream === "venture_lift" ? <Rocket size={14} /> : <Beaker size={14} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-fg truncate">
                            {applicantOf(a).name}
                            <span className="text-muted font-normal"> · {stream.name}</span>
                          </p>
                          <p className="text-[11px] text-subtle font-mono">
                            Updated {new Date(a.updatedAt).toLocaleString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                            {a.approvedAmount ? ` · $${a.approvedAmount.toLocaleString()} approved` : ""}
                          </p>
                        </div>
                        <StatusBadge tone={meta.tone} label={meta.label} />
                        <ArrowRight size={13} className="text-muted shrink-0 mt-2" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </DSSection>
      </div>
    </DesignSystemProvider>
  );
}

// ─── Helper components ──────────────────────────────────────────

function AlertCard({
  tone, icon, title, value, blurb, href,
}: {
  tone: "rose" | "amber" | "violet" | "neutral";
  icon: React.ReactNode;
  title: string;
  value: number;
  blurb: string;
  href: string;
}) {
  const toneCls =
    tone === "rose"    ? "bg-rose-50/60 border-rose-200 text-rose-900"     :
    tone === "amber"   ? "bg-amber-50/60 border-amber-200 text-amber-900"   :
    tone === "violet"  ? "bg-violet-50/60 border-violet-200 text-violet-900" :
                          "bg-card border-line text-fg";
  const iconBg =
    tone === "rose"    ? "bg-rose-100 text-rose-700"     :
    tone === "amber"   ? "bg-amber-100 text-amber-700"   :
    tone === "violet"  ? "bg-violet-100 text-violet-700" :
                          "bg-elevated text-muted";

  return (
    <Link href={href} className={"block rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md " + toneCls}>
      <div className="flex items-start gap-3">
        <div className={"w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " + iconBg}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">{title}</p>
          <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
          <p className="text-[11px] opacity-80 mt-0.5 leading-snug">{blurb}</p>
        </div>
        <ChevronRight size={14} className="opacity-60 shrink-0 mt-1" />
      </div>
    </Link>
  );
}

function MetricCard({
  icon, title, value, blurb, href,
}: {
  icon: React.ReactNode;
  title: string;
  value: number | string;
  blurb: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">{title}</p>
        <p className="text-2xl font-bold text-fg tabular-nums mt-0.5">{value}</p>
        <p className="text-[11px] text-muted mt-0.5 leading-snug">{blurb}</p>
      </div>
      {href && <ChevronRight size={14} className="text-muted shrink-0 mt-1" />}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl border border-line bg-card p-4 hover:bg-elevated transition-colors">
      {inner}
    </Link>
  ) : (
    <div className="rounded-2xl border border-line bg-card p-4">{inner}</div>
  );
}

function StreamFunnel({ stream, counts }: { stream: EquipStream; counts: Record<string, number> }) {
  const meta = STREAM_META[stream] ?? { name: stream, blurb: "", cadence: "", bestFor: "" };
  const stages: { key: string; label: string }[] = stream === "venture_lift"
    ? [
        { key: "draft",                label: "Drafts" },
        { key: "submitted",            label: "Stage 1 submitted" },
        { key: "under_review",         label: "Under review" },
        { key: "pre_screen_approved",  label: "Stage 2 unlocked" },
        { key: "approved",             label: "Approved" },
        { key: "funded",               label: "Funded" },
      ]
    : [
        { key: "draft",        label: "Drafts" },
        { key: "submitted",    label: "Submitted" },
        { key: "under_review", label: "Under review" },
        { key: "approved",     label: "Approved" },
        { key: "funded",       label: "Funded" },
      ];
  const max = Math.max(1, ...stages.map((s) => counts[s.key] ?? 0));
  return (
    <div className="rounded-2xl border border-line bg-card overflow-hidden">
      <header className="px-5 py-3 border-b border-line flex items-center gap-2">
        {stream === "venture_lift" ? <Rocket size={14} className="text-brand-600" /> : <Beaker size={14} className="text-brand-600" />}
        <p className="font-bold text-fg text-sm">{meta.name}</p>
        <span className="text-[10px] text-subtle ml-auto">{meta.cadence}</span>
      </header>
      <ul className="divide-y divide-line">
        {stages.map((s) => {
          const n = counts[s.key] ?? 0;
          const pct = max > 0 ? Math.round((n / max) * 100) : 0;
          return (
            <li key={s.key} className="px-5 py-2.5">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-fg flex-1 truncate">{s.label}</span>
                <span className="font-mono tabular-nums text-fg font-bold">{n}</span>
              </div>
              <div className="mt-1 h-1.5 bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: string; label: string }) {
  const toneClass =
    tone === "emerald" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" :
    tone === "amber"   ? "bg-amber-50 text-amber-800 ring-amber-200"       :
    tone === "rose"    ? "bg-rose-50 text-rose-800 ring-rose-200"          :
    tone === "violet"  ? "bg-violet-50 text-violet-800 ring-violet-200"    :
    tone === "brand"   ? "bg-brand-50 text-brand-800 ring-brand-200"       :
                         "bg-elevated text-muted ring-line";
  return (
    <span className={"inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ring-inset shrink-0 " + toneClass}>
      {label}
    </span>
  );
}
