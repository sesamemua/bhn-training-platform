/**
 * Every Training Week session as a bar: projected approvals against the seats the
 * room offers students. Used on the Training Week dashboard and the admin
 * home dashboard. No client code — it renders on the server too.
 */
import type { ReactNode } from "react";
import type { MonitorSession } from "@/lib/training-week/capacity";

export function CapacityMonitor({ sessions, action, registered, controls }: { sessions: MonitorSession[]; action?: ReactNode; registered?: number | null; controls?: (session: MonitorSession) => ReactNode }) {
  if (sessions.length === 0) return null;
  const requested = sessions.reduce((n, s) => n + s.cap.requested, 0);
  const projected = sessions.reduce((n, s) => n + s.cap.projectedApproved, 0);
  const seats = sessions.reduce((n, s) => n + s.cap.capacity, 0);
  const over = sessions.filter((s) => s.cap.level === "over").length;
  const full = sessions.filter((s) => s.cap.level === "full").length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">Training Week capacity</p>
        {action}
      </div>
      {registered !== undefined && <p className="mt-2 text-[14px] text-fg"><strong className="text-[24px] tabular-nums">{registered === null ? "—" : registered.toLocaleString()}</strong> people registered</p>}
      <p className="mt-1 text-[12.5px] text-fg">
        <strong className="tabular-nums">{projected}</strong> projected approvals for <strong className="tabular-nums">{seats}</strong> student seats · {requested} requests
        {over > 0 && <span className="font-semibold text-rose-600"> · {over} over capacity</span>}
        {full > 0 && <span className="font-semibold text-muted"> · {full} planned at capacity</span>}
      </p>
      <ul className="mt-3 divide-y divide-line">
        {sessions.map((s) => {
          const c = s.cap;
          const scale = Math.max(c.capacity, c.requested, c.projectedApproved, 1);
          const pct = (n: number) => `${(n / scale) * 100}%`;
          const excess = Math.max(0, c.requested - c.capacity);
          const detail = `${c.projectedApproved} projected approvals: ${c.confirmed} actual approved + ${c.suggested} recommended approval; ${c.projectedWaitlisted} projected waitlist; ${c.requested} requests; ${c.capacity} seats; ${excess} requests over capacity`;
          return (
            <li key={s.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] leading-tight">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-semibold text-fg">{s.title}</span>
                <span className="text-[11px] text-subtle">
                  {new Date(s.start).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" })}
                </span>
                </div>
                {controls && controls(s)}
              </div>
              <div className="mt-1.5 space-y-1.5 text-[12px] leading-snug tabular-nums" role="group" aria-label={detail}>
                <div className="relative overflow-hidden rounded bg-elevated px-2 py-2 pb-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-fg">
                    <span>Requests: <strong>{c.requested}</strong> requested{excess > 0 && <span className="ml-2 font-semibold">({excess} over capacity)</span>}</span>
                    <span><strong>{c.requested}/{c.capacity}</strong> requested / capacity</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-2 bg-line" aria-hidden>
                    <div className="absolute inset-y-0 left-0 bg-sky-500" style={{ width: pct(c.requested) }} title={`${c.requested} requested`} />
                    {excess > 0 && <div className="absolute inset-y-0 bg-rose-100 text-rose-700" style={{ left: pct(c.capacity), width: pct(excess), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 6px)" }} title={`${excess} requests over capacity`} />}
                    <div className="absolute inset-y-0 -translate-x-full border-l-2 border-dashed border-fg" style={{ left: pct(c.capacity) }} title={`${c.capacity} capacity`} />
                  </div>
                </div>
                <div className="relative overflow-hidden rounded bg-elevated px-2 py-2 pb-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-fg">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span>Seat plan: <strong>{c.confirmed}</strong> actual approved</span><span>+ <strong>{c.suggested}</strong> recommended approval</span></span>
                    <span><strong>{c.projectedApproved}/{c.capacity}</strong> planned / capacity{c.over > 0 && <span className="ml-2 font-semibold">({c.over} over capacity)</span>}</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-2 bg-line" aria-hidden>
                    <div className="absolute inset-y-0 bg-lime-200 text-lime-700" style={{ left: pct(c.confirmed), width: pct(c.suggested), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 5px)" }} title={`${c.suggested} recommended approval`} />
                    <div className="absolute inset-y-0 left-0 bg-teal-700" style={{ width: pct(c.confirmed) }} title={`${c.confirmed} actual approved`} />
                    <div className="absolute inset-y-0 -translate-x-full border-l-2 border-dashed border-fg" style={{ left: pct(c.capacity) }} title={`${c.capacity} capacity`} />
                  </div>
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
