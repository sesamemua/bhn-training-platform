import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSwitch, publicNotice, REGISTRATION_STATES, serialiseSwitch, STATE_COPY,
} from "../../src/lib/registration/state";

test("the switch has three positions, each with words for what it does", () => {
  assert.deepEqual([...REGISTRATION_STATES], ["open", "paused", "closed"]);
  for (const s of REGISTRATION_STATES) {
    assert.ok(STATE_COPY[s].label.length > 0, `${s} has no label`);
    assert.ok(STATE_COPY[s].gist.length > 20, `${s} does not say what it does`);
  }
});

test("a stored position round-trips, who moved it and when included", () => {
  const moved = { state: "paused" as const, at: "2026-09-22T21:01:00.000Z", by: "Alison" };
  assert.deepEqual(parseSwitch(serialiseSwitch(moved), "open"), moved);
});

test("nothing stored means the forms are the answer, not a default", () => {
  // The first read happens before anybody has pressed anything, and the
  // card must not offer to open a form that is already open.
  assert.deepEqual(parseSwitch(null, "open"), { state: "open", at: null, by: null });
  assert.deepEqual(parseSwitch(undefined, "closed"), { state: "closed", at: null, by: null });
});

test("a row somebody edited by hand does not close registration", () => {
  // Falling back to "closed" on a parse error would turn a typo in a
  // settings row into a shut form nobody could explain.
  assert.equal(parseSwitch("{not json", "open").state, "open");
  assert.equal(parseSwitch(JSON.stringify({ state: "ajar" }), "open").state, "open");
  assert.equal(parseSwitch(JSON.stringify({ state: 3 }), "paused").state, "paused");
  // …and the fields it cannot read come back null rather than undefined.
  assert.deepEqual(parseSwitch(JSON.stringify({ state: "closed", at: 5, by: {} }), "open"), {
    state: "closed", at: null, by: null,
  });
});

test("paused promises to come back; closed does not; open says nothing at all", () => {
  assert.equal(publicNotice("open"), null, "an open form's answer is its questions");

  const paused = publicNotice("paused")!;
  assert.match(paused.title, /paused/i);
  assert.match(paused.body, /reopen/i);

  const closed = publicNotice("closed")!;
  assert.match(closed.title, /closed/i);
  assert.doesNotMatch(closed.body, /reopen|come back/i, "a promise nobody meant is worse than a plain closed");
  // Both leave a way to reach a human.
  for (const notice of [paused, closed]) assert.match(notice.body, /BioHubNet team/);
});
