/**
 * Newsletter production calendar — the date arithmetic.
 *
 * One issue per month, landing in the third week, and never on a Monday
 * or a Friday. Everything else is derived by walking BACKWARDS from the
 * send date in business days, so the plan is always:
 *
 *     ├── draft window ──┤├── build + review ──┤
 *     D1        D2        D3         D4         SEND
 *     ▲                              ▲          ▲
 *     drafts requested               approval   issue goes out
 *               ▲ drafts due (end of D2)
 *
 * Two writing days for the program leads, two days for the marketing
 * side to build and review, then send. With the default third-Wednesday
 * send that reads: drafts requested Thursday, due end of Friday, built
 * Monday–Tuesday, out Wednesday.
 *
 * All arithmetic is done on calendar dates in UTC and dates are carried
 * as "YYYY-MM-DD" strings. A newsletter cycle is a human schedule, not
 * an instant — storing it as a timestamp invites an off-by-one every
 * time the server's clock and Toronto disagree about what day it is.
 * The reminder SENDER is what applies a send-hour in the local zone.
 *
 * Pure module: no Prisma, no I/O, no Date.now() in the planning path
 * (the caller passes the month it wants), so it is trivially testable.
 */

/** Sunday = 0 … Saturday = 6, matching Date#getUTCDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The only weekdays an issue may go out on: Tue, Wed, Thu. */
export const SEND_WEEKDAYS = [2, 3, 4] as const;
export type SendWeekday = (typeof SEND_WEEKDAYS)[number];

