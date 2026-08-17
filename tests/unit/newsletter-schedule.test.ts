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
