"use client";

/**
 * The week, drawn to scale. One drawing, and it knows nothing about
 * what is being drawn on it.
 *
 * The vertical axis is TIME. A block starts where it starts and is as
 * tall as it is long, so an all-day workshop looks like an all-day
 * workshop and a two-and-a-half-hour tour looks like a third of one.
 * Blocks that overlap are drawn side by side, so a clash is a shape
 * rather than something you work out from two timestamps.
 *
 * This existed twice. The registration form and the builder shared one
 * copy; the Admin dashboard had a hand-copy with its own hour height
 * (56px against 62), its own gutter (w-12 against w-11), its own
 * minimum width (560 against 520) and its own inline offset helpers —
 * so the same three days were drawn at two scales depending on which
 * screen you were on, and only one of them ever got the phone layout.
 * The copy had also drifted into a bug nobody could see from the code:
 * its hour labels were measured from the top of the DAY HEADING rather
 * than the top of the grid, so every label sat a heading's height above
 * the line it named.
 *
 * What the two call sites actually disagree about is their DATA and
 * their CELL CONTENTS, not their geometry — one has `Placed` slots off
 * a form field, the other has Workshop rows with a shared lunch drawn
 * behind them. So they keep their own adapters and their own cell
 * innards, and hand them here. Every `top`, `height`, `left` and
 * `width` on this page is computed in this file and nowhere else: a
 * caller returns a descriptor, never an element, which is what stops
 * the geometry from being reachable from outside.
 *
 * Presentational: no data fetching, no domain types, no knowledge of
 * workshops, seats, ranks or forms.
 */
import type { ReactNode } from "react";
import type { Placed } from "@/lib/formbuilder/calendar";
import { label as hourLabel, place, type Grid } from "@/lib/allocation/schedule";

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
 * `read` is shorter again, for a receipt: nothing there is clicked, so
 * the floor is legibility rather than a thumb. 30px keeps the shortest
 * session on the live week at 75px and puts a stacked three-day receipt
 * inside one phone screen. Above @xl it is the picker's own 62px,
 * because the whole point of a receipt is that it is the same drawing.
 *
 * A custom property rather than a prop or a piece of state: the
 * container query already knows which layout it is in, and a second
 * source of truth for the same fact is how the two drawings drift
 * apart.
 */
export const HOUR_SCALE = {
  pick: "[--hour:46px] @xl:[--hour:62px]",
  read: "[--hour:30px] @xl:[--hour:62px]",
} as const;

/**
 * A day, written one way.
 *
 * The grid heading formats the real date; the ranked list under it used
 * to take its day from the option string a coordinator typed, and the
 * Admin calendar formatted its own. On a browser set to en-US that gave
 * "Mon Oct 26" in one place and "Mon 26 Oct" in another — one date,
 * several spellings, sometimes on one screen.
 *
 * en-GB, not the runtime default. `undefined` means the SERVER's ICU
 * locale during a server render and the BROWSER's on hydration — "Mon
 * Oct 26" replaced by "Mon 26 Oct" is a React text mismatch. Pinned, it
 * also matches the option strings a coordinator types and the labels in
 * training-week/schedule-2026.ts, and needs no comma stripped out
 * afterwards.
 */
export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * One cell, as the caller describes it — never as an element.
 *
 * `press` is the only thing that decides whether a cell is a button or
 * a div. A cell that does nothing when clicked reads as broken, so a
 * read-only grid gets divs rather than buttons with the handler quietly
 * removed.
 */
export interface WeekBlock {
  /** Border, fill, state. The box, its position and its size are ours. */
  className?: string;
  title?: string;
  children: ReactNode;
  press?: { onClick: () => void; pressed: boolean; disabled?: boolean };
}

/**
 * Context drawn BEHIND the cells: a shared lunch, a room closure.
 *
 * Full width and never lane-packed, because it is not competing for the
 * hour — packing it would shove the sessions it sits behind into a
 * narrower column, and nobody books a lunch.
 */
