"use client";

/**
 * The week, drawn — shared by the builder and by the form people fill in.
 *
 * It lived inside FormBuilder until the registrant-facing view needed
 * it too. A preview that draws the sessions differently from the real
 * thing is not a preview, so there is one of these.
 */
import { useMemo } from "react";
import { chosenClashes, clashes as overlaps, packWeek, type Placed } from "@/lib/formbuilder/calendar";
import type { FormField } from "@/lib/formbuilder/types";

const LINE =
  "mt-1 w-full rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus-visible:border-brand-500";

/**
 * Sessions that compete for the same part of a day, transitively.
 *
 * Transitive because overlap is not: CL3 meets both Monday tours while
 * the tours do not meet each other, and drawing that needs all three in
 * one block with the tours stacked in a single lane. Groups come back
 * in start order, and so does each group.
 */
export function groupsOf(slots: Placed[]): Placed[][] {
  const rest = [...slots].sort((a, b) => a.start.localeCompare(b.start) || a.option.localeCompare(b.option));
  const out: Placed[][] = [];
  while (rest.length > 0) {
    const group = [rest.shift()!];
    // Keep sweeping: a session added to the group can pull in another
    // that the first member never touched.
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = rest.length - 1; i >= 0; i--) {
        if (group.some((g) => overlaps(g, rest[i]))) { group.push(rest.splice(i, 1)[0]); grew = true; }
      }
    }
    out.push(group.sort((a, b) => a.start.localeCompare(b.start)));
  }
  return out;
}

export function SessionCalendar({
  field, chosen, onToggle,
}: { field: FormField; chosen: string[]; onToggle: (option: string) => void }) {
  const week = useMemo(() => packWeek(field.slots), [field.slots]);
  const clashing = useMemo(() => chosenClashes(field.slots, chosen), [field.slots, chosen]);
  // Options with no time given still need somewhere to be chosen.
  const unscheduled = field.options.filter((o) => !field.slots.some((s) => s.option === o));

  const dayName = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="mt-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${week.length}, minmax(0,1fr))` }}>
        {week.map(({ day, slots }) => (
          <div key={day} className="min-w-0">
            <p className="pb-1 text-[10.5px] font-bold uppercase tracking-wide text-subtle">{dayName(day)}</p>
            <div className="space-y-1.5">
              {/* Grouped by OVERLAP, not by an identical start time.
                  Sharing a start is neither necessary nor sufficient:
                  CL3 runs 09:30–17:00 across both Monday tours without
                  starting when either does, and grouping on the string
                  drew the three of them as separate full-width rows
                  with nothing to suggest they compete.

                  Laid out as `lanes` columns, each a stack — a flat row
                  cannot express Monday, where the two tours are
                  consecutive and therefore share one lane. */}
              {groupsOf(slots).map((group) => {
                const lanes = Math.max(...group.map((s) => s.lane)) + 1;
                return (
                  <div key={group[0].option} className="flex gap-1.5">
                    {Array.from({ length: lanes }, (_, lane) => (
                      <div key={lane} className="min-w-0 flex-1 space-y-1.5">
                    {group.filter((s) => s.lane === lane).map((sl) => {
                      const on = chosen.includes(sl.option);
                      const clashes = clashing.some(([a, b]) => a === sl.option || b === sl.option);
                      // Counted against the ones it ACTUALLY overlaps.
                      // The group can hold sessions that never meet.
                      const against = group.filter((o) => o.option !== sl.option && overlaps(sl, o)).length;
                      // Cells are wide, not tall: the label is what has
                      // to be readable, not the duration.
                      return (
                        <button
                          key={sl.option}
                          onClick={() => onToggle(sl.option)}
                          className={`block w-full min-w-0 rounded-md border p-2 text-left transition-colors ${
                            on
                              ? clashes
                                ? "border-amber-500 bg-amber-500/12"
                                : "border-brand-500 bg-brand-500/12"
                              : "border-line bg-elevated hover:border-brand-400"
                          }`}
                        >
                          <span className="block text-[11px] font-mono text-subtle">
                            {sl.start}–{sl.end}
                          </span>
                          <span className={`mt-0.5 block text-[11.5px] leading-snug ${on ? "font-semibold text-fg" : "text-muted"}`}>
                            {/* The day prefix is already the column. */}
                            {sl.option.replace(/^[^·]+·\s*/, "")}
                          </span>
                          {against > 0 && (
                            <span className="mt-1 block text-[10px] text-subtle">
                              runs against {against} other{against > 1 ? "s" : ""}
                            </span>
                          )}
                        </button>
                      );
                    })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {unscheduled.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unscheduled.map((o) => (
            <button key={o} onClick={() => onToggle(o)}
              className={`rounded-md border px-2 py-1 text-[11.5px] ${
                chosen.includes(o) ? "border-brand-500 bg-brand-500/12 text-fg" : "border-line text-muted hover:bg-elevated"
              }`}>
              {o}
            </button>
          ))}
        </div>
      )}

      {clashing.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-[11.5px] leading-snug text-amber-600">
          {clashing.length === 1 ? "Two of your choices run" : `${clashing.length} pairs of your choices run`}{" "}
          at the same time. You can leave both ticked — it tells us your second
          preference — but only {field.approveFromClash ?? 1} of a clashing pair
          can be approved.
        </p>
      )}
    </div>
  );
}

// ── the live preview ─────────────────────────────────────────────────

