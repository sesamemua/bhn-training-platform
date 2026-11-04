import test from "node:test";
import assert from "node:assert/strict";
import { suggestVcDeadline, suggestVcRounds, vcLaunchDate, vcRoundMeta } from "../../src/lib/equip/calendar";

test("VC rounds launch on the first Tuesday of the month", () => {
  assert.equal(vcLaunchDate("2027-01-25"), "2027-01-05");
  assert.equal(vcLaunchDate("2026-09-24"), "2026-09-01"); // the 1st is itself a Tuesday
  assert.equal(vcLaunchDate("2027-06-28"), "2027-06-01");
});

test("suggested VC deadline: last Monday, the Monday before when it is the 30th/31st, never a statutory holiday", () => {
  assert.equal(suggestVcDeadline(2027, 4), "2027-04-26");
  assert.equal(suggestVcDeadline(2026, 8), "2026-08-24"); // Aug 31 → Aug 24
  assert.equal(suggestVcDeadline(2027, 5), "2027-05-21"); // May 24 is Victoria Day → Fri May 21
  assert.equal(suggestVcDeadline(2026, 12), "2026-12-28"); // the December break still takes deadlines
});

test("suggestions continue monthly after the latest deadline with round numbers and labels", () => {
  const next = suggestVcRounds(["2026-12-28", "2027-05-24", "2027-01-25"], 2);
  assert.deepEqual(next.map((r) => [r.deadline, r.round, r.cycleLabel]), [["2027-06-28", 27, "June 2027"], ["2027-07-26", 28, "July 2027"]]);
  assert.equal(vcRoundMeta("2027-01-25").note, "Round 22 · January 2027 VC deadline");
  assert.equal(vcRoundMeta("2026-05-25").round, null);
});