export interface WeekBand {
  key: string;
  /** "2026-10-27" — matched against the grid's own day keys. */
  day: string;
  /** "12:00" / "13:00", 24-hour. */
  start: string;
  end: string;
  className?: string;
  title?: string;
  children: ReactNode;
}

export interface WeekGridProps {
  /** Bounds, hour lines and lane-packed days. Built by the caller. */
  grid: Grid;
  /** One of HOUR_SCALE. */
  scale?: string;
  /**
   * The heading above one day column.
   *
   * Any height, and it need not be the same height on every day: the
   * headings share a flex row and the tallest sets the height, so the
   * day bodies stay level with each other and with the hour scale
   * whatever a caller puts up there.
   */
  head: (day: string) => ReactNode;
  /** One cell per packed slot. `null` draws nothing for that slot. */
  block: (slot: Placed) => WeekBlock | null;
  /** Filtered to each day here — hand it the whole list. */
  behind?: WeekBand[];
  /**
   * Hide the whole drawing from assistive tech.
   *
   * For a grid that is a picture of something already stated in words
   * beside it; a maze of absolutely positioned divs would only add
   * noise to the sentence. Never for one you can click.
   */
  decorative?: boolean;
}

export function WeekGrid({
  grid, scale = HOUR_SCALE.pick, head, block, behind = [], decorative,
}: WeekGridProps) {
  if (grid.days.length === 0) return null;

  const span = grid.endMin - grid.startMin;
  // A CSS length, so the container query owns the scale. Every top and
  // height inside is a percentage of this box and needs no change.
  const height = `calc(${span / 60} * var(--hour))`;

  return (
    /*
     * Side by side when there is room; one day under another when there
     * is not.
     *
     * A CONTAINER query, not a viewport one — the same calendar is drawn
     * at 708px inside a question row, at 760 on the confirmation, full
     * width on the Admin dashboard and narrower again inside the
     * builder's editor pane, all at one viewport width. Keyed to the
     * viewport it would stack a grid that had plenty of room and squeeze
     * one that had none.
     *
     * The alternative was what both copies used to do: a 520px (or
     * 560px) floor inside `overflow-x-auto`, which on every phone made
     * the week wider than its box — so you scrolled sideways, and the
     * thing you scrolled to was still clipped, badges wrapped and
     * Wednesday was off the edge. Stacking loses the ability to compare
     * heights ACROSS days, which a sideways scrollbar had already taken
     * away. Duration-as-height and side-by-side-means-clash both survive
     * inside each day, and those are the two things the drawing is for.
     */
    <div className="@container">
      {/* The hour scale lives HERE, one level below `@container`, and not
          on the container itself. An element is a query container for
          its DESCENDANTS and never for itself, so `@xl:[--hour:62px]`
          written up there resolved against whatever ancestor container
          happened to exist — which on the confirmation was the section
          (760px, so 62px) and inside a question row was nothing at all
          (so 46px). The picker and the receipt drew the same week at
          two different scales, 368px against 496px, and neither the
          class names nor the screenshots said which was intended. */}
      <div
        aria-hidden={decorative || undefined}
        className={`${scale} overflow-x-auto rounded-xl border-2 border-line-strong bg-card p-3`}
      >
        <div className="flex flex-col gap-4 @xl:min-w-[520px] @xl:flex-row @xl:items-stretch @xl:gap-2">
          {/* One scale for all three days, once there is a row to run
              alongside. Stacked, each day carries its own. */}
          <HourScale grid={grid} height={height} className="hidden @xl:flex" />

          {grid.days.map(({ day, slots }) => (
            /*
             * Stacked, a day is a two-column grid: the hour scale down
             * the left, the heading and the grid down the right. Side
             * by side it is a plain column, and `col-start` /
             * `row-start` stop applying.
             */
            <div
              key={day}
              className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 @xl:flex @xl:min-w-0 @xl:flex-1 @xl:flex-col @xl:gap-x-0"
            >
              <HourScale grid={grid} height={height} className="col-start-1 row-start-2 flex @xl:hidden" />

              {/* The heading GROWS to fill whatever room the tallest
                  heading in the row needs, which is what keeps the day
                  bodies — and the hour scale beside them — level with
                  each other. The copy this replaces reserved a fixed
                  22px instead, and the Admin's two-line heading did not
                  fit in 22px, which is exactly how its hour labels came
                  to sit above the lines they name. */}
              <div className="col-start-2 row-start-1 min-w-0 @xl:flex-1">{head(day)}</div>

              <div
                className="relative col-start-2 row-start-2 min-w-0 rounded-lg border border-line bg-elevated/40"
                style={{ height }}
              >
                {/* Hour rules, drawn on every column so the eye can
                    carry a time across the week. */}
                {grid.hours.map((m) => (
                  <div
                    key={m}
                    className="pointer-events-none absolute inset-x-0 border-t border-line/60"
                    style={{ top: offset(m, grid) }}
                  />
                ))}

                {/* Drawn first, so they sit behind the cells and read as
                    background rather than as something with seats. */}
                {behind
                  .filter((b) => b.day === day)
                  .map((b) => {
                    const pos = place({ option: b.key, day: b.day, start: b.start, end: b.end }, grid);
                    return (
                      <div
                        key={b.key}
                        title={b.title}
                        className={`absolute inset-x-0 overflow-hidden rounded-md ${b.className ?? ""}`}
                        style={{ top: `${pos.top}%`, height: `${pos.height}%` }}
                      >
                        {b.children}
                      </div>
                    );
                  })}

                {slots.map((sl) => {
                  const cell = block(sl);
                  if (!cell) return null;
                  const pos = place(sl, grid);
                  /*
                   * GEOMETRY, COMPUTED ONCE, HERE.
                   *
                   * The caller chose the border and the fill and wrote
                   * the innards; it cannot reach any of these four
                   * numbers, which is the whole reason this component
                   * takes a descriptor rather than an element.
                   */
                  const box = {
                    top: `${pos.top}%`,
                    height: `${pos.height}%`,
                    // Side by side when they overlap, full width when
                    // nothing is competing for the hour.
                    left: `${(sl.lane / sl.lanes) * 100}%`,
                    width: `calc(${100 / sl.lanes}% - 2px)`,
                  };
                  const cls = `absolute overflow-hidden rounded-md border px-1.5 py-1 text-left transition-colors ${cell.className ?? ""}`;

                  return cell.press ? (
                    <button
                      key={sl.option}
                      type="button"
                      onClick={cell.press.onClick}
                      aria-pressed={cell.press.pressed}
                      disabled={cell.press.disabled}
                      title={cell.title}
                      className={cls}
                      style={box}
                    >
                      {cell.children}
                    </button>
                  ) : (
                    <div key={sl.option} title={cell.title} className={cls} style={box}>
                      {cell.children}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where a minute sits, as a percentage of the grid's height. */
const offset = (min: number, grid: Grid) =>
  `${((min - grid.startMin) / (grid.endMin - grid.startMin)) * 100}%`;

/**
 * The hours down the side.
 *
 * Its own component because the week is drawn twice: once as a row of
 * days sharing a single scale, and once stacked, where each day needs
 * its own. Labels sit ON the hour line rather than in the band below
 * it, so a session starting at 11:00 has its top edge against the 11:00
 * label.
 *
 * The empty box on top is what holds that true. It grows to exactly the
 * height of the day heading beside it — whatever that heading turns out
 * to be — so the scale always starts where the grid starts. A fixed
 * margin here is what put the Admin copy's labels an inch too high.
 */
function HourScale({
  grid, height, className,
}: { grid: Grid; height: string; className?: string }) {
  return (
    <div className={`w-11 shrink-0 flex-col ${className ?? ""}`}>
      <div className="flex-1" />
      <div className="relative" style={{ height }}>
        {grid.hours.map((m) => (
          <span
            key={m}
            className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-subtle"
            style={{ top: offset(m, grid) }}
          >
            {hourLabel(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
