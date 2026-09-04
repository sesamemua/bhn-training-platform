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
import { useMemo, type ReactNode } from "react";
import { chosenConflicts, clashes as overlaps, sessionParts } from "@/lib/formbuilder/calendar";
import { gridFromSlots, label as hourLabel, place, toMinutes } from "@/lib/allocation/schedule";
import type { FormField } from "@/lib/formbuilder/types";

/**
 * How tall an hour is — set in CSS, not here.
 *
 * Enough that the shortest session on the grid is still a comfortable
 * click target, and few enough pixels that three days of a working day
 * fit on a screen without scrolling.
 *
 * It has to be two numbers, because the week is drawn two ways. Side by
 * side, 62px keeps a two-and-a-half-hour tour a comfortable target.
 * Stacked one day under another on a phone, three days at 62px is two
 * full screens of scrolling, so 46px — still a 114px block for the
 * shortest session here, well over the 44px a thumb needs.
 *
 * A custom property rather than a prop or a piece of state: the
 * container query already knows which layout it is in, and a second
 * source of truth for the same fact is how the two drawings drift
 * apart.
 */
const HOUR_SCALE = "[--hour:46px] @xl:[--hour:62px]";

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

/**
 * The same drawing, before and after.
 *
 * `readOnly` is the confirmation screen: the week a registrant picked
 * from, drawn identically, with nothing left to click. A union rather
 * than two optional props so the type system says what the modes mean —
 * a picker cannot forget its `onToggle`, and a receipt cannot be handed
 * one.
 *
 * The rule that keeps this from becoming a second implementation: the
 * mode may fork the CHROME — which element, hover, aria, the caption —
 * and must NEVER fork the GEOMETRY. Every `top`, `height`, `left` and
 * `width` is computed once, above the branch. The moment a `readOnly`
 * test appears inside one of those, this has stopped being one drawing
 * and the grid needs extracting instead.
 */
export type SessionCalendarProps = {
  field: FormField;
  /** Chosen options in click order — the index IS the rank. */
  chosen: string[];
} & (
  | { readOnly?: false; onToggle: (option: string) => void; caption?: never }
  | {
      readOnly: true;
      onToggle?: never;
      /** Replaces the picker's instructions. Omit for no caption. */
      caption?: string;
    }
);

/**
 * "1st choice" — the same object wherever a rank is shown.
 *
 * It was written out four times: on the calendar cell, on the
 * unscheduled chip, and twice in the two ranking lists — and the two
 * lists had already drifted to a bare brand-coloured word in a 36px
 * gutter holding a 22px ordinal. A rank is one thing and should look
 * like one thing, on the grid and in the list, before and after.
 */
export function RankBadge({ rank, word }: { rank: number; word?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      {ordinal(rank)}{word ? " choice" : ""}
    </span>
  );
}

