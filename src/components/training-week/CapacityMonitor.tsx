/**
 * Every Training Week session as a bar: projected approvals against the seats the
 * room offers students. Used on the Training Week dashboard and the admin
 * home dashboard. No client code — it renders on the server too.
 */
import type { ReactNode } from "react";
import { workshopTone } from "@/lib/allocation/workshop-colour";
import type { CapacityLevel, MonitorSession } from "@/lib/training-week/capacity";

const LEVEL: Record<CapacityLevel, { bar: string; chip: string }> = {
  over: { bar: "bg-rose-500", chip: "bg-rose-500/12 text-rose-600" },
  full: { bar: "bg-amber-500", chip: "bg-amber-500/12 text-amber-600" },
  filling: { bar: "bg-amber-400", chip: "bg-amber-400/12 text-amber-600" },
  open: { bar: "bg-emerald-500", chip: "bg-emerald-500/12 text-emerald-600" },
};

function status(c: MonitorSession["cap"]): string {
  if (c.level === "over") return `Over capacity +${c.over}`;
  if (c.level === "full") return "Full";
  const left = c.capacity - c.projectedApproved;
  return `${left} left`;
}

export function CapacityMonitor({ sessions, action, registered, controls }: { sessions: MonitorSession[]; action?: ReactNode; registered?: number | null; controls?: (session: MonitorSession) => ReactNode }) {
  if (sessions.length === 0) return null;
  const requested = sessions.reduce((n, s) => n + s.cap.requested, 0);
  const projected = sessions.reduce((n, s) => n + s.cap.projectedApproved, 0);
  const seats = sessions.reduce((n, s) => n + s.cap.capacity, 0);
  const over = sessions.filter((s) => s.cap.level === "over").length;
  const full = sessions.filter((s) => s.cap.level === "full").length;

  return (
    <section className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">Training Week capacity</p>
        {action}
      </div>
      {registered !== undefined && <p className="mt-2 text-[14px] text-fg"><strong className="text-[24px] tabular-nums">{registered === null ? "—" : registered.toLocaleString()}</strong> people registered</p>}
      <p className="mt-1 text-[12.5px] text-fg">
        <strong className="tabular-nums">{projected}</strong> projected approvals for <strong className="tabular-nums">{seats}</strong> student seats · {requested} requests
        {over > 0 && <span className="font-semibold text-rose-600"> · {over} over capacity</span>}
        {full > 0 && <span className="font-semibold text-amber-600"> · {full} full</span>}
      </p>
      <ul className="mt-2.5 space-y-3">
        {sessions.map((s) => {
          const c = s.cap;
          const scale = Math.max(c.capacity, c.requested, c.projectedApproved, 1);
          const pct = (n: number) => `${(n / scale) * 100}%`;
          const tone = LEVEL[c.level];
          const excess = Math.max(0, c.requested - c.capacity);
          const detail = `${c.projectedApproved} projected approvals: ${c.confirmed} actual approved + ${c.suggested} recommended approval; ${c.projectedWaitlisted} projected waitlist; ${c.requested} requests; ${c.capacity} seats; ${excess} requests over capacity`;
          return (
            <li key={s.id}>
              <div className="flex items-baseline gap-2 text-[12px] leading-tight">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${workshopTone(s.slug).dot}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-fg" title={s.title}>{s.title}</span>
                <span className="shrink-0 text-[11px] text-subtle">
                  {new Date(s.start).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="shrink-0 tabular-nums text-muted" title={`${c.requested} requested / ${c.capacity} capacity`}>{c.requested}/{c.capacity}</span>
                <span className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-semibold ${excess > 0 ? LEVEL.over.chip : tone.chip}`} title={detail}>{excess > 0 ? `+${excess} over` : status(c)}</span>
              </div>
              {controls && <div className="mt-2 flex justify-end">{controls(s)}</div>}
              <div
                className="relative mt-2 rounded-md border border-line bg-elevated"
                role="img"
                aria-label={detail}
                title={detail}
              >
                <div className="absolute inset-y-0 left-0 rounded-md border border-sky-500 bg-sky-200" style={{ width: pct(c.requested) }} title={`${c.requested} requested`} aria-hidden />
                {excess > 0 && <div className="absolute inset-y-0 rounded-r-md bg-rose-100 text-rose-600" style={{ left: pct(c.capacity), width: pct(excess), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 6px)" }} title={`${excess} requests over capacity`} aria-hidden />}
                <div className="absolute inset-y-0.5 bg-lime-200" style={{ left: pct(c.confirmed), width: pct(c.suggested) }} title={`${c.suggested} recommended approval`} aria-hidden />
                <div className="absolute inset-y-0.5 left-0 rounded-l-md bg-teal-700" style={{ width: pct(c.confirmed) }} title={`${c.confirmed} actual approved`} aria-hidden />
                <div className="absolute -inset-y-1 -translate-x-1/2 border-l-2 border-dashed border-fg" style={{ left: pct(c.capacity) }} title={`${c.capacity} capacity`} aria-hidden />
                <div className="relative grid grid-cols-2 gap-1 p-2 text-[11px] leading-snug text-fg tabular-nums sm:grid-cols-4" aria-hidden>
                  <span className="inline-flex min-w-0 items-center gap-1.5 bg-card/95 px-1.5 py-1"><span className="h-2 w-2 shrink-0 bg-sky-400" /><span><strong>{c.requested}</strong> requested</span></span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 bg-card/95 px-1.5 py-1"><span className="h-2 w-2 shrink-0 bg-lime-300" /><span><strong>+{c.suggested}</strong> recommended approval</span></span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 bg-card/95 px-1.5 py-1"><span className="h-2 w-2 shrink-0 bg-teal-700" /><span><strong>{c.confirmed}</strong> actual approved</span></span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 bg-card/95 px-1.5 py-1"><span className="h-3 w-0 shrink-0 border-l-2 border-dashed border-fg" /><span><strong>{c.capacity}</strong> capacity</span></span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-subtle">
        Recommendations account for preferences and session conflicts; no decisions applied. Staff and guests excluded.
      </p>
    </section>
  );
}
