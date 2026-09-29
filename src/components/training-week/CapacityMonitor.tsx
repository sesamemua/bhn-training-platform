/**
 * Every Training Week session as a bar: requests against the seats the
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
  if (c.level === "over") return `Oversubscribed +${c.over}`;
  if (c.level === "full") return "Full";
  const left = c.capacity - c.requested;
  return `${left} left`;
}

export function CapacityMonitor({ sessions, action }: { sessions: MonitorSession[]; action?: ReactNode }) {
  if (sessions.length === 0) return null;
  const requested = sessions.reduce((n, s) => n + s.cap.requested, 0);
  const seats = sessions.reduce((n, s) => n + s.cap.capacity, 0);
  const over = sessions.filter((s) => s.cap.level === "over").length;
  const full = sessions.filter((s) => s.cap.level === "full").length;

  return (
    <section className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">Training Week capacity</p>
        {action}
      </div>
      <p className="mt-1 text-[12.5px] text-fg">
        <strong className="tabular-nums">{requested}</strong> requests for <strong className="tabular-nums">{seats}</strong> student seats
        {over > 0 && <span className="font-semibold text-rose-600"> · {over} oversubscribed</span>}
        {full > 0 && <span className="font-semibold text-amber-600"> · {full} full</span>}
      </p>
      <ul className="mt-2.5 space-y-2">
        {sessions.map((s) => {
          const c = s.cap;
          // The track is the larger of capacity and demand, so an
          // oversubscribed room shows its overflow past the capacity line.
          const scale = Math.max(c.capacity, c.requested, 1);
          const pct = (n: number) => `${(n / scale) * 100}%`;
          const tone = LEVEL[c.level];
          return (
            <li key={s.id}>
              <div className="flex items-baseline gap-2 text-[12px] leading-tight">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${workshopTone(s.slug).dot}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-fg" title={s.title}>{s.title}</span>
                <span className="shrink-0 text-[11px] text-subtle">
                  {new Date(s.start).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{c.requested}/{c.capacity}</span>
                <span className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-semibold ${tone.chip}`}>{status(c)}</span>
              </div>
              <div
                className="relative mt-1 h-2 overflow-hidden rounded-full bg-elevated"
                role="img"
                aria-label={`${c.requested} requests, ${c.confirmed} confirmed, ${c.capacity} seats`}
              >
                <div className={`absolute inset-y-0 left-0 opacity-40 ${tone.bar}`} style={{ width: pct(c.requested) }} />
                <div className={`absolute inset-y-0 left-0 ${tone.bar}`} style={{ width: pct(Math.min(c.confirmed, c.requested)) }} />
                {c.requested > c.capacity && (
                  <div className="absolute inset-y-[-2px] w-0.5 bg-fg" style={{ left: pct(c.capacity) }} aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-subtle">
        Pale bar: every request, pending included. Solid: confirmed. Staff and guests are not counted.
      </p>
    </section>
  );
}
