/** The website's version of the schedule: same sessions, placed like the registration calendar, no lunch. */
import test from "node:test";
import assert from "node:assert/strict";
import { SESSIONS } from "../../src/lib/training-week/schedule-2026";
import { webSchedule } from "../../src/lib/training-week/web-schedule";

test("every session, with the website's words and a position", () => {
  const w = webSchedule("website");
  assert.equal(w.sessions.length, SESSIONS.length);
  assert.deepEqual(w.hours, { from: "09:00", to: "17:00" });
  const mon = w.days.find((d) => d.date === "2026-10-26")!;
  assert.equal(mon.lanes, 2);
  const tour = w.sessions.find((s) => s.slug === "catalent-tour-lunch-learn-2026")!;
  assert.equal(tour.anchor, "company-tour");
  assert.equal(tour.host, "Microbix Biosystems");
  assert.equal(tour.offsetMinutes, 30);
  assert.equal(tour.durationMinutes, 360);
  assert.equal(tour.time12, "9:30 AM–3:30 PM");
  assert.match(tour.detailsHtml!, /bus from the U of T downtown/);
  // Two Monday sessions overlap, so they sit in different lanes.
  const cl3 = w.sessions.find((s) => s.slug === "cl3-workshop-2026")!;
  assert.notEqual(cl3.lane, tour.lane);
  assert.equal(w.sessions.find((s) => s.slug === "ccrm-tour-lunch-learn-2026")!.webTitle, "Discovery to Delivery");
});

test("lunch only in the registration version", () => {
  assert.ok(webSchedule("website").sessions.every((s) => !("breaks" in s)));
  assert.ok(webSchedule("registration").sessions.every((s) => Array.isArray((s as { breaks?: unknown }).breaks)));
});
