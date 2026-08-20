import assert from "node:assert/strict";
import test from "node:test";
import { limitState, limitsFor, visibleFields } from "../../src/lib/flowchart/form";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import { MAX_SESSIONS, optionLabel, SESSIONS as WEEK } from "../../src/lib/training-week/schedule-2026";
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

const option = (slug: string) => optionLabel(WEEK.find((w) => w.slug === slug)!);

test("the seeded Training Week chart carries the schedule's cap and clashes", () => {
  const st = limitState(TRAINING_WEEK_FLOW, "sessions", []);
  assert.equal(st.max, MAX_SESSIONS);

  const tuesday = [option("communication-chameleon-2026"), option("negotiation-skills-2026")];
  assert.equal(
    limitState(TRAINING_WEEK_FLOW, "sessions", tuesday).clashes.length, 1,
    "the two Tuesday afternoon workshops should clash",
  );

  // The regression this whole change exists to prevent. The two Monday
  // company tours run back to back — 11:00-13:30 then 14:00-16:30 — so
  // picking both must produce NO warning. The chart used to say it did.
  const tours = [option("ccrm-tour-lunch-learn-2026"), option("catalent-tour-lunch-learn-2026")];
  assert.deepEqual(
    limitState(TRAINING_WEEK_FLOW, "sessions", tours).clashes, [],
    "the Monday tours are consecutive, not concurrent",
  );

  // CL3 runs the whole day, so it does clash with each tour separately.
  const cl3 = option("cl3-workshop-2026");
  assert.equal(limitState(TRAINING_WEEK_FLOW, "sessions", [cl3, tours[0]]).clashes.length, 1);
  assert.equal(limitState(TRAINING_WEEK_FLOW, "sessions", [cl3, tours[1]]).clashes.length, 1);

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
