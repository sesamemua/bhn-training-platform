import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCHEDULE,
  addBusinessDays,
  describeCycle,
  isBusinessDay,
  isIsoDate,
  nthWeekdayOfMonth,
  planCycle,
  planMonths,
  planReminders,
  weekdayOf,
  type ScheduleConfig,
} from "../../src/lib/newsletter/schedule";

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

test("nth weekday of a month", () => {
  // August 2026: 1st is a Saturday, so Wednesdays are 5, 12, 19, 26.
  assert.equal(nthWeekdayOfMonth(2026, 8, WED, 1), "2026-08-05");
  assert.equal(nthWeekdayOfMonth(2026, 8, WED, 3), "2026-08-19");
  // A 5th occurrence that doesn't exist clamps to the last one rather
  // than spilling into September.
  assert.equal(nthWeekdayOfMonth(2026, 8, WED, 5), "2026-08-26");
  // February in a non-leap year, first day a Sunday.
  assert.equal(nthWeekdayOfMonth(2026, 2, TUE, 3), "2026-02-17");
});

test("the third send-weekday always lands in the third week (15th-21st)", () => {
  for (let year = 2026; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) {
      for (const wd of [TUE, WED, THU] as const) {
        const day = Number(nthWeekdayOfMonth(year, month, wd, 3).slice(8));
        assert.ok(
          day >= 15 && day <= 21,
          `${year}-${month} weekday ${wd} landed on day ${day}`,
        );
      }
    }
  }
});

test("business days skip weekends and holidays", () => {
  assert.equal(isBusinessDay("2026-08-14"), true);  // Friday
  assert.equal(isBusinessDay("2026-08-15"), false); // Saturday
  assert.equal(isBusinessDay("2026-08-16"), false); // Sunday
  assert.equal(isBusinessDay("2026-08-17"), true);  // Monday
  assert.equal(isBusinessDay("2026-08-17", ["2026-08-17"]), false); // holiday
});

test("business-day arithmetic walks over weekends in both directions", () => {
  // Friday + 1 business day = Monday
  assert.equal(addBusinessDays("2026-08-14", 1), "2026-08-17");
  // Monday - 1 business day = Friday
  assert.equal(addBusinessDays("2026-08-17", -1), "2026-08-14");
  // Wednesday - 4 business days = previous Thursday
  assert.equal(addBusinessDays("2026-08-19", -4), "2026-08-13");
  // A holiday in the path pushes one extra day out.
  assert.equal(addBusinessDays("2026-08-14", 1, ["2026-08-17"]), "2026-08-18");
  assert.equal(addBusinessDays("2026-08-19", 0), "2026-08-19");
});

test("a default cycle gives two writing days and two build days", () => {
  const c = planCycle(2026, 8);
  assert.equal(c.sendDate, "2026-08-19");   // third Wednesday
  assert.equal(c.approvalDue, "2026-08-18"); // Tuesday
  assert.equal(c.buildStart, "2026-08-17");  // Monday
  assert.equal(c.draftDue, "2026-08-14");    // Friday
  assert.equal(c.draftOpen, "2026-08-13");   // Thursday
  assert.equal(c.sendDateAdjusted, false);
  assert.equal(c.month, "2026-08-01");
});

test("the send date is never a Monday or a Friday, for years of months", () => {
  for (const wd of [TUE, WED, THU] as const) {
    const config: ScheduleConfig = { ...DEFAULT_SCHEDULE, sendWeekday: wd };
    for (let year = 2026; year <= 2030; year++) {
      for (let month = 1; month <= 12; month++) {
        const c = planCycle(year, month, config);
        const day = weekdayOf(c.sendDate);
        assert.notEqual(day, MON, `${c.sendDate} is a Monday`);
        assert.notEqual(day, FRI, `${c.sendDate} is a Friday`);
        assert.ok(day >= TUE && day <= THU, `${c.sendDate} is weekday ${day}`);
      }
    }
  }
});

