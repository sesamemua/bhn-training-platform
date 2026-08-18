import assert from "node:assert/strict";
import test from "node:test";
import { limitState, limitsFor, visibleFields } from "../../src/lib/flowchart/form";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { ChartDoc } from "../../src/lib/flowchart/types";

const SESSIONS = ["A", "B", "C", "D"];

const doc: ChartDoc = {
  nodes: [
    { id: "q", kind: "question", x: 0, y: 0, w: 190, h: 60, text: "Pick sessions",
      field: { key: "sessions", type: "multi", options: SESSIONS } },
    { id: "r", kind: "rule", x: 300, y: 0, w: 190, h: 60, text: "Up to 2",
      limit: { field: "sessions", max: 2, clashes: [{ label: "Tue 1 PM", options: ["B", "C"] }] } },
  ],
  edges: [{ id: "e", from: "q", to: "r" }],
};

test("a limit box is found by the question it governs", () => {
  assert.equal(limitsFor(doc, "sessions").length, 1);
  assert.equal(limitsFor(doc, "something_else").length, 0);
});

test("the cap is reported and reached exactly at the limit", () => {
  assert.equal(limitState(doc, "sessions", []).atCap, false);
  assert.equal(limitState(doc, "sessions", ["A"]).atCap, false);
  assert.equal(limitState(doc, "sessions", ["A", "B"]).atCap, true);
  assert.equal(limitState(doc, "sessions", ["A", "B"]).max, 2);
});

test("one pick from a clashing set is fine; two is a warning", () => {
  assert.deepEqual(limitState(doc, "sessions", ["B"]).clashes, []);
  const two = limitState(doc, "sessions", ["B", "C"]).clashes;
  assert.equal(two.length, 1);
  assert.equal(two[0].label, "Tue 1 PM");
  assert.deepEqual(two[0].picked, ["B", "C"]);
});

test("a clash is a warning, not a cap — it does not block on its own", () => {
  // Both clashing options ticked, still under the cap of 2.
  const st = limitState(doc, "sessions", ["B", "C"]);
  assert.equal(st.clashes.length, 1);
  assert.equal(st.atCap, true, "at the cap because two are picked, not because they clash");

  const loose: ChartDoc = {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === "r" ? { ...n, limit: { ...n.limit!, max: undefined } } : n)),
  };
  const st2 = limitState(loose, "sessions", ["B", "C"]);
  assert.equal(st2.max, null);
  assert.equal(st2.atCap, false, "an uncapped question never blocks");
  assert.equal(st2.clashes.length, 1, "but the clash is still reported");
});

test("two limit boxes on one question take the tighter cap", () => {
  const both: ChartDoc = {
    ...doc,
    nodes: [...doc.nodes, {
      id: "r2", kind: "rule", x: 300, y: 200, w: 190, h: 60, text: "Up to 1",
      limit: { field: "sessions", max: 1 },
    }],
  };
  assert.equal(limitState(both, "sessions", []).max, 1);
});

test("a question with no limit box is unconstrained", () => {
  const bare: ChartDoc = { nodes: [doc.nodes[0]], edges: [] };
  const st = limitState(bare, "sessions", ["A", "B", "C", "D"]);
  assert.equal(st.max, null);
  assert.equal(st.atCap, false);
  assert.deepEqual(st.clashes, []);
});

test("the limit box adds no field to the form", () => {
  // A rule is a constraint, not a question — it must not appear as an input.
  const keys = visibleFields(doc, {}).map((f) => f.key);
  assert.deepEqual(keys, ["sessions"]);
});

test("the seeded Training Week chart caps sessions at 3 and flags the Tuesday pair", () => {
  const st = limitState(TRAINING_WEEK_FLOW, "sessions", []);
  assert.equal(st.max, 3);

  const tuesday = [
    "Tue 27 · Communication Chameleon (1 PM)",
    "Tue 27 · Negotiation Skills (1 PM)",
  ];
  const clashed = limitState(TRAINING_WEEK_FLOW, "sessions", tuesday).clashes;
  assert.equal(clashed.length, 1, "the two Tuesday 1 PM workshops should clash");

  // Every option named in a clash must actually exist on the question.
  const q = TRAINING_WEEK_FLOW.nodes.find((n) => n.field?.key === "sessions");
  const options = q?.field?.options ?? [];
  for (const l of limitsFor(TRAINING_WEEK_FLOW, "sessions")) {
    for (const c of l.clashes ?? []) {
      for (const o of c.options) {
        assert.ok(options.includes(o), `clash names "${o}", which is not a session option`);
      }
    }
  }
});

test("lowering the cap below an existing answer reports being over, not at, the cap", () => {
  const st = limitState(doc, "sessions", ["A", "B", "C"]); // cap is 2
  assert.equal(st.atCap, true);
  assert.equal(st.over, true);

  const exact = limitState(doc, "sessions", ["A", "B"]);
  assert.equal(exact.atCap, true);
  assert.equal(exact.over, false, "exactly at the cap is not over it");
});
