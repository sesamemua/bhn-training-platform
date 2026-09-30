/** Filming sign-ups: camera time may not touch a locked task's camera time; preparation may overlap anything. */
import test from "node:test";
import assert from "node:assert/strict";
import { SignupSchema, isFree, offers, takenSpans } from "../../src/lib/video/signup";

// Darius, locked: 11:00–12:00 with 30 min prep → camera 11:30–12:00 (Toronto, EDT = UTC-4).
const darius = { start: "2026-10-06T15:00:00Z", end: "2026-10-06T16:00:00Z", prepMinutes: 30, locked: true, title: "Interview — Darius" };
const yoojin = { start: "2026-10-06T16:30:00Z", end: "2026-10-06T17:30:00Z", prepMinutes: 30, locked: false };

test("only locked tasks' camera time is taken; titles only when given", () => {
  assert.deepEqual(takenSpans([darius, yoojin]), [{ s: 690, e: 720, label: "Interview — Darius" }]);
  const { title: _t, ...anon } = darius;
  assert.deepEqual(takenSpans([anon]), [{ s: 690, e: 720 }]);
});

test("a 60-minute slot with 30 of prep", () => {
  const taken = [{ s: 690, e: 720 }];
  assert.ok(!isFree(660, 60, 30, taken), "camera 11:30–12:00 clashes");
  assert.ok(isFree(630, 60, 30, taken), "camera 11:00–11:30 ends as Darius's camera starts");
  assert.ok(isFree(690, 60, 30, taken), "prep 11:30–12:00 overlaps Darius's camera time — allowed");
  assert.ok(!isFree(675, 60, 30, taken));
});

test("start times every 15 minutes inside the window", () => {
  const o = offers({ from: "09:00", to: "12:00", slot: 60, prep: 30, taken: [{ s: 690, e: 720 }] });
  assert.equal(o[0].start, 540);
  assert.equal(o[o.length - 1].start, 660, "the last slot ends at 12:00");
  assert.deepEqual(o.filter((x) => !x.ok).map((x) => x.start), [645, 660]);
});

test("the form needs a name, a real email and a parking answer", () => {
  assert.ok(SignupSchema.safeParse({ name: "Ana Li", email: "Ana@Example.ca ", start: 600, parking: false }).success);
  assert.equal(SignupSchema.parse({ name: "Ana Li", email: "Ana@Example.ca", start: 600, parking: true }).email, "ana@example.ca");
  assert.ok(!SignupSchema.safeParse({ name: "A", email: "x", start: 600, parking: false }).success);
  assert.ok(!SignupSchema.safeParse({ name: "Ana", email: "a@b.ca", start: 600 }).success);
});