test("every planned date is a working day and strictly ordered", () => {
  for (let year = 2026; year <= 2029; year++) {
    for (let month = 1; month <= 12; month++) {
      const c = planCycle(year, month);
      const order = [c.draftOpen, c.draftDue, c.buildStart, c.approvalDue, c.sendDate];
      for (const d of order) {
        assert.ok(isIsoDate(d), `${d} is not a valid date`);
        assert.ok(isBusinessDay(d), `${d} is not a business day`);
      }
      for (let i = 1; i < order.length; i++) {
        assert.ok(order[i] > order[i - 1], `${order[i - 1]} → ${order[i]} out of order`);
      }
    }
  }
});

test("a holiday on the send day slips the issue within the same week", () => {
  // Third Wednesday of Aug 2026 is the 19th; block it.
  const c = planCycle(2026, 8, { ...DEFAULT_SCHEDULE, holidays: ["2026-08-19"] });
  assert.equal(c.sendDate, "2026-08-20"); // Thursday, still the third week
  assert.equal(c.sendDateAdjusted, true);
  assert.notEqual(weekdayOf(c.sendDate), FRI);
});

test("a holiday inside the run-up stretches the window, not the send date", () => {
  // Block the Monday build day; send stays on the third Wednesday and the
  // earlier milestones each shift back a working day.
  const c = planCycle(2026, 8, { ...DEFAULT_SCHEDULE, holidays: ["2026-08-17"] });
  assert.equal(c.sendDate, "2026-08-19");
  assert.equal(c.approvalDue, "2026-08-18");
  assert.equal(c.buildStart, "2026-08-14"); // Monday blocked → Friday
  assert.equal(c.draftDue, "2026-08-13");
  assert.equal(c.draftOpen, "2026-08-12");
});

test("window lengths follow the config", () => {
  const wide = planCycle(2026, 8, { ...DEFAULT_SCHEDULE, draftDays: 3, buildDays: 3 });
  assert.equal(wide.sendDate, "2026-08-19");
  assert.equal(wide.buildStart, "2026-08-14"); // 3 build days: Fri, Mon, Tue
  assert.equal(wide.draftDue, "2026-08-13");
  assert.equal(wide.draftOpen, "2026-08-11"); // 3 writing days: Tue, Wed, Thu
});

test("planning N months is contiguous and never repeats a month", () => {
  const months = planMonths(2026, 11, 5); // Nov 2026 → Mar 2027, crossing the year
  assert.equal(months.length, 5);
  assert.deepEqual(
    months.map((m) => m.month),
    ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"],
  );
  for (let i = 1; i < months.length; i++) {
    assert.ok(months[i].sendDate > months[i - 1].sendDate, "send dates must advance");
  }
});

test("each cycle schedules exactly the four reminders, on its own dates", () => {
  const c = planCycle(2026, 8);
  const r = planReminders(c);
  assert.deepEqual(
    r.map((x) => x.kind),
    ["draft_request", "draft_due", "approval", "send_day"],
  );
  assert.equal(r[0].scheduledFor, c.draftOpen);
  assert.equal(r[1].scheduledFor, c.draftDue);
  assert.equal(r[2].scheduledFor, c.approvalDue);
  assert.equal(r[3].scheduledFor, c.sendDate);
  // Reminders fire in the same order as the cycle runs.
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].scheduledFor >= r[i - 1].scheduledFor);
  }
});

test("describeCycle names the weekdays a human would check", () => {
  const s = describeCycle(planCycle(2026, 8));
  assert.match(s, /Drafts Thursday 13–Friday 14/);
  assert.match(s, /Build Monday 17–Tuesday 18/);
  assert.match(s, /Send Wednesday 19/);
});

test("isIsoDate rejects impossible dates", () => {
  assert.equal(isIsoDate("2026-08-19"), true);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("19-08-2026"), false);
  assert.equal(isIsoDate(""), false);
});

// ── drag arithmetic ──────────────────────────────────────────────────

