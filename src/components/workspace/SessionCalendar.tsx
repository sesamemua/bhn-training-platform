"use client";

/**
 * The week, drawn to scale — shared by the builder and by the form
 * people fill in.
 *
 * The vertical axis is TIME. A session's box starts where it starts and
 * is as tall as it is long, so an all-day workshop looks like an all-day
 * workshop and a two-and-a-half-hour tour looks like a third of one.
 *
 * The first version drew every session as an equal-height card grouped
 * into rows, which is a list wearing a calendar's clothes: the CL3
 * workshop runs 09:30 to 17:00 and the CCRM tour runs 11:00 to 13:30,
 * and nothing on screen said one was three times the other. Picking a
 * session is a decision about your day, and a picture that flattens
 * duration hides the part of the decision that matters.
 *
 * The maths is `gridFromSlots`, the same function the Admin dashboard
 * calendar uses. An organiser's view of the week and a registrant's
 * view of it being different drawings would be a difference nobody
 * could explain.
 */
import { useMemo } from "react";
import { chosenConflicts, clashes as overlaps, type Placed } from "@/lib/formbuilder/calendar";
import { gridFromSlots, label as hourLabel, place, toMinutes } from "@/lib/allocation/schedule";
import type { FormField } from "@/lib/formbuilder/types";

/**
 * Sessions that compete for the same part of a day, transitively.
 *
 * Transitive because overlap is not: CL3 meets both Monday tours while
 * the tours do not meet each other. Kept because the "runs against N
 * others" hint counts real overlaps, not lane neighbours.
 */
