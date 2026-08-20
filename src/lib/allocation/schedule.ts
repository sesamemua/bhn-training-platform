/**
 * Turning workshops into a time grid: hours down the side, days across.
 *
 * The old calendar grouped sessions under a day heading and listed them.
 * That tells you WHAT is on each day and nothing about WHEN — two tours
 * at the same hour and a tour that runs all afternoon looked identical,
 * so the one question a calendar exists to answer went unanswered.
 *
 * Every day is measured against ONE pair of bounds, which is what makes
 * the columns line up: 10am on Monday sits at the same height as 10am on
 * Wednesday because both are offset from the same start of day.
 *
 * Times are read in the VIEWER's timezone. A session stored as 15:00Z is
 * an 11am Toronto tour, and 11am is where an organiser expects it.
 *
 * Pure module: no React, no I/O.
 */
import { packDay, type Placed, type Slot } from "@/lib/formbuilder/calendar";

export interface Timed {
  id: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export interface Grid {
  /** Minutes from midnight the grid starts and ends at, whole hours. */
  startMin: number;
  endMin: number;
  /** Every hour line to draw, inclusive of both ends. */
  hours: number[];
  days: { day: string; slots: Placed[] }[];
}

/**
 * Lay a set of workshops out as one aligned grid.
 *
 * Bounds are the earliest start and latest end across ALL days, rounded
 * out to whole hours — not per day, or Monday's 9am would sit level with
 * Tuesday's 1pm and the grid would lie about the week.
 */
export function timeGrid(items: Timed[]): Grid {
  const slots: Slot[] = items
    .map((w) => {
      const s = new Date(w.startDateTime);
      const e = new Date(w.endDateTime);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
      return { option: `${w.id}|${w.title}`, day: dayKey(s), start: hhmm(s), end: hhmm(e) };
    })
    .filter((s): s is Slot => s !== null);

  if (slots.length === 0) return { startMin: 9 * 60, endMin: 17 * 60, hours: [], days: [] };

  const starts = slots.map((s) => toMinutes(s.start));
  const ends = slots.map((s) => toMinutes(s.end));
  const startMin = Math.floor(Math.min(...starts) / 60) * 60;
  // At least an hour tall even if every session is a point in time, or
  // the grid collapses and every cell lands on the same line.
  const endMin = Math.max(Math.ceil(Math.max(...ends) / 60) * 60, startMin + 60);

  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);

  const byDay = new Map<string, Slot[]>();
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);

  return {
    startMin,
    endMin,
    hours,
    days: [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, list]) => ({ day, slots: packDay(list) })),
  };
}

/** Split the id back off a packed slot's option string. */
export const idOf = (option: string) => option.split("|")[0];
export const titleOf = (option: string) => option.split("|").slice(1).join("|") || option;

/** Where a slot sits in the grid, as percentages of the grid's height. */
export function place(slot: Slot, grid: Grid) {
  const span = grid.endMin - grid.startMin;
  const top = ((toMinutes(slot.start) - grid.startMin) / span) * 100;
  const height = ((toMinutes(slot.end) - toMinutes(slot.start)) / span) * 100;
  // A very short session still has to be readable.
  return { top, height: Math.max(height, 4) };
}

/** "09:00", from minutes past midnight. */
export const label = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
