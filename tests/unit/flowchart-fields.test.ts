import test from "node:test";
import assert from "node:assert/strict";
import { moveBounds, moveFieldInForm } from "../../src/lib/flowchart/fields";
import { fieldsOf, orderedFields } from "../../src/lib/flowchart/form";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { ChartDoc } from "../../src/lib/flowchart/types";

const keys = (doc: ChartDoc) => orderedFields(doc).map((f) => f.key);
const posOf = (doc: ChartDoc, key: string) => {
  const f = orderedFields(doc).find((x) => x.key === key)!;
  return { nodeId: f.nodeId, index: f.index };
};

test("a question moves down within its step, and the form order changes", () => {
  // "Your affiliations" holds academic, health and company.
  const before = keys(TRAINING_WEEK_FLOW);
  const p = posOf(TRAINING_WEEK_FLOW, "academic");
  const after = keys(moveFieldInForm(TRAINING_WEEK_FLOW, p.nodeId, p.index, 1));
  assert.notDeepEqual(after, before);
  assert.equal(after.indexOf("academic"), before.indexOf("academic") + 1);
  assert.equal(after.indexOf("health"), before.indexOf("health") - 1);
});

test("moving down and back up again returns the original order", () => {
  const p = posOf(TRAINING_WEEK_FLOW, "academic");
  const down = moveFieldInForm(TRAINING_WEEK_FLOW, p.nodeId, p.index, 1);
  const q = posOf(down, "academic");
  const back = moveFieldInForm(down, q.nodeId, q.index, -1);
  assert.deepEqual(keys(back), keys(TRAINING_WEEK_FLOW));
});

test("no question is lost, duplicated or re-homed by a move", () => {
  const p = posOf(TRAINING_WEEK_FLOW, "dietary");
  const moved = moveFieldInForm(TRAINING_WEEK_FLOW, p.nodeId, p.index, 1);
  const after = keys(moved);
  assert.equal(after.length, keys(TRAINING_WEEK_FLOW).length);
  assert.equal(new Set(after).size, after.length);
  // Crucially it stays in its own step: a question that changes box
  // also changes its label, because a one-question box lends its text.
  assert.equal(posOf(moved, "dietary").nodeId, p.nodeId);
});

test("a question never crosses into the next step", () => {
  // "Contact" is first in "About you"; the question before it lives in
  // another box. Moving up must be refused, not silently re-homed.
  const p = posOf(TRAINING_WEEK_FLOW, "contact");
  assert.equal(p.index, 0);
  assert.equal(moveFieldInForm(TRAINING_WEEK_FLOW, p.nodeId, p.index, -1), TRAINING_WEEK_FLOW);
});

test("the ends of a step are no-ops, returned by identity", () => {
  const p = posOf(TRAINING_WEEK_FLOW, "academic"); // first of three
  assert.equal(moveFieldInForm(TRAINING_WEEK_FLOW, p.nodeId, p.index, -1), TRAINING_WEEK_FLOW);
  const q = posOf(TRAINING_WEEK_FLOW, "company"); // last of three
  assert.equal(moveFieldInForm(TRAINING_WEEK_FLOW, q.nodeId, q.index, 1), TRAINING_WEEK_FLOW);
});

test("every multi-question step offers a real move somewhere", () => {
  const multi = TRAINING_WEEK_FLOW.nodes.filter((n) => fieldsOf(n).length > 1);
  assert.ok(multi.length >= 4, "precondition: the chart groups its questions");
  for (const n of multi) {
    const bounds = fieldsOf(n).map((_, i) => moveBounds(TRAINING_WEEK_FLOW, n.id, i));
    assert.ok(bounds.some((b) => b.canMoveUp), `${n.text} has no question that can move up`);
    assert.ok(bounds.some((b) => b.canMoveDown), `${n.text} has no question that can move down`);
  }
});

test("a lone question explains itself rather than just going grey", () => {
  const p = posOf(TRAINING_WEEK_FLOW, "sessions"); // the only one in its box
  const b = moveBounds(TRAINING_WEEK_FLOW, p.nodeId, p.index);
  assert.equal(b.canMoveUp, false);
  assert.equal(b.canMoveDown, false);
  assert.match(b.upReason, /only question in this step/i);
});
