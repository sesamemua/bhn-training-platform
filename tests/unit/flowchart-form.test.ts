import assert from "node:assert/strict";
import test from "node:test";
import {
  missingRequired,
  orderedFields,
  reachable,
  suggestKey,
  testCondition,
  visibleFields,
  type Answers,
} from "../../src/lib/flowchart/form";
import type { ChartDoc } from "../../src/lib/flowchart/types";

const q = (id: string, key: string, extra: object = {}) => ({
  id, x: 0, y: 0, w: 190, h: 58, kind: "question" as const, text: key,
  field: { key, type: "text" as const, ...extra },
});

const DOC: ChartDoc = {
  nodes: [
    { id: "s", x: 0, y: 0, w: 190, h: 52, kind: "start", text: "Start" },
    q("a", "role"),
    q("b", "company", { required: true }),
    q("c", "student_id"),
    { id: "e", x: 0, y: 0, w: 190, h: 52, kind: "end", text: "Done" },
  ],
  edges: [
    { id: "1", from: "s", to: "a" },
    { id: "2", from: "a", to: "b", when: { field: "role", op: "is", value: "Industry" } },
    { id: "3", from: "a", to: "c", when: { field: "role", op: "is", value: "Student" } },
    { id: "4", from: "b", to: "e" },
    { id: "5", from: "c", to: "e" },
  ],
};

test("conditions evaluate the way the labels read", () => {
  const A: Answers = { role: "Student", tags: ["x", "y"] };
  assert.equal(testCondition({ field: "role", op: "is", value: "Student" }, A), true);
  assert.equal(testCondition({ field: "role", op: "is", value: "student" }, A), true, "case-insensitive");
  assert.equal(testCondition({ field: "role", op: "is", value: "Industry" }, A), false);
  assert.equal(testCondition({ field: "role", op: "is not", value: "Industry" }, A), true);
  assert.equal(testCondition({ field: "tags", op: "any of", value: "y, z" }, A), true);
  assert.equal(testCondition({ field: "tags", op: "any of", value: "z" }, A), false);
  assert.equal(testCondition({ field: "role", op: "answered" }, A), true);
  assert.equal(testCondition({ field: "nope", op: "answered" }, A), false);
  assert.equal(testCondition({ field: "nope", op: "empty" }, A), true);
});

test("an unanswered branch shows neither side", () => {
  const shown = visibleFields(DOC, {}).map((f) => f.key);
  assert.deepEqual(shown, ["role"]);
});

test("answering the branch reveals exactly one arm", () => {
  assert.deepEqual(visibleFields(DOC, { role: "Student" }).map((f) => f.key), ["role", "student_id"]);
  assert.deepEqual(visibleFields(DOC, { role: "Industry" }).map((f) => f.key), ["role", "company"]);
});

test("changing the answer hides the other arm again", () => {
  const first = visibleFields(DOC, { role: "Industry", company: "Acme" }).map((f) => f.key);
  assert.ok(first.includes("company"));
  const after = visibleFields(DOC, { role: "Student", company: "Acme" }).map((f) => f.key);
  assert.ok(!after.includes("company"), "a stale answer must not keep a hidden field alive");
});

test("required only counts while the field is actually shown", () => {
  // company is required, but on the student branch it is not asked at all.
  assert.deepEqual(missingRequired(DOC, { role: "Student" }).map((f) => f.key), []);
  assert.deepEqual(missingRequired(DOC, { role: "Industry" }).map((f) => f.key), ["company"]);
  assert.deepEqual(missingRequired(DOC, { role: "Industry", company: "Acme" }), []);
});

test("field order follows the arrows, not the array", () => {
  const doc: ChartDoc = {
    nodes: [q("z", "third"), q("x", "first"), q("y", "second"),
      { id: "s", x: 0, y: 0, w: 100, h: 40, kind: "start", text: "S" }],
    edges: [
      { id: "1", from: "s", to: "x" },
      { id: "2", from: "x", to: "y" },
      { id: "3", from: "y", to: "z" },
    ],
  };
  assert.deepEqual(orderedFields(doc).map((f) => f.key), ["first", "second", "third"]);
});

test("orphan questions still appear, in visual order", () => {
  const doc: ChartDoc = {
    nodes: [
      { ...q("b", "lower"), y: 300 },
      { ...q("a", "upper"), y: 100 },
    ],
    edges: [],
  };
  // Nothing is connected, so nothing is hidden — a half-drawn chart must
  // not look like it lost its fields.
  assert.deepEqual(visibleFields(doc, {}).map((f) => f.key), ["upper", "lower"]);
});

test("reachability starts from a start node and from any orphan", () => {
  const live = reachable(DOC, { role: "Student" });
  assert.ok(live.has("a") && live.has("c") && live.has("e"));
  assert.ok(!live.has("b"));
});

test("a cycle terminates instead of hanging", () => {
  const doc: ChartDoc = {
    nodes: [q("a", "one"), q("b", "two")],
    edges: [
      { id: "1", from: "a", to: "b" },
      { id: "2", from: "b", to: "a" },
    ],
  };
  assert.equal(reachable(doc, {}).size, 2);
});

test("suggested keys are unique and slug-like", () => {
  assert.equal(suggestKey("What is your role?", []), "what_is_your_role");
  assert.equal(suggestKey("Role", ["role"]), "role_2");
  assert.equal(suggestKey("!!!", []), "field");
});
