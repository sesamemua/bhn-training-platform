/**
 * Persisting the content calendar.
 *
 * `planMonths` (schedule.ts) is pure arithmetic; this is the layer that
 * writes it down. Generating the same span twice must be safe — the
 * calendar is something a coordinator will re-run after changing the send
 * weekday or adding a holiday — so every write is an upsert keyed on the
 * month, and reminders are upserted on (cycle, kind).
 *
 * One rule the upsert protects: a cycle that has already been APPROVED or
 * SENT is never rewritten. Re-planning the year must not move the send
 * date of an issue that already went out, or erase who approved it.
 */
import { prisma } from "@/lib/prisma";
import { getHolidayInfo } from "@/lib/holidays";
import {
  planFromSendDate,
  planMonths,
  planReminders,
  type PlannedCycle,
  type ScheduleConfig,
} from "./schedule";
import type { NewsletterConfig } from "./config";

/** Cycles in these states are historical record, not plans. */
const FROZEN = ["approved", "sent"];

/**
 * A cycle the coordinator has dragged by hand. Recorded inside
 * configSnapshot rather than as a column so this needed no migration —
 * and it belongs there anyway: the snapshot already answers "what rules
 * produced these dates", and "a human placed them" is one such answer.
 */
export function isManuallyPlaced(snapshot: unknown): boolean {
  return !!snapshot && typeof snapshot === "object" && (snapshot as { manual?: boolean }).manual === true;
}

/**
 * Statutory closures across the planned span, as "YYYY-MM-DD".
 * Computed rather than configured so the calendar is right without anyone
 * maintaining a holiday list; the config's own `holidays` array is merged
 * on top for team-specific closures.
 */
