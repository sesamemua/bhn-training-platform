/**
 * /equip — landing page for the Equip pillar.
 *
 * Two outcomes from this surface:
 *   1. New applicant       → click "Start an application" → wizard
 *   2. Returning applicant → see existing apps + status, jump back
 *                             into a draft, or start another
 *
 * Server component — composes a few summary stats + a CTA. The
 * heavy lifting lives in /equip/apply/new (wizard) and
 * /equip/apply/[id] (the form).
 *
 * Icon props are passed as React elements (`icon={<Rocket … />}`),
 * not component references — the latter is rejected by Next.js 16 +
 * React 19 + Turbopack when crossing the server → client component
 * boundary. See DSPageHeader.tsx for the full note.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, AlertTriangle, Beaker, Microscope, Rocket, ClipboardList, CalendarClock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { STREAM_META, STATUS_META, type EquipStatus, type EquipStream } from "@/lib/equip/types";
import { DeadlinesCard } from "@/components/equip/DeadlinesCard";
import { derivedDeadlineSpecs, type DerivedDeadlineSpec } from "@/lib/equip/calendar";
import { formatDeadlineEastern } from "@/lib/equip/deadlines";

export const dynamic = "force-dynamic";

type AppRow = {
  id: string;
  stream: string;
  status: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  fundedAt: Date | null;
  updatedAt: Date;
};

/** Next upcoming deadline per stream, from the canonical Equip calendar
 *  (config, not DB) — so it always renders, even before EquipDeadline rows
 *  are synced for this environment. */
function nextDeadlineByStream(): Partial<Record<EquipStream, DerivedDeadlineSpec>> {
  const now = Date.now();
  const specs = derivedDeadlineSpecs()
    .filter((s) => s.deadlineAt.getTime() >= now)
    .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime());
  const out: Partial<Record<EquipStream, DerivedDeadlineSpec>> = {};
  for (const s of specs) if (!out[s.stream]) out[s.stream] = s;
  return out;
}

