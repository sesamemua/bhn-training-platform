"use client";

/**
 * Training admin → Catering & accessibility. Alison's tab: what the
 * caterer needs and what the venue needs, for the sessions still to come.
 * Approved attendees only; sessions that are over are left out.
 */
import { useMemo } from "react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import type { Snapshot } from "@/lib/allocation/catering";
import { currentEntries } from "@/lib/allocation/catering";
import { CateringPanel, rowsFrom } from "./RegistrantViews";

const tz = "America/Toronto";
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function CateringTab({ workshops, catering }: { workshops: AdminWorkshop[]; catering: Snapshot | null }) {
  const rows = useMemo(() => rowsFrom(workshops), [workshops]);
  const sessions = useMemo(() => {
    const m = new Map<string, ReturnType<typeof currentEntries>>();
    for (const e of currentEntries(rows)) m.set(e.workshopId, [...(m.get(e.workshopId) ?? []), e]);
    return [...m.values()];
  }, [rows]);

  return (
    <div className="space-y-5">
      <CateringPanel rows={rows} initial={catering} />

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          No approved attendees for upcoming sessions yet. People appear here once their seat is approved.
        </p>
      ) : (
        sessions.map((list) => {
          const s = list[0];
          const withNeeds = list.filter((e) => e.dietary.length || e.dietaryOther || e.accessibility);
          const counts = new Map<string, number>();
          for (const e of list) for (const d of e.dietary) counts.set(d, (counts.get(d) ?? 0) + 1);
          return (
            <section key={s.workshopId} className="rounded-lg border border-line bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[14.5px] font-bold text-fg">{s.workshop}</h3>
                <p className="text-[12.5px] text-muted">{when(s.start)} · <strong className="text-fg">{list.length}</strong> attending</p>
              </div>
              <p className="mt-1 flex flex-wrap gap-1.5 text-[11.5px]">
                {[...counts].sort().map(([d, n]) => (
                  <span key={d} className="rounded-full bg-brand-500/10 px-2 py-0.5 font-semibold text-fg">{d} · {n}</span>
                ))}
                {list.length - withNeeds.length > 0 && (
                  <span className="rounded-full bg-elevated px-2 py-0.5 text-muted">No requirements · {list.length - withNeeds.length}</span>
                )}
              </p>
              {withNeeds.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-elevated text-left">
                        {["Name", "Dietary", "Other", "Accessibility"].map((h) => (
                          <th key={h} className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-subtle">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {withNeeds.map((e) => (
                        <tr key={e.personKey} className="border-t border-line align-top">
                          <td className="px-3 py-1.5 font-semibold text-fg">{e.name}</td>
                          <td className="px-3 py-1.5 text-muted">{e.dietary.join(" · ") || "—"}</td>
                          <td className="px-3 py-1.5 text-muted">{e.dietaryOther || "—"}</td>
                          <td className="px-3 py-1.5 text-muted">{e.accessibility || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