export function statHolidaysBetween(startIso: string, months: number): string[] {
  const out: string[] = [];
  const [y, m] = startIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m - 1 + months + 1, 1));
  while (cursor < end) {
    if (getHolidayInfo(cursor)) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** The schedule config actually used for planning, holidays folded in. */
export function effectiveSchedule(
  config: NewsletterConfig,
  startMonth: string,
  months: number,
): ScheduleConfig {
  const stat = config.useStatHolidays ? statHolidaysBetween(startMonth, months) : [];
  return {
    ...config.schedule,
    holidays: [...new Set([...config.schedule.holidays, ...stat])].sort(),
  };
}

export interface GenerateResult {
  created: number;
  updated: number;
  frozen: number;
  cycles: PlannedCycle[];
}

/**
 * Plan `months` months forward from `startMonth` ("YYYY-MM-01") and write
 * them down. Idempotent: re-running over the same span updates the dates
 * of still-provisional cycles and leaves approved/sent ones alone.
 */
export async function generateCalendar(opts: {
  startYear: number;
  startMonth: number; // 1-12
  months: number;
  config: NewsletterConfig;
  createdById?: string | null;
  /** Today in Toronto, "YYYY-MM-DD". Reminders dated before it are not armed. */
  today?: string;
}): Promise<GenerateResult> {
  const startIso = `${opts.startYear}-${String(opts.startMonth).padStart(2, "0")}-01`;
  const schedule = effectiveSchedule(opts.config, startIso, opts.months);
  const planned = planMonths(opts.startYear, opts.startMonth, opts.months, schedule);

  const existing = await prisma.newsletterCycle.findMany({
    where: { month: { in: planned.map((p) => p.month) } },
    select: { id: true, month: true, status: true, configSnapshot: true },
  });
  const byMonth = new Map(existing.map((c) => [c.month, c]));

  let created = 0;
  let updated = 0;
  let frozen = 0;

  for (const p of planned) {
    const hit = byMonth.get(p.month);
    // Leave alone anything that is history, and anything a human placed
    // by hand — re-planning must never quietly undo a drag.
    if (hit && (FROZEN.includes(hit.status) || isManuallyPlaced(hit.configSnapshot))) {
      frozen++;
      continue;
    }

    const dates = {
      draftOpen: p.draftOpen,
      draftDue: p.draftDue,
      buildStart: p.buildStart,
      approvalDue: p.approvalDue,
      sendDate: p.sendDate,
      sendDateAdjusted: p.sendDateAdjusted,
      configSnapshot: schedule as unknown as object,
    };

    const cycle = await prisma.newsletterCycle.upsert({
      where: { month: p.month },
      create: { month: p.month, ...dates, createdById: opts.createdById ?? null },
      update: dates,
    });
    hit ? updated++ : created++;

    // Reminders ride the cycle's dates. Upserting on (cycle, kind) means a
    // re-plan moves a pending reminder to its new day; one that already
    // went out keeps its status and its record of where it went.
    //
    // A reminder whose day has already passed is created as `skipped`,
    // never `pending`. Otherwise planning the current month — the first
    // thing anyone does — would leave reminders that are instantly "due",
    // and the next maintenance sweep would chase three program leads about
    // a deadline that is already behind them. Backfilling the calendar
    // must never be a send.
    for (const r of planReminders(p)) {
      const alreadyPast = opts.today ? r.scheduledFor < opts.today : false;
      await prisma.newsletterReminder.upsert({
        where: { cycleId_kind: { cycleId: cycle.id, kind: r.kind } },
        create: {
          cycleId: cycle.id,
          kind: r.kind,
          scheduledFor: r.scheduledFor,
          mode: opts.config.modes[r.kind] ?? "manual",
          status: alreadyPast ? "skipped" : "pending",
          error: alreadyPast ? "Date had already passed when the calendar was filled in" : null,
        },
        update: {
          // Only a still-pending reminder may be rescheduled.
          scheduledFor: r.scheduledFor,
          mode: opts.config.modes[r.kind] ?? "manual",
        },
      });
    }
  }

  return { created, updated, frozen, cycles: planned };
}

/** Cycles from `fromMonth` onward, newest work first, with reminders. */
export async function listCycles(fromMonth: string, take = 24) {
  return prisma.newsletterCycle.findMany({
    where: { month: { gte: fromMonth } },
    orderBy: { month: "asc" },
    take,
    include: {
      reminders: { orderBy: { scheduledFor: "asc" } },
    },
  });
}

/**
 * Move a cycle's status along based on today's date. Called by the daily
 * sweep so the calendar reflects reality without anyone clicking:
 * `planned` becomes `active` when its draft window opens, and an approved
 * cycle becomes `sent` the day after its send date.
 */
export async function advanceCycleStatuses(today: string): Promise<{ activated: number; sent: number }> {
  const activated = await prisma.newsletterCycle.updateMany({
    where: { status: "planned", draftOpen: { lte: today } },
    data: { status: "active" },
  });
  const sent = await prisma.newsletterCycle.updateMany({
    where: { status: "approved", sendDate: { lt: today } },
    data: { status: "sent" },
  });
  return { activated: activated.count, sent: sent.count };
}


/**
 * Move one cycle by hand — the write behind a drag on the calendar.
 *
 * Either the send date moves (everything else re-derives backwards) or a
 * window changes length (the send date holds and the run-up reshapes).
 * The result is stamped `manual` so a later "generate" leaves it alone.
 *
 * Pending reminders follow their milestone; ones already sent keep both
 * their status and their record of where they went.
 */
export async function rescheduleCycle(opts: {
  cycleId: string;
  config: NewsletterConfig;
  /** New send date, already snapped to a legal weekday by the caller. */
  sendDate?: string;
  draftDays?: number;
  buildDays?: number;
}) {
  const cycle = await prisma.newsletterCycle.findUnique({ where: { id: opts.cycleId } });
  if (!cycle) throw new Error("Cycle not found");
  if (FROZEN.includes(cycle.status)) {
    throw new Error("This issue has already been approved or sent — its dates are history now.");
  }

  const snap = (cycle.configSnapshot ?? {}) as Partial<ScheduleConfig>;
  const holidays = snap.holidays ?? effectiveSchedule(opts.config, cycle.month, 1).holidays;

  const draftDays = clampWindow(opts.draftDays ?? snap.draftDays ?? opts.config.schedule.draftDays);
  const buildDays = clampWindow(opts.buildDays ?? snap.buildDays ?? opts.config.schedule.buildDays);
  const sendDate = opts.sendDate ?? cycle.sendDate;

  const planned = planFromSendDate(sendDate, cycle.month, { draftDays, buildDays, holidays });

  const updated = await prisma.newsletterCycle.update({
    where: { id: cycle.id },
    data: {
      draftOpen: planned.draftOpen,
      draftDue: planned.draftDue,
      buildStart: planned.buildStart,
      approvalDue: planned.approvalDue,
      sendDate: planned.sendDate,
      sendDateAdjusted: false,
      configSnapshot: { ...snap, draftDays, buildDays, holidays, manual: true } as unknown as object,
    },
  });

  for (const r of planReminders(planned)) {
    await prisma.newsletterReminder.updateMany({
      where: { cycleId: cycle.id, kind: r.kind, status: "pending" },
      data: { scheduledFor: r.scheduledFor },
    });
  }

  return updated;
}

const clampWindow = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
