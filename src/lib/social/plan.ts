/**
 * Which posts should exist for a cycle, and when each should go out.
 *
 * The planner is a pure function of the cycle and the clock. It says
 * what SHOULD exist; reconciling that against what does exist is
 * sync.ts's job, and it only ever adds — a post somebody has edited,
 * approved or declined is never touched by a later run.
 *
 * All date arithmetic is done in America/Toronto. The server runs in
 * UTC, and a reminder that says "2 days left" has to agree with the
 * calendar the reader is looking at, not the one the process is.
 */
import {
  REMINDER_LADDER, type CycleFacts, type PostKey, type SocialKind,
} from "./types";

const ZONE = "America/Toronto";

/** Midnight-to-midnight day difference in the reader's timezone. */
export function daysBetween(from: Date, to: Date): number {
  const day = (d: Date) => {
    // en-CA gives YYYY-MM-DD, which parses back as a UTC midnight —
    // so the subtraction below is whole days with no DST remainder.
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    return Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    );
  };
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/** The date part, as a reader in Toronto would write it. */
export function readableDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "long", day: "numeric",
  }).format(d);
}

export interface PlannedPost extends PostKey {
  /** When this should be posted. */
  scheduledFor: Date;
  /** Days left at the moment it goes out — 0 on the deadline itself. */
  daysLeft: number;
}

/**
 * When a post for `daysBefore` should go out.
 *
 * 9am Toronto on the day in question. Not the minute the window opens:
 * a launch post at 03:14 because that is when an admin created the
 * cycle reads as an accident.
 */
export function sendTimeFor(deadlineAt: Date, daysBefore: number): Date {
  const target = new Date(deadlineAt.getTime() - daysBefore * 86_400_000);
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(target);
  // 13:00Z is 9am EDT and 8am EST. Close enough to a working morning in
  // both halves of the year without carrying a timezone library.
  return new Date(`${iso}T13:00:00.000Z`);
}

/**
 * The launch post and the reminder ladder for one cycle.
 *
 * Rungs already in the past are still planned. A cycle created a week
 * before its deadline should not silently lose its 14-day reminder —
 * sync.ts marks an overdue post rather than pretending it was never
 * due, because "we missed it" is information and a gap is not.
 */
export function planCycle(facts: CycleFacts, now: Date): PlannedPost[] {
  const base = { stream: facts.stream, deadlineId: facts.deadlineId };
  const out: PlannedPost[] = [{
    ...base,
    kind: "launch" as SocialKind,
    daysBefore: 0,
    // The launch goes out now-ish, not relative to the deadline: it
    // announces that the window is open, which is today's news.
    scheduledFor: sendTimeFor(now, 0),
    daysLeft: daysBetween(now, facts.deadlineAt),
  }];

  for (const rung of REMINDER_LADDER) {
    out.push({
      ...base,
      kind: "reminder",
      daysBefore: rung,
      scheduledFor: sendTimeFor(facts.deadlineAt, rung),
      daysLeft: rung,
    });
  }
  return out;
}

/**
 * The recipients post, which cannot be planned from a date.
 *
 * It exists once there is somebody to name — decisions land when they
 * land, and a post scheduled for a day the panel had not finished
 * would be an empty announcement. Planned only when the caller has
 * consenting recipients in hand.
 */
export function planRecipients(facts: CycleFacts, now: Date): PlannedPost {
  return {
    stream: facts.stream,
    kind: "recipients",
    deadlineId: facts.deadlineId,
    daysBefore: 0,
    scheduledFor: sendTimeFor(now, 0),
    daysLeft: 0,
  };
}

/** Past its send time and still not out. */
export function isOverdue(scheduledFor: Date, now: Date): boolean {
  return scheduledFor.getTime() < now.getTime();
}
