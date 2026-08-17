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
import { planMonths, planReminders, type PlannedCycle, type ScheduleConfig } from "./schedule";
import type { NewsletterConfig } from "./config";

/** Cycles in these states are historical record, not plans. */
const FROZEN = ["approved", "sent"];

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
}): Promise<GenerateResult> {
  const startIso = `${opts.startYear}-${String(opts.startMonth).padStart(2, "0")}-01`;
  const schedule = effectiveSchedule(opts.config, startIso, opts.months);
  const planned = planMonths(opts.startYear, opts.startMonth, opts.months, schedule);

  const existing = await prisma.newsletterCycle.findMany({
    where: { month: { in: planned.map((p) => p.month) } },
    select: { id: true, month: true, status: true },
  });
  const byMonth = new Map(existing.map((c) => [c.month, c]));

  let created = 0;
  let updated = 0;
  let frozen = 0;

  for (const p of planned) {
    const hit = byMonth.get(p.month);
    if (hit && FROZEN.includes(hit.status)) {
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
    for (const r of planReminders(p)) {
      await prisma.newsletterReminder.upsert({
        where: { cycleId_kind: { cycleId: cycle.id, kind: r.kind } },
        create: {
          cycleId: cycle.id,
          kind: r.kind,
          scheduledFor: r.scheduledFor,
          mode: opts.config.modes[r.kind] ?? "manual",
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
