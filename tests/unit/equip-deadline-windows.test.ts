import test from "node:test";
import assert from "node:assert/strict";
import { isOpenForSubmissions, SUBMITTABLE_STATUSES } from "../../src/lib/equip/deadlines";
import { venturConnectMonthlyDeadlines } from "../../src/lib/equip/calendar";

const NOW = new Date("2026-09-22T16:00:00.000Z"); // 22 Sep, noon in Toronto
const row = (status: string, date: string) => ({ status, deadlineAt: new Date(date) });

test("a published round that has not passed is the window, whatever the sync last stamped on it", () => {
  // The rollover used to wait for an admin to load the deadlines page:
  // the day September closed, October was still "scheduled" and the
  // next applicant was told there was no open window at all.
  assert.equal(isOpenForSubmissions(row("scheduled", "2026-10-26T16:00:00.000Z"), NOW), true);
  assert.equal(isOpenForSubmissions(row("open", "2026-09-24T16:00:00.000Z"), NOW), true);
  assert.equal(isOpenForSubmissions(row("extended", "2026-09-30T16:00:00.000Z"), NOW), true);
  assert.deepEqual([...SUBMITTABLE_STATUSES], ["open", "extended", "scheduled"]);
});

test("closed is the one word that stops it, and a date that has passed stops it too", () => {
  assert.equal(isOpenForSubmissions(row("closed", "2026-10-26T16:00:00.000Z"), NOW), false, "an admin closed it on purpose");
  assert.equal(isOpenForSubmissions(row("open", "2026-09-21T16:00:00.000Z"), NOW), false, "the deadline has gone");
});

test("VentureConnect's October round closes on the 26th, at noon in Toronto", () => {
  const october = venturConnectMonthlyDeadlines().find((d) => d.cycleLabel === "October 2026")!;
  assert.ok(october, "October 2026 is not in the published schedule");
  assert.equal(october.deadlineAt.toISOString(), "2026-10-26T16:00:00.000Z"); // 12:00 EDT
  // It opens on the first of the month, so the moment September closes
  // it is the next window rather than a gap nobody can apply in.
  assert.equal(october.opensAt.toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(october.stream, "venture_connect");
});
