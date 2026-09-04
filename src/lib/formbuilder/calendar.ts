/**
 * Laying sessions out as a week, so a clash is visible rather than
 * discovered.
 *
 * A list of tick-boxes gives no hint that two of them are the same hour
 * on the same day. People pick both, the coordinator approves one, and
 * the other becomes a disappointment that the form could have shown them
 * up front. Side by side in a day column, an overlap is just obvious.
 *
 * Pure module: no React, no I/O.
 */

export interface Slot {
  /** Matches one of the field's option strings exactly. */
  option: string;
  /** "2026-10-26" — grouped on, and sorted by. */
  day: string;
  /** "09:00" / "16:30", 24-hour. */
  start: string;
  end: string;
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** Do two slots share any part of the same day and hour? */
export function clashes(a: Slot, b: Slot): boolean {
  if (a.day !== b.day) return false;
  // Touching end-to-start is not a clash: a tour finishing at 12:00 and
  // a workshop starting at 12:00 are consecutive, not concurrent.
  return mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end);
}

export interface Placed extends Slot {
  /** Which side-by-side column this sits in, 0-based. */
  lane: number;
  /** How many lanes its overlapping group needs. */
  lanes: number;
}

/**
 * Pack one day's slots into lanes so nothing is drawn on top of anything.
 *
 * Greedy left-to-right: the standard calendar algorithm. Slots that do
 * not overlap reuse a lane, so a day of consecutive sessions stays one
 * column wide and only genuine clashes split.
 */
export function packDay(slots: Slot[]): Placed[] {
  const sorted = [...slots].sort(
    (a, b) => mins(a.start) - mins(b.start) || mins(a.end) - mins(b.end) || a.option.localeCompare(b.option),
  );

  const laneEnds: number[] = [];
  const placed: (Slot & { lane: number })[] = [];
  for (const s of sorted) {
    let lane = laneEnds.findIndex((end) => end <= mins(s.start));
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = mins(s.end);
    placed.push({ ...s, lane });
  }

  // How wide each slot should be drawn: the number of lanes its own
  // clash group actually needs, not the busiest lane count of the day —
  // a lone afternoon session should not be drawn half-width because the
  // morning had two.
  return placed.map((s) => {
    const group = placed.filter((o) => clashes(s, o) || o.option === s.option);
    return { ...s, lanes: Math.max(...group.map((g) => g.lane)) + 1 };
  });
}

/** Group into days, in date order, each packed into lanes. */
export function packWeek(slots: Slot[]): { day: string; slots: Placed[] }[] {
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, list]) => ({ day, slots: packDay(list) }));
}

/** Which of the chosen options clash with each other. */
export function chosenClashes(slots: Slot[], chosen: string[]): [string, string][] {
  const picked = slots.filter((s) => chosen.includes(s.option));
  const out: [string, string][] = [];
  for (let i = 0; i < picked.length; i++) {
    for (let j = i + 1; j < picked.length; j++) {
      if (clashes(picked[i], picked[j])) out.push([picked[i].option, picked[j].option]);
    }
  }
  return out;
}

/** Options that cannot be held together, and why. */
export interface ExclusiveGroup {
  options: string[];
  reason: string;
}

/** One conflicting pair among the chosen options. */
export interface Conflict {
  a: string;
  b: string;
  /** Why, when it is not simply the clock. Null for a time overlap. */
  reason: string | null;
}

/**
 * Every reason two chosen options cannot both be attended: the times
 * overlap, or the form declares the pair impossible.
 *
 * Declared groups are evaluated FIRST so that a pair which is both
 * declared and overlapping keeps the specific reason — "these are two
 * hours apart by road" tells somebody more than "these clash".
 */
export function chosenConflicts(
  slots: Slot[],
  chosen: string[],
  cannotCombine: ExclusiveGroup[] = [],
): Conflict[] {
  const out: Conflict[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, reason: string | null) => {
    const k = [a, b].sort().join("\u0000");
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ a, b, reason });
  };

  for (const g of cannotCombine) {
    const hit = g.options.filter((o) => chosen.includes(o));
    for (let i = 0; i < hit.length; i++) {
      for (let j = i + 1; j < hit.length; j++) add(hit[i], hit[j], g.reason);
    }
  }

  const picked = slots.filter((s) => chosen.includes(s.option));
  for (let i = 0; i < picked.length; i++) {
    for (let j = i + 1; j < picked.length; j++) {
      if (clashes(picked[i], picked[j])) add(picked[i].option, picked[j].option, null);
    }
  }
  return out;
}