function daysUntilLabel(d: Date): string {
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export default async function EquipLandingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const userId = (session.user as { id?: string }).id;
  if (!userId) redirect("/login");
  const role = (session.user as { role?: string }).role ?? "trainee";
  const isAdmin = role === "admin" || role === "superadmin";

  let apps: AppRow[] = [];
  let tableMissing = false;
  try {
    apps = await prisma.equipApplication.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true, stream: true, status: true,
        requestedAmount: true, approvedAmount: true,
        submittedAt: true, decidedAt: true, fundedAt: true,
        updatedAt: true,
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    console.error("[equip/page] prisma query failed", {
      message: msg,
      name: (err as Error).name,
      stack: (err as Error).stack?.split("\n").slice(0, 5).join("\n"),
    });
    tableMissing = /does not exist|P2021|relation/i.test(msg);
    apps = [];
  }

  const totalApps = apps.length;
  const totalApproved = apps.filter((a) => a.status === "approved" || a.status === "funded").length;
  const totalFunded = apps
    .filter((a) => a.status === "funded" || a.status === "approved")
    .reduce((sum, a) => sum + (a.approvedAmount ?? 0), 0);
  const hasDraft = apps.some((a) => a.status === "draft");
  const nextDl = nextDeadlineByStream();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <DSPageHeader
        eyebrow="EQUIP · BHN funding pillar"
        title="Funding for your innovation"
        description={
          <>
            <strong>EQUIP</strong> backs trainee-entrepreneurs with strategic
            funding to move biomanufacturing innovations toward market readiness.
            Pick the stream that fits where you are — we&apos;ll pre-fill what we
            already know about you.
          </>
        }
      />

      {tableMissing && isAdmin && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-700 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-900 leading-relaxed">
            <p className="font-bold">EquipApplication table isn&apos;t provisioned yet.</p>
            <p className="mt-1">
              The platform migration <code className="font-mono bg-amber-100 px-1 rounded">20260620000000_equip_application_pipeline</code>{" "}
              hasn&apos;t run against this database — most likely because a prior
              attempt was marked failed in <code className="font-mono bg-amber-100 px-1 rounded">_prisma_migrations</code>.
              On Neon, run:
            </p>
            <pre className="bg-amber-900 text-amber-50 text-[11px] font-mono p-2 rounded mt-2 overflow-x-auto">
{`DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260620000000_equip_application_pipeline';`}
            </pre>
            <p className="mt-2">Then redeploy. Regular users see only the empty-state below; they don&apos;t see this banner.</p>
          </div>
        </section>
      )}

      {/* Next deadlines — auto-hides when no open windows. */}
      <DeadlinesCard />

      {/* ════════════════════════════════════════════════════════════
          LINE + GRADIENT BODY.
          One continuous rounded-3xl outer panel carries a soft brand
          wash from top to bottom. Inside, sections are separated by
          hairline `border-t border-line` rules — no rounded cards
          inside. The eye reads the whole panel as one editorial
          column, not a stack of tiles. */}
      <div
        className="relative overflow-hidden rounded-3xl border border-line"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--brand-50) 0%, var(--card-solid) 35%, var(--card-solid) 70%, var(--brand-50) 100%)",
        }}
      >
        {/* ── KPI strip — line-separated columns, no inner boxes ── */}
        {totalApps > 0 && (
          <section className="px-6 sm:px-9 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-subtle font-bold mb-3">
              At a glance
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
              <Kpi icon={<ClipboardList size={11} />} label="Your apps" value={totalApps.toString()} help="across all streams" />
              <Kpi icon={<Rocket size={11} />}        label="Approved"  value={totalApproved.toString()} help="ready or funded" />
              <Kpi icon={<Microscope size={11} />}    label="Funded"    value={`$${totalFunded.toLocaleString()}`} help="approved total" />
              <Kpi icon={<Beaker size={11} />}        label="Drafts"    value={apps.filter((a) => a.status === "draft").length.toString()} help="saved · in progress" />
            </div>
          </section>
        )}

        {/* ── Pick a stream — gradient hairline + two link-rows ── */}
        <section className={"px-6 sm:px-9 py-7 " + (totalApps > 0 ? "border-t border-line" : "")}>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-700 font-bold mb-1.5">
                Pick a stream
              </p>
              <h2 className="text-[22px] font-bold text-fg leading-tight">Two ways to apply</h2>
              <p className="text-[12.5px] text-muted mt-1.5 max-w-[58ch] leading-relaxed">
                Pick the stream that fits where you are in commercialization. Not sure?
                The next screen has a 3-question wizard that picks one for you.
              </p>
            </div>
            <Link
              href="/equip/apply/new"
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm shadow-brand-600/25 transition-colors shrink-0"
            >
              {hasDraft ? "Continue or start new" : "Start an application"} <ArrowRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-line border-y border-line">
            <StreamRow stream="venture_connect" deadline={nextDl.venture_connect ?? null} hasDraft={apps.some((a) => a.stream === "venture_connect" && a.status === "draft")} />
            <StreamRow stream="venture_lift"    deadline={nextDl.venture_lift ?? null}    hasDraft={apps.some((a) => a.stream === "venture_lift" && a.status === "draft")} />
          </div>
        </section>

        {/* ── My applications — list, line-divided, no card chrome ── */}
        {totalApps > 0 && (
          <section className="px-6 sm:px-9 py-7 border-t border-line">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-700 font-bold mb-1.5">
                  Recent submissions
                </p>
                <h2 className="text-[22px] font-bold text-fg leading-tight">My applications</h2>
              </div>
              <Link
                href="/equip/my-applications"
                className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
              >
                Full history <ArrowRight size={10} />
              </Link>
            </div>
            <ul className="divide-y divide-line border-y border-line">
              {apps.map((a) => {
                const meta = STATUS_META[a.status as EquipStatus] ?? { label: a.status, tone: "neutral" as const };
                const stream = STREAM_META[a.stream as EquipStream] ?? { name: a.stream, blurb: "", cadence: "", bestFor: "" };
                const href = a.status === "draft" ? `/equip/apply/${a.id}` : `/equip/my-applications`;
                return (
                  <li key={a.id}>
                    <Link href={href} className="flex items-center gap-3 py-3 group transition-colors hover:bg-elevated/40 -mx-3 px-3 rounded-md">
                      <span className="w-8 h-8 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                        {a.stream === "venture_lift" ? <Rocket size={13} /> : <Beaker size={13} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-fg block group-hover:text-brand-700 transition-colors">{stream.name}</span>
                        <span className="text-[11px] text-muted block truncate">
                          {a.submittedAt
                            ? `Submitted ${a.submittedAt.toISOString().slice(0, 10)}`
                            : `Saved ${a.updatedAt.toISOString().slice(0, 10)}`}
                          {a.approvedAmount ? ` · $${a.approvedAmount.toLocaleString()} approved` : ""}
                        </span>
                      </span>
                      <StatusBadge tone={meta.tone} label={meta.label} />
                      <ArrowRight size={13} className="text-subtle group-hover:text-brand-700 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers — line + gradient idiom ──────────────────────────── */

/** Hairline-separated KPI column. No card chrome — the eye reads
 *  four columns as one strip, not four tiles. */
function Kpi({ icon, label, value, help }: { icon: React.ReactNode; label: string; value: string; help: string }) {
  return (
    <div className="px-3 first:pl-0 border-r border-line/70 last:border-r-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-subtle font-bold inline-flex items-center gap-1.5 mb-1.5">
        {icon} {label}
      </div>
      <p className="text-2xl font-bold text-fg leading-none tabular-nums">{value}</p>
      <p className="text-[11px] text-muted mt-1.5">{help}</p>
    </div>
  );
}

function StreamRow({ stream, hasDraft, deadline }: { stream: EquipStream; hasDraft: boolean; deadline: DerivedDeadlineSpec | null }) {
  const meta = STREAM_META[stream];
  return (
    <Link
      href={`/equip/apply/new?stream=${stream}`}
      className="flex items-start gap-4 py-4 group transition-colors hover:bg-elevated/30 -mx-3 px-3 rounded-md"
    >
      <span className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 group-hover:bg-brand-100 transition-colors">
        {stream === "venture_lift" ? <Rocket size={16} /> : <Beaker size={16} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-fg inline-flex items-center gap-2 group-hover:text-brand-700 transition-colors">
          {meta.name}
          {hasDraft && (
            <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 ring-1 ring-amber-200 px-1.5 py-0.5 rounded">
              Draft saved
            </span>
          )}
        </p>
        <p className="text-[12px] text-muted leading-snug mt-1">{meta.blurb}</p>
        <p className="text-[10px] text-subtle font-mono mt-1.5 uppercase tracking-[0.18em]">{meta.cadence}</p>
        {deadline && (
          <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold text-brand-700">
            <CalendarClock size={11} className="shrink-0" />
            <span>Next deadline: {formatDeadlineEastern(deadline.deadlineAt)}</span>
            <span className="font-normal text-subtle">· {daysUntilLabel(deadline.deadlineAt)} · {deadline.cycleLabel}</span>
          </p>
        )}
      </div>
      <ArrowRight size={14} className="text-subtle group-hover:text-brand-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
    </Link>
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
