import test from "node:test";
import assert from "node:assert/strict";
import {
  DECISIONS, DECISION_LABEL, describe as describeChange, isDecision, letterFor,
  takesAQueueSpot, takesASeat,
} from "../../src/lib/allocation/decisions";

test("every decision has a label somebody could read on a button", () => {
  for (const d of DECISIONS) {
    assert.ok(DECISION_LABEL[d]?.length > 2, `${d} has no label`);
  }
});

test("only the four real decisions are accepted", () => {
  for (const d of DECISIONS) assert.ok(isDecision(d));
  for (const junk of ["approved", "", "PENDING", null, 7, {}]) assert.ok(!isDecision(junk));
});

test("approving, waitlisting and declining each send a letter", () => {
  assert.equal(letterFor("pending", "confirmed"), "approved");
  assert.equal(letterFor("pending", "waitlist"), "waitlisted");
  assert.equal(letterFor("pending", "cancelled"), "session_declined");
});

test("clicking the same decision twice sends nothing", () => {
  // It is a click, not news.
  for (const d of DECISIONS) assert.equal(letterFor(d, d), null);
});

test("taking a decision back to undecided sends nothing", () => {
  // "Your place is now undecided" is worse than silence. The next real
  // decision is what they should hear about.
  for (const from of DECISIONS) assert.equal(letterFor(from, "pending"), null);
});

test("a REVERSAL still writes to them", () => {
  // Somebody told they had a place and then moved to the waitlist has
  // to hear it from us rather than notice.
  assert.equal(letterFor("confirmed", "waitlist"), "waitlisted");
  assert.equal(letterFor("confirmed", "cancelled"), "session_declined");
  assert.equal(letterFor("cancelled", "confirmed"), "approved");
  assert.equal(letterFor("waitlist", "confirmed"), "approved");
});

test("a reversal is described as one, because that is what gets asked about", () => {
  assert.match(describeChange("confirmed", "cancelled"), /changed from approved to declined/i);
  assert.match(describeChange("pending", "confirmed"), /approved/i);
  assert.match(describeChange("confirmed", "pending"), /taken back to undecided/i);
  assert.match(describeChange("confirmed", "confirmed"), /left as/i);
});

test("only an approval takes a seat, and only a waitlist takes a queue spot", () => {
  // Capacity is counted off these two, so a wrong answer here
  // over- or under-fills a room.
  assert.deepEqual(DECISIONS.filter(takesASeat), ["confirmed"]);
  assert.deepEqual(DECISIONS.filter(takesAQueueSpot), ["waitlist"]);
});
