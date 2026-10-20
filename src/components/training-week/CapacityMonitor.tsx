/**
 * Every Training Week session as a bar: projected approvals against the seats the
 * room offers students. Used on the Training Week dashboard and the admin
 * home dashboard. No client code — it renders on the server too.
 */
import type { ReactNode } from "react";
import type { MonitorSession } from "@/lib/training-week/capacity";
import { WorkshopRegistrationSummary } from "./WorkshopRegistrationSummary";
import { ArrowRight } from "lucide-react";
import { CapacityBarMarkers } from "./CapacityBarMarkers";
import { WorkshopIcon } from "./WorkshopIcon";

export function CapacityMonitor({ sessions, action, registered, controls }: { sessions: MonitorSession[]; action?: ReactNode; registered?: number | null; controls?: (session: MonitorSession) => ReactNode }) {
  if (sessions.length === 0) return null;
  const requested = sessions.reduce((n, s) => n + s.cap.requested, 0);
  const projected = sessions.reduce((n, s) => n + s.cap.projectedApproved, 0);
  const seats = sessions.reduce((n, s) => n + s.cap.capacity, 0);
  const over = sessions.filter((s) => s.cap.level === "over").length;
  const full = sessions.filter((s) => s.cap.level === "full").length;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">Training Week capacity</p>
        {action}
        <a href="/admin/workspace/training-admin?tab=registrants" className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2">
          Open registrants <ArrowRight size={13} aria-hidden="true" />
        </a>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {registered !== undefined && <p className="text-[13px] text-fg"><strong className="text-[20px] tabular-nums">{registered === null ? "—" : registered.toLocaleString()}</strong> people registered</p>}
      <p className="text-[12px] text-muted">
        <strong className="tabular-nums">{projected}</strong> projected approvals for <strong className="tabular-nums">{seats}</strong> student seats · {requested} requests
        {over > 0 && <span className="font-semibold text-rose-600"> · {over} over capacity</span>}
        {full > 0 && <span className="font-semibold text-muted"> · {full} planned at capacity</span>}
      </p>
      </div>
      <ul className="-mx-2 mt-2 space-y-3">
        {sessions.map((s, index) => {
          const c = s.cap;
          const scale = Math.max(c.capacity, c.requested, c.projectedApproved, 1);
          const pct = (n: number) => `${(n / scale) * 100}%`;
          const excess = Math.max(0, c.requested - c.capacity);
          const approvedWidth = Math.min(c.confirmed, c.capacity);
          const suggestedWidth = Math.min(c.suggested, c.capacity - approvedWidth);
          const detail = `${c.projectedApproved} projected approvals: ${c.confirmed} actual approved + ${c.suggested} recommended approval; ${c.projectedWaitlisted} projected waitlist; ${c.requested} requests; ${c.capacity} seats; ${excess} requests over capacity`;
          return (
            <li key={s.id} className="training-capacity-row px-3 py-2 odd:bg-elevated/70 even:bg-elevated/20">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] leading-tight">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <a href={`/admin/workspace/training-admin?tab=registrants&workshop=${encodeURIComponent(s.id)}`}
                  aria-label={`View registrants for ${s.title}`}
                  data-tone={index % 6}
                  className="training-workshop-title underline decoration-line underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"><span className="mr-1.5"><WorkshopIcon slug={s.slug} /></span>{s.title}</a>
                <span className="text-[11px] text-subtle">
                  {new Date(s.start).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" })}
                </span>
                {s.directLinkRegistrations !== undefined && <span className="text-[12px] font-semibold text-fg" title="Registrations through the Innovation Ignited direct form, across all statuses. Already included in total registrations below.">
                  {s.directLinkRegistrations} via direct link <span className="font-normal text-subtle">(included in total)</span>
                </span>}
                </div>
                {controls && controls(s)}
              </div>
              <div className="mt-2 grid min-w-0 gap-x-6 gap-y-2 md:grid-cols-2 md:items-center">
              <div className="capacity-bar-column min-w-0 space-y-2 text-[11px] leading-snug tabular-nums" role="group" aria-label={detail}>
                <div>
                <div className="relative overflow-hidden pb-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-fg">
                    <span>Requests: <strong>{c.requested}/{c.capacity}</strong> requested / capacity</span>
                    {excess > 0 && <span className="font-semibold text-rose-600">{excess} over capacity</span>}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-2 bg-line" aria-hidden>
                    <div className="absolute inset-y-0 left-0 bg-sky-500" style={{ width: pct(c.requested) }} title={`${c.requested} requested`} />
                    {excess > 0 && <div className="absolute inset-y-0 bg-rose-100 text-rose-700" style={{ left: pct(c.capacity), width: pct(excess), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 6px)" }} title={`${excess} requests over capacity`} />}
                    <div className="absolute inset-y-0 -translate-x-full border-l-2 border-dashed border-fg" style={{ left: pct(c.capacity) }} title={`${c.capacity} capacity`} />
                  </div>
                </div>
                <CapacityBarMarkers scale={scale} markers={[
                  { value: c.capacity, label: `${c.capacity} capacity` },
                  { value: c.requested, label: `${c.requested} requested` },
                ]} />
                </div>
                <div>
                <div className="relative overflow-hidden pb-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-fg">
                    <span>Seat plan: <strong>{c.confirmed}</strong> actual approved + <strong>{c.suggested}</strong> recommended approval</span>
                    {c.over > 0 && <span className="font-semibold text-rose-600">{c.over} over capacity</span>}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-2" aria-hidden>
                    <div className="absolute inset-y-0 left-0 bg-line" style={{ width: pct(c.capacity) }} />
                    <div className="absolute inset-y-0 bg-lime-200 text-lime-700" style={{ left: pct(approvedWidth), width: pct(suggestedWidth), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 5px)" }} title={`${c.suggested} recommended approval`} />
                    <div className="absolute inset-y-0 left-0 bg-teal-700" style={{ width: pct(approvedWidth) }} title={`${c.confirmed} actual approved`} />
                    <div className="absolute inset-y-0 -translate-x-full border-l-2 border-dashed border-fg" style={{ left: pct(c.capacity) }} title={`${c.capacity} capacity`} />
                  </div>
                </div>
                <CapacityBarMarkers scale={scale} markers={[
                  { value: approvedWidth, label: c.confirmed > c.capacity ? `${approvedWidth} shown (${c.confirmed} approved)` : `${c.confirmed} approved` },
                  ...(suggestedWidth > 0 ? [{ value: approvedWidth + suggestedWidth, label: `${approvedWidth + suggestedWidth} plan (+${suggestedWidth} recommended)` }] : []),
                ]} />
                </div>
              </div>
              <WorkshopRegistrationSummary cap={c} compact />
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