export function groupsOf(slots: Placed[]): Placed[][] {
  const rest = [...slots].sort((a, b) => a.start.localeCompare(b.start) || a.option.localeCompare(b.option));
  const out: Placed[][] = [];
  while (rest.length > 0) {
    const group = [rest.shift()!];
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

/**
 * How tall an hour is.
 *
 * Enough that the shortest session on the grid is still a comfortable
 * click target, and few enough pixels that three days of a working day
 * fit on a screen without scrolling.
 */
const HOUR_PX = 62;

/**
 * "1st", "2nd", "3rd" — not "1".
 *
 * A bare numeral on a calendar cell reads as a count, a room number or
 * a day. An ordinal can only be a position, which is the one thing it
 * is trying to say.
 */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export function SessionCalendar({
  field, chosen, onToggle,
}: { field: FormField; chosen: string[]; onToggle: (option: string) => void }) {
  const grid = useMemo(() => gridFromSlots(field.slots), [field.slots]);
  // Same function the warning panel uses — the tint and the text must
  // never disagree about what conflicts.
  const clashing = useMemo(
    () => chosenConflicts(field.slots, chosen, field.cannotCombine ?? []),
    [field.slots, chosen, field.cannotCombine],
  );
  // Options with no time given still need somewhere to be chosen.
  const unscheduled = field.options.filter((o) => !field.slots.some((s) => s.option === o));

  const height = ((grid.endMin - grid.startMin) / 60) * HOUR_PX;

  /*
   * Full. Drawn, not just silently refused.
   *
   * A cell that does nothing when clicked reads as broken. Dimmed and
   * disabled with a reason on it reads as "you have used your three",
   * which is the actual situation.
   */
  const cap = field.maxChoices;
  const atCap = cap !== undefined && chosen.length >= cap;
  const dayName = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  // The day prefix is already the column heading, and the hours are
  // already the left-hand scale — repeating both inside every box eats
  // the room the actual name needs.
  const shortLabel = (option: string) => option.split(" · ").pop() ?? option;

  if (grid.days.length === 0) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {unscheduled.map((o) => (
          <Chip key={o} label={o} rank={chosen.indexOf(o)} full={atCap} onClick={() => onToggle(o)} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="overflow-x-auto rounded-xl border-2 border-line-strong bg-card p-3">
        <div className="flex min-w-[520px] gap-2">
          {/* The scale. Labels sit ON the hour line rather than in the
              band below it, so a session starting at 11:00 has its top
              edge against the 11:00 label. */}
          <div className="relative w-11 shrink-0" style={{ height, marginTop: 22 }}>
            {grid.hours.map((m) => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-subtle"
                style={{ top: `${((m - grid.startMin) / (grid.endMin - grid.startMin)) * 100}%` }}
              >
                {hourLabel(m)}
              </span>
            ))}
          </div>

          {grid.days.map(({ day, slots }) => (
            <div key={day} className="min-w-0 flex-1">
              <p className="h-[22px] text-center text-[10.5px] font-bold uppercase tracking-wide text-subtle">
                {dayName(day)}
              </p>
              <div className="relative rounded-lg border border-line bg-elevated/40" style={{ height }}>
                {grid.hours.map((m) => (
                  <div
                    key={m}
                    className="pointer-events-none absolute inset-x-0 border-t border-line/60"
                    style={{ top: `${((m - grid.startMin) / (grid.endMin - grid.startMin)) * 100}%` }}
                  />
                ))}

                {slots.map((sl) => {
                  /*
                   * RANK, from the order you clicked in.
                   *
                   * The question has always been called "choose and
                   * rank", and the array already kept click order —
                   * nothing on screen said so, so it read as a plain
                   * multi-select and the order looked accidental.
                   */
                  const rank = chosen.indexOf(sl.option);
                  const on = rank >= 0;
                  const clashes = clashing.some((c) => c.a === sl.option || c.b === sl.option);
                  const pos = place(sl, grid);
                  const against = slots.filter((o) => o.option !== sl.option && overlaps(sl, o)).length;
                  const minutes = toMinutes(sl.end) - toMinutes(sl.start);
                  const blocked = !on && atCap;
                  return (
                    <button
                      key={sl.option}
                      onClick={() => onToggle(sl.option)}
                      aria-pressed={on}
                      disabled={blocked}
                      title={
                        blocked
                          ? `${cap} is the most you can choose — take one back first`
                          : `${shortLabel(sl.option)} · ${sl.start}–${sl.end}`
                      }
                      className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left transition-colors ${
                        blocked ? "cursor-not-allowed opacity-40" : ""
                      } ${
                        on
                          ? clashes
                            ? "border-amber-500 bg-amber-500/15"
                            : "border-brand-500 bg-brand-500/15"
                          : "border-line bg-card hover:border-brand-400"
                      }`}
                      style={{
                        top: `${pos.top}%`,
                        height: `${pos.height}%`,
                        // Side by side when they overlap, full width
                        // when nothing is competing for the hour.
                        left: `${(sl.lane / sl.lanes) * 100}%`,
                        width: `calc(${100 / sl.lanes}% - 2px)`,
                      }}
                    >
                      {/* The ranking leads. Once a session is picked,
                          its position is the thing the reader is
                          checking — the hours are already the scale it
                          is drawn against. */}
                      {on && (
                        <span className="mb-0.5 inline-flex items-center rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          {ordinal(rank + 1)} choice
                        </span>
                      )}
                      <span className="block truncate font-mono text-[9.5px] text-subtle">
                        {sl.start}–{sl.end}
                      </span>
                      <span className={`mt-0.5 block text-[11px] leading-tight ${on ? "font-semibold text-fg" : "text-muted"}`}>
                        {shortLabel(sl.option)}
                      </span>
                      {/* Only where there is room for it. A hint that
                          overflows its own box is not a hint. */}
                      {against > 0 && minutes >= 120 && (
                        <span className="mt-1 block text-[9.5px] text-subtle">
                          runs against {against} other{against > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-subtle">
        Height is how long a session runs. Anything drawn side by side is on at the same time.
        The order you click in is your order of preference: first pick, first choice.
        {cap !== undefined && (
          atCap
            ? ` You have chosen all ${cap}. Click one again to take it back.`
            : ` You can choose up to ${cap} — ${cap - chosen.length} left.`
        )}
        {cap === undefined && " Choose as many as you like."}
      </p>

      {unscheduled.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unscheduled.map((o) => (
            <Chip key={o} label={o} rank={chosen.indexOf(o)} full={atCap} onClick={() => onToggle(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** An option with no time on it — nowhere to put it on the grid. */
function Chip({
  label, rank, full, onClick,
}: { label: string; rank: number; full: boolean; onClick: () => void }) {
  const on = rank >= 0;
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      disabled={!on && full}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-brand-500 bg-brand-500/12 font-semibold text-fg" : "border-line text-muted hover:bg-elevated"
      }`}
    >
      {on && (
        <span className="inline-flex items-center rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {ordinal(rank + 1)}
        </span>
      )}
      {label}
    </button>
  );
}
