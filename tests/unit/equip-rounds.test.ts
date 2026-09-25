/** Which funding round an application landed in. */
import test from "node:test";
import assert from "node:assert/strict";
import { roundFor, type DeadlineLike } from "../../src/lib/equip/rounds";

const DEADLINES: DeadlineLike[] = [
  { stream: "venture_connect", deadlineAt: "2026-08-27T16:00:00.000Z", cycleLabel: "August 2026" },
  { stream: "venture_connect", deadlineAt: "2026-09-24T16:00:00.000Z", cycleLabel: "September 2026" },
  { stream: "venture_connect", deadlineAt: "2026-10-26T16:00:00.000Z", cycleLabel: "October 2026" },
  { stream: "venture_lift", deadlineAt: "2026-08-01T16:00:00.000Z", cycleLabel: "Round 6 · Pre-screening deadline" },
  { stream: "venture_lift", deadlineAt: "2026-09-05T16:00:00.000Z", cycleLabel: "Round 6 · Full application deadline" },
  { stream: "venture_lift", deadlineAt: "2026-10-05T16:00:00.000Z", cycleLabel: "Round 7 · Pre-screening deadline" },
];

test("an application belongs to the first window still open when it was filed", () => {
  assert.equal(roundFor("venture_connect", "2026-09-02T20:13:24Z", DEADLINES)?.label, "September 2026");
  assert.equal(roundFor("venture_connect", "2026-09-24T00:45:40Z", DEADLINES)?.label, "September 2026");
  // Hours after that deadline passed — it is the next round's problem.
  assert.equal(roundFor("venture_connect", "2026-09-24T18:00:00Z", DEADLINES)?.label, "October 2026");
});

test("VentureLift's two windows are one round", () => {
  const pre = roundFor("venture_lift", "2026-07-30T12:00:00Z", DEADLINES);
  const full = roundFor("venture_lift", "2026-08-20T12:00:00Z", DEADLINES);
  assert.equal(pre?.label, "Round 6");
  assert.equal(full?.label, "Round 6");
  assert.equal(full?.number, 6);
});

test("a number is read from the label, never counted from the rows", () => {
  // VentureConnect's months carry no number, and inventing one would
  // say "first round ever" about whichever month was entered first.
  assert.equal(roundFor("venture_connect", "2026-09-02T20:13:24Z", DEADLINES)?.number, null);
});

test("the streams do not borrow each other's rounds", () => {
  assert.equal(roundFor("venture_lift", "2026-09-02T20:13:24Z", DEADLINES)?.label, "Round 6");
  assert.equal(roundFor("innovation_fellowship", "2026-09-02T20:13:24Z", DEADLINES), null);
});

test("nothing is claimed about a draft, or about a submission past the last window", () => {
  assert.equal(roundFor("venture_connect", null, DEADLINES), null);
  assert.equal(roundFor("venture_connect", "2027-01-01T00:00:00Z", DEADLINES), null);
});

test("a window with no label falls back to its date", () => {
  const rows: DeadlineLike[] = [{ stream: "venture_connect", deadlineAt: "2026-10-26T16:00:00.000Z", cycleLabel: null }];
  assert.equal(roundFor("venture_connect", "2026-10-01T00:00:00Z", rows)?.label, "Oct 26, 2026");
});
