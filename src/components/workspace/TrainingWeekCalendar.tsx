"use client";

/**
 * The organiser's side of the week: hours down the side, a column per
 * day, how full each room is written on the block.
 *
 * It used to be three lists under three headings, which says what is on
 * each day and nothing about when. Two tours at the same hour and a tour
 * that runs all afternoon looked the same, and telling them apart is the
 * only reason to draw a calendar rather than a table.
 *
 * The drawing is `WeekGrid`, the same component the registration form
 * and the builder draw with. This file is only the ADAPTER: Workshop
 * rows become a grid, the shared lunch becomes a band drawn behind it,
 * and a seat count goes on each cell. It was a hand-copy of the form's
 * calendar until that stopped being tenable — see the note at the top
 * of WeekGrid.tsx for what the two copies had drifted into.
 *
 * Its own file rather than another thousand lines of TrainingAdmin.tsx
 * because that component imports its own server actions, and a calendar
 * that cannot be rendered without `server-only` cannot be tested beside
 * the form's calendar — which is the one thing anybody needs to check
 * about it. See tests/unit/week-grid.test.tsx.
 */
import { useMemo } from "react";
import { countsOf, type AdminWorkshop } from "@/lib/allocation/admin-types";
import { idOf, timeGrid, titleOf } from "@/lib/allocation/schedule";
import { DAYS, LEARNING_PATHS, SHARED } from "@/lib/training-week/schedule-2026";
import { dayLabel, WeekGrid } from "./WeekGrid";

export function TrainingWeekCalendar({ workshops }: { workshops: AdminWorkshop[] }) {
  // The shared items only widen the grid — they are drawn behind the
  // sessions rather than beside them, because nobody books a lunch.
  const grid = useMemo(() => timeGrid(workshops, SHARED), [workshops]);
  const byId = useMemo(() => new Map(workshops.map((w) => [w.id, w])), [workshops]);
  const themeOf = (day: string) => DAYS.find((d) => d.date === day);

  if (grid.days.length === 0) {
    return <p className="mt-2 text-[12.5px] text-muted">No sessions scheduled.</p>;
  }

  return (
    <>
      <div className="mt-2">
        <WeekGrid
          grid={grid}
          head={(day) => (
            <>
              <p className="text-center text-[11px] font-bold uppercase tracking-wide text-subtle">
                {dayLabel(day)}
              </p>
              {/* The programme the day belongs to. It is how the
                  coordinators talk about the week, and without it the
                  columns are three anonymous dates. */}
              <p className="truncate pb-1.5 text-center text-[10px] text-muted" title={themeOf(day)?.theme}>
                {themeOf(day)?.theme ?? ""}
              </p>
            </>
          )}
          behind={SHARED.map((x) => ({
            key: x.slug,
            day: x.day,
            start: x.start,
            end: x.end,
            title: `${x.title} · ${x.start}–${x.end}${x.note ? ` · ${x.note}` : ""}`,
            className: "border border-dashed border-line-strong bg-elevated px-1.5 py-0.5",
            children: <p className="truncate text-[10px] text-muted">{x.title}</p>,
          }))}
          block={(sl) => {
            const w = byId.get(idOf(sl.option));
            // A slot whose workshop has gone: drawn as nothing rather
            // than as an empty box with a seat count of its own.
            if (!w) return null;
            const c = countsOf(w);
            const full = c.confirmed >= c.capacity && c.capacity > 0;
            return {
              title: `${titleOf(sl.option)} · ${sl.start}–${sl.end}${w.locationName ? ` · ${w.locationName}` : ""}`,
              className: full ? "border-amber-500/70 bg-amber-500/12" : "border-brand-500/60 bg-brand-500/12",
              children: (
                <>
                  <p className="truncate font-mono text-[9.5px] text-subtle">{sl.start}–{sl.end}</p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-tight text-fg line-clamp-2">
                    {titleOf(sl.option)}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {c.confirmed}/{c.capacity}
                    {c.waitlisted > 0 ? ` · ${c.waitlisted} wait` : ""}
                  </p>
                </>
              ),
            };
          }}
        />
      </div>
      {/* Courses that run alongside the week rather than at an hour on
          it. No seats and no clash, so they belong under the grid
          rather than in it — but leaving them out entirely makes the
          week look emptier than it is. */}
      {LEARNING_PATHS.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-elevated/40">
          {LEARNING_PATHS.map((lp) => (
            <li key={lp.title} className="flex flex-wrap items-baseline gap-x-2 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-fg">{lp.title}</span>
              <span className="font-mono text-[10px] text-subtle">
                {lp.days.map((d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })).join(" · ")}
              </span>
              {lp.note && <span className="text-[10.5px] text-muted">{lp.note}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-subtle">
        All three days share one scale, so sessions level with each other run
        at the same time. Amber means the room is full. Dashed blocks are for
        everyone on the day and are not booked.
      </p>
    </>
  );
}