test("snapping finds the nearest legal send day, never a Monday or Friday", async () => {
  const { snapToSendDay } = await import("../../src/lib/newsletter/schedule");
  // Fri 21 Aug 2026 → nearest legal is Thu 20 (one day back) not Tue 25.
  assert.equal(snapToSendDay("2026-08-21"), "2026-08-20");
  // Sat 22 → Tue 25 forward is 3 away, Thu 20 back is 2 → Thu wins.
  assert.equal(snapToSendDay("2026-08-22"), "2026-08-20");
  // Mon 24 → Tue 25 forward is 1 away.
  assert.equal(snapToSendDay("2026-08-24"), "2026-08-25");
  // A legal day is left alone.
  assert.equal(snapToSendDay("2026-08-19"), "2026-08-19");
  // A holiday on an otherwise legal day is refused.
  assert.equal(snapToSendDay("2026-08-19", ["2026-08-19"]), "2026-08-20");
});

test("stepping always moves — the bug that made the arrow key look dead", async () => {
  const { stepSendDay, weekdayOf } = await import("../../src/lib/newsletter/schedule");
  // From Thursday, forward must reach the NEXT Tuesday, not snap back to
  // the same Thursday (which is what nearest-neighbour snapping does).
  assert.equal(stepSendDay("2026-08-20", 1), "2026-08-25");
  assert.equal(stepSendDay("2026-08-25", -1), "2026-08-20");
  assert.equal(stepSendDay("2026-08-19", 1), "2026-08-20");
  // Never lands on Mon/Fri, stepping either way across a whole year.
  let cur = "2026-01-06";
  for (let i = 0; i < 200; i++) {
    const next = stepSendDay(cur, 1);
    assert.notEqual(next, cur, "a step must always move");
    assert.ok([2, 3, 4].includes(weekdayOf(next)), `${next} is not Tue/Wed/Thu`);
    cur = next;
  }
});

test("planning from an explicit send date keeps the window shape", async () => {
  const { planFromSendDate, businessDaysBetween } = await import("../../src/lib/newsletter/schedule");
  const c = planFromSendDate("2026-08-25", "2026-08-01", { draftDays: 2, buildDays: 2, holidays: [] });
  assert.equal(c.sendDate, "2026-08-25");
  assert.equal(c.approvalDue, "2026-08-24");
  assert.equal(c.buildStart, "2026-08-21");
  assert.equal(c.draftDue, "2026-08-20");
  assert.equal(c.draftOpen, "2026-08-19");
  assert.equal(businessDaysBetween(c.draftOpen, c.draftDue), 2);
  assert.equal(businessDaysBetween(c.buildStart, c.approvalDue), 2);
});

test("a dragged window round-trips: derive, measure, re-derive", async () => {
  const { planFromSendDate, businessDaysBetween } = await import("../../src/lib/newsletter/schedule");
  for (const draftDays of [1, 2, 3, 5]) {
    for (const buildDays of [1, 2, 4]) {
      const c = planFromSendDate("2026-09-16", "2026-09-01", { draftDays, buildDays, holidays: [] });
      // Reading the rendered window back out must give the same numbers —
      // this is exactly what a drag on an edge does.
      assert.equal(businessDaysBetween(c.draftOpen, c.draftDue), draftDays);
      assert.equal(businessDaysBetween(c.buildStart, c.approvalDue), buildDays);
      assert.ok(c.draftOpen < c.draftDue || draftDays === 1);
      assert.ok(c.buildStart <= c.approvalDue);
    }
  }
});

test("daysOfMonth spans exactly the month, including leap February", async () => {
  const { daysOfMonth } = await import("../../src/lib/newsletter/schedule");
  assert.equal(daysOfMonth(2026, 2).length, 28);
  assert.equal(daysOfMonth(2028, 2).length, 29); // leap
  assert.equal(daysOfMonth(2026, 8).length, 31);
  assert.equal(daysOfMonth(2026, 8)[0], "2026-08-01");
  assert.equal(daysOfMonth(2026, 8)[30], "2026-08-31");
});