export function isSendWeekday(v: number): v is SendWeekday {
  return (SEND_WEEKDAYS as readonly number[]).includes(v);
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export interface ScheduleConfig {
  /** Which of Tue/Wed/Thu the issue goes out on. */
  sendWeekday: SendWeekday;
  /** Which occurrence of that weekday in the month — 3 = third week. */
  weekOfMonth: number;
  /** Business days the program leads get to write. */
  draftDays: number;
  /** Business days marketing gets to build + review before sending. */
  buildDays: number;
  /** "YYYY-MM-DD" dates treated as non-working (stat holidays, closures). */
  holidays: string[];
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  sendWeekday: 3, // Wednesday
  weekOfMonth: 3, // third week
  draftDays: 2,
  buildDays: 2,
  holidays: [],
};

/** A fully planned month. Every field is a "YYYY-MM-DD" calendar date. */
export interface PlannedCycle {
  /** First day of the month this issue belongs to, "YYYY-MM-01". */
  month: string;
  /** Drafts requested — the leads' reminder goes out this morning. */
  draftOpen: string;
  /** Drafts due at end of this day. */
  draftDue: string;
  /** Marketing starts building. */
  buildStart: string;
  /** Last working day before send — review closes, approval is needed. */
  approvalDue: string;
  /** The issue goes out. */
  sendDate: string;
  /** True when the send date had to move off the configured weekday. */
  sendDateAdjusted: boolean;
}

// ── date primitives ───────────────────────────────────────────────────
// "YYYY-MM-DD" ⇄ UTC-midnight Date. Kept private so no caller can leak a
// local-timezone Date into the arithmetic.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = parseDate(v);
  return toIso(d) === v; // rejects 2026-02-31 and friends
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function weekdayOf(iso: string): Weekday {
  return parseDate(iso).getUTCDay() as Weekday;
}

/** Mon–Fri and not on the holiday list. */
export function isBusinessDay(iso: string, holidays: readonly string[] = []): boolean {
  const day = weekdayOf(iso);
  if (day === 0 || day === 6) return false;
  return !holidays.includes(iso);
}

/**
 * Walk `n` business days from `iso`, skipping weekends and holidays.
 * Negative `n` walks backwards. n = 0 returns the date unchanged even if
 * it is not itself a business day — callers that care check first.
 */
export function addBusinessDays(
  iso: string,
  n: number,
  holidays: readonly string[] = [],
): string {
  if (n === 0) return iso;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cur = iso;
  // Bounded so a pathological holiday list can never spin forever.
  for (let guard = 0; guard < 3650 && remaining > 0; guard++) {
    cur = addDays(cur, step);
    if (isBusinessDay(cur, holidays)) remaining--;
  }
  return cur;
}

/**
 * The nth occurrence of a weekday in a month (n is 1-based). If the month
 * has fewer than n occurrences — only possible for n = 5 — the last one
 * is returned rather than spilling into the next month.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number, // 1-12
  weekday: Weekday,
  n: number,
): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  let day = 1 + shift + (n - 1) * 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  while (day > daysInMonth) day -= 7;
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Resolve the send date for a month, honouring the "never Monday or
 * Friday" rule even when the configured day is a holiday: try the other
 * allowed weekdays in the SAME week (later first, so the issue slips
 * rather than rushes), and only if the whole week is blocked fall back
 * to the next working day.
 */
function resolveSendDate(
  year: number,
  month: number,
  config: ScheduleConfig,
): { sendDate: string; adjusted: boolean } {
  const target = nthWeekdayOfMonth(year, month, config.sendWeekday, config.weekOfMonth);
  if (isBusinessDay(target, config.holidays)) return { sendDate: target, adjusted: false };

  // Same week, remaining allowed weekdays: later ones first, then earlier.
  const later = SEND_WEEKDAYS.filter((d) => d > config.sendWeekday);
  const earlier = SEND_WEEKDAYS.filter((d) => d < config.sendWeekday).reverse();
  for (const day of [...later, ...earlier]) {
    const candidate = addDays(target, day - config.sendWeekday);
    if (isBusinessDay(candidate, config.holidays)) {
      return { sendDate: candidate, adjusted: true };
    }
  }
  return { sendDate: addBusinessDays(target, 1, config.holidays), adjusted: true };
}

/**
 * Plan one month's cycle. Everything hangs off the send date and is
 * derived backwards, so changing draftDays/buildDays reshapes the run-up
 * without ever moving the send date.
 */
export function planCycle(
  year: number,
  month: number, // 1-12
  config: ScheduleConfig = DEFAULT_SCHEDULE,
): PlannedCycle {
  const { sendDate, adjusted } = resolveSendDate(year, month, config);

  // Build window: the `buildDays` working days immediately before send.
  const approvalDue = addBusinessDays(sendDate, -1, config.holidays);
  const buildStart = addBusinessDays(sendDate, -config.buildDays, config.holidays);

  // Draft window: the `draftDays` working days immediately before that.
  const draftDue = addBusinessDays(buildStart, -1, config.holidays);
  const draftOpen = addBusinessDays(draftDue, -(config.draftDays - 1), config.holidays);

  return {
    month: `${year}-${String(month).padStart(2, "0")}-01`,
    draftOpen,
    draftDue,
    buildStart,
    approvalDue,
    sendDate,
    sendDateAdjusted: adjusted,
  };
}

/**
 * Plan `count` consecutive months starting at the given month — the
 * "configure automatically for X months" path.
 */
export function planMonths(
  startYear: number,
  startMonth: number,
  count: number,
  config: ScheduleConfig = DEFAULT_SCHEDULE,
): PlannedCycle[] {
  const out: PlannedCycle[] = [];
  for (let i = 0; i < count; i++) {
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    const m = ((startMonth - 1 + i) % 12) + 1;
    out.push(planCycle(y, m, config));
  }
  return out;
}


/**
 * Snap an arbitrary date onto a legal send day (Tue/Wed/Thu, never a
 * holiday). `prefer` biases which way we look first, so a drag feels like
 * it follows the pointer rather than jumping backwards.
 *
 * This is what makes the rule learnable by touch: dragging across a
 * Friday simply refuses to land there, and the band settles on Thursday
 * or the following Tuesday. Nobody has to read that Mondays and Fridays
 * are excluded — the interaction says so.
 */
export function snapToSendDay(
  iso: string,
  holidays: readonly string[] = [],
  prefer: "forward" | "backward" = "forward",
): string {
  const legal = (d: string) =>
    isSendWeekday(weekdayOf(d)) && isBusinessDay(d, holidays);
  if (legal(iso)) return iso;

  const dirs = prefer === "forward" ? [1, -1] : [-1, 1];
  // Six days is enough to reach a legal day from anywhere in a week, in
  // either direction, even with a holiday in the way.
  for (let distance = 1; distance <= 6; distance++) {
    for (const dir of dirs) {
      const candidate = addDays(iso, dir * distance);
      if (legal(candidate)) return candidate;
    }
  }
  return iso;
}

/**
 * The next legal send day strictly beyond `iso`, in the given direction.
 *
 * Distinct from snapToSendDay, and the distinction matters: snapping
 * finds the NEAREST legal day, which is right for a drag (the band
 * resists an illegal day and settles on the closest one). For a keyboard
 * step it would be wrong — stepping right from a Thursday tries Friday,
 * whose nearest legal neighbour is that same Thursday, so the arrow key
 * would appear dead. A step must always move.
 */
export function stepSendDay(
  iso: string,
  direction: 1 | -1,
  holidays: readonly string[] = [],
): string {
  for (let i = 1; i <= 14; i++) {
    const candidate = addDays(iso, direction * i);
    if (isSendWeekday(weekdayOf(candidate)) && isBusinessDay(candidate, holidays)) {
      return candidate;
    }
  }
  return iso;
}

/**
 * Derive a full cycle from an EXPLICIT send date rather than from the
 * nth-weekday rule — the path a drag takes. Milestones still walk
 * backwards in business days, so a hand-placed send date produces the
 * same shape of run-up as a generated one.
 */
export function planFromSendDate(
  sendDate: string,
  month: string,
  config: Pick<ScheduleConfig, "draftDays" | "buildDays" | "holidays">,
): PlannedCycle {
  const approvalDue = addBusinessDays(sendDate, -1, config.holidays);
  const buildStart = addBusinessDays(sendDate, -config.buildDays, config.holidays);
  const draftDue = addBusinessDays(buildStart, -1, config.holidays);
  const draftOpen = addBusinessDays(draftDue, -(config.draftDays - 1), config.holidays);
  return {
    month,
    draftOpen,
    draftDue,
    buildStart,
    approvalDue,
    sendDate,
    // A hand-placed date is by definition where the user wanted it.
    sendDateAdjusted: false,
  };
}

/**
 * How many business days a window spans, inclusive of both ends. Used to
 * read a dragged edge back out as a draftDays / buildDays number.
 */
export function businessDaysBetween(
  fromIso: string,
  toIso: string,
  holidays: readonly string[] = [],
): number {
  if (toIso < fromIso) return 0;
  let count = 0;
  let cur = fromIso;
  for (let guard = 0; guard < 400 && cur <= toIso; guard++) {
    if (isBusinessDay(cur, holidays)) count++;
    cur = addDays(cur, 1);
  }
  return count;
}

/** Every day of a month as "YYYY-MM-DD" — the calendar strip's axis. */
export function daysOfMonth(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) =>
    `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
}

// ── reminders ─────────────────────────────────────────────────────────

/**
 * The four moments a cycle needs to nudge somebody. Each maps to a date
 * on the PlannedCycle, so adding a reminder kind never means adding a
 * date field.
 */
export const REMINDER_KINDS = [
  "draft_request",  // → program leads: "your section is due in two days"
  "draft_due",      // → program leads: "drafts close today"
  "approval",       // → the approver: "review is done, needs your sign-off"
  "send_day",       // → whoever pushes the button
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_ON: Record<ReminderKind, keyof PlannedCycle> = {
  draft_request: "draftOpen",
  draft_due: "draftDue",
  approval: "approvalDue",
  send_day: "sendDate",
};

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  draft_request: "Draft request",
  draft_due: "Drafts due today",
  approval: "Approval needed",
  send_day: "Send day",
};

/**
 * How a reminder leaves the building.
 *   auto   — the platform emails the recipients itself.
 *   manual — the platform emails only the coordinator a ready-to-send
 *            copy, and they send it by hand. This is the default for
 *            lead-facing nudges where a human voice matters.
 */
export const REMINDER_MODES = ["auto", "manual"] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];

export interface PlannedReminder {
  kind: ReminderKind;
  /** "YYYY-MM-DD" — the morning this fires. */
  scheduledFor: string;
}

export function planReminders(cycle: PlannedCycle): PlannedReminder[] {
  return REMINDER_KINDS.map((kind) => ({
    kind,
    scheduledFor: cycle[REMINDER_ON[kind]] as string,
  }));
}

/** Human summary of a cycle, for the calendar UI and the emails. */
export function describeCycle(cycle: PlannedCycle): string {
  const day = (iso: string) => `${WEEKDAY_LABEL[weekdayOf(iso)]} ${iso.slice(8)}`;
  return (
    `Drafts ${day(cycle.draftOpen)}–${day(cycle.draftDue)} · ` +
    `Build ${day(cycle.buildStart)}–${day(cycle.approvalDue)} · ` +
    `Send ${day(cycle.sendDate)}`
  );
}