export function SessionCalendar(props: SessionCalendarProps) {
  const { field, chosen } = props;
  const ro = props.readOnly === true;
  const grid = useMemo(() => gridFromSlots(field.slots), [field.slots]);
  // Same function the warning panel uses — the tint and the text must
  // never disagree about what conflicts.
  const clashing = useMemo(
    () => chosenConflicts(field.slots, chosen, field.cannotCombine ?? []),
    [field.slots, chosen, field.cannotCombine],
  );
  // Options with no time given still need somewhere to be chosen.
  const unscheduled = field.options.filter((o) => !field.slots.some((s) => s.option === o));

  // A CSS length, so the container query owns the scale. Every top/
  // height inside is a percentage of this box and needs no change.
  const height = `calc(${(grid.endMin - grid.startMin) / 60} * var(--hour))`;

  /*
   * Full. Drawn, not just silently refused.
   *
   * A cell that does nothing when clicked reads as broken. Dimmed and
   * disabled with a reason on it reads as "you have used your three",
   * which is the actual situation.
   */
  const cap = field.maxChoices;
  // Nothing is over the cap once it has been submitted — dimming a cell
  // against a limit that no longer applies is a warning about a decision
  // nobody can still make.
  const atCap = !ro && cap !== undefined && chosen.length >= cap;
  const dayName = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  // The day prefix is already the column heading, and the hours are
  // already the left-hand scale — repeating both inside every box eats
  // the room the actual name needs.
  const shortLabel = (option: string) => sessionParts(option).name;

  if (grid.days.length === 0) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {unscheduled.map((o) => (
          <Chip key={o} label={o} rank={chosen.indexOf(o)} full={atCap} onClick={ro ? undefined : () => props.onToggle(o)} />
        ))}
      </div>
    );
  }

  return (
    /*
     * Side by side when there is room; one day under another when there
     * is not.
     *
     * A CONTAINER query, not a viewport one — the same calendar is drawn
     * at 708px inside a question row, at 760 on the confirmation and
     * narrower again inside the builder's editor pane, all at one
     * viewport width. Keyed to the viewport it would stack a grid that
     * had plenty of room and squeeze one that had none.
     *
     * The alternative was what it used to do: a 520px floor inside
     * `overflow-x-auto`, which on every phone made the week 205px wider
     * than its box — so you scrolled sideways, and the thing you
     * scrolled to was still clipped, badges wrapped and Wednesday was
     * off the edge. Stacking loses the ability to compare heights
     * ACROSS days, which a sideways scrollbar had already taken away.
     * Duration-as-height and side-by-side-means-clash both survive
     * inside each day, and those are the two things the drawing is for.
     */
    <div className={`mt-2.5 @container ${HOUR_SCALE}`}>
      <div className="overflow-x-auto rounded-xl border-2 border-line-strong bg-card p-3">
        <div className="flex flex-col gap-4 @xl:min-w-[520px] @xl:flex-row @xl:gap-2">
          {/* One scale for all three days, once there is a row to run
              alongside. Stacked, each day carries its own. */}
          <HourScale grid={grid} height={height} className="hidden w-11 shrink-0 @xl:block" />

          {grid.days.map(({ day, slots }) => (
            <div key={day} className="flex min-w-0 gap-2 @xl:block @xl:flex-1">
              <HourScale grid={grid} height={height} className="w-11 shrink-0 @xl:hidden" />
              <div className="min-w-0 flex-1">
                <p className="h-[22px] text-[10.5px] font-bold uppercase tracking-wide text-subtle @xl:text-center">
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
                    /*
                     * GEOMETRY AND CHROME, COMPUTED ONCE.
                     *
                     * Both modes share every number below. Only the
                     * wrapper element differs, further down — see the
                     * note on SessionCalendarProps.
                     */
                    const cls = `absolute overflow-hidden rounded-md border px-1.5 py-1 text-left transition-colors ${
                      blocked ? "cursor-not-allowed opacity-40" : ""
                    } ${
                      on
                        ? clashes
                          ? "border-red-500 bg-red-500/15"
                          : "border-brand-500 bg-brand-500/15"
                        // Not chosen, and nothing left to choose: kept on
                        // the drawing, faded. The week they picked FROM is
                        // the context that makes a rank mean anything, but
                        // it must not compete with what they picked.
                        : ro
                          ? "border-line/70 bg-card opacity-45"
                          : "border-line bg-card hover:border-brand-400"
                    }`;
                    const box = {
                      top: `${pos.top}%`,
                      height: `${pos.height}%`,
                      // Side by side when they overlap, full width
                      // when nothing is competing for the hour.
                      left: `${(sl.lane / sl.lanes) * 100}%`,
                      width: `calc(${100 / sl.lanes}% - 2px)`,
                    };
                    const body = (
                      <>
                        {/* The ranking leads. Once a session is picked,
                            its position is the thing the reader is
                            checking — the hours are already the scale it
                            is drawn against. */}
                        {on && <span className="mb-0.5 block"><RankBadge rank={rank + 1} word /></span>}
                        <span className="block truncate font-mono text-[9.5px] text-subtle">
                          {sl.start}–{sl.end}
                        </span>
                        <span className={`mt-0.5 block text-[11px] leading-tight ${on ? "font-semibold text-fg" : "text-muted"}`}>
                          {shortLabel(sl.option)}
                        </span>
                        {/* Only where there is room for it. A hint that
                            overflows its own box is not a hint — and on a
                            receipt it is not a hint at all: what a session
                            you did not pick ran against is guidance for a
                            decision already made. */}
                        {!ro && against > 0 && minutes >= 120 && (
                          <span className="mt-1 block text-[9.5px] text-subtle">
                            runs against {against} other{against > 1 ? "s" : ""}
                          </span>
                        )}
                      </>
                    );

                    /*
                     * A div, not a disabled button.
                     *
                     * The obvious shortcut — keep the button and drop the
                     * handler — leaves a focusable control carrying
                     * aria-pressed that does nothing when clicked, which
                     * this file already rules on twenty lines up: a cell
                     * that does nothing when clicked reads as broken.
                     */
                    return ro ? (
                      <div
                        key={sl.option}
                        title={`${shortLabel(sl.option)} · ${sl.start}–${sl.end}`}
                        className={cls}
                        style={box}
                      >
                        {body}
                      </div>
                    ) : (
                      <button
                        key={sl.option}
                        type="button"
                        onClick={() => props.onToggle(sl.option)}
                        aria-pressed={on}
                        disabled={blocked}
                        title={
                          blocked
                            ? `${cap} is the most you can choose — take one back first`
                            : `${shortLabel(sl.option)} · ${sl.start}–${sl.end}`
                        }
                        className={cls}
                        style={box}
                      >
                        {body}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The picker's copy is written in the imperative — "the order you
          click in", "click one again to take it back" — which is the
          wrong tense on a page where nothing can be clicked. */}
      {ro ? (
        props.caption && (
          <p className="mt-1.5 text-[11px] leading-snug text-subtle">{props.caption}</p>
        )
      ) : (
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
      )}

      {unscheduled.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unscheduled.map((o) => (
            <Chip key={o} label={o} rank={chosen.indexOf(o)} full={atCap} onClick={ro ? undefined : () => props.onToggle(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The ranking, written out — the same box before and after.
 *
 * The badges on the calendar give each cell its position; this gives
 * the ORDER, which is the thing the question actually asks for and the
 * thing a coordinator reads off the answer. Its own box, because on a
 * busy calendar a line of text underneath is not where anybody looks to
 * check what they chose.
 *
 * Shared because it had drifted. While picking it was a brand-tinted
 * box with pill ordinals; on the confirmation, one screen later, the
 * same three sessions came back as a plain grey list with a 4px wider
 * gutter and the DAY thrown away entirely — so a registrant who had
 * just ranked "Tue 13:00–16:30" was shown "13:00–16:30" with nothing
 * anywhere saying Tuesday. One component, so the receipt cannot say it
 * differently from the form.
 */
export function RankedChoices({
  chosen, label, note,
}: { chosen: string[]; label: string; note?: ReactNode }) {
  if (chosen.length === 0) return null;
  return (
    <div className="@container mt-3 rounded-lg border-2 border-brand-500/40 bg-brand-500/[0.06] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-500">{label}</p>
      <ol className="mt-2 space-y-1.5">
        {chosen.map((o, i) => {
          const { day, time, name } = sessionParts(o);
          return (
            <li key={o} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <RankBadge rank={i + 1} />
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg">{name}</span>
              {/* On its own line on a phone, indented to sit under the
                  name rather than beside a name already wrapping to
                  three lines; out to the right edge once there is room
                  for both. */}
              {(day || time) && (
                <span className="w-full shrink-0 whitespace-nowrap pl-[2.1rem] font-mono text-[11px] tabular-nums text-subtle @sm:w-auto @sm:pl-0">
                  {[day, time].filter(Boolean).join(" · ")}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {note && <p className="mt-2 text-[12px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

/**
 * The hours down the side.
 *
 * Its own component because the week is drawn twice: once as a row of
 * days sharing a single scale, and once stacked, where each day needs
 * its own. Labels sit ON the hour line rather than in the band below
 * it, so a session starting at 11:00 has its top edge against the
 * 11:00 label. The 22px of margin is the day heading it runs beside.
 */
function HourScale({
  grid, height, className,
}: { grid: ReturnType<typeof gridFromSlots>; height: string; className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`} style={{ height, marginTop: 22 }}>
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
  );
}

/**
 * An option with no time on it — nowhere to put it on the grid.
 *
 * No `onClick` means the receipt: a span rather than a button, for the
 * same reason the grid cells switch to divs.
 */
function Chip({
  label, rank, full, onClick,
}: { label: string; rank: number; full: boolean; onClick?: () => void }) {
  const on = rank >= 0;
  const badge = on && <RankBadge rank={rank + 1} />;
  const cls = `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    on
      ? "border-brand-500 bg-brand-500/12 font-semibold text-fg"
      : onClick
        ? "border-line text-muted hover:bg-elevated"
        : "border-line/70 text-muted opacity-45"
  }`;

  if (!onClick) return <span className={cls}>{badge}{label}</span>;

  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={!on && full} className={cls}>
      {badge}
      {label}
    </button>
  );
}
