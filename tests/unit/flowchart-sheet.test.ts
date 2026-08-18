import assert from "node:assert/strict";
import test from "node:test";
import {
  addFieldTo, moveFieldToNode, moveFieldWithin, questionNodes, removeFieldAt, setFieldValue,
} from "../../src/lib/flowchart/sheet";
import { orderedFields } from "../../src/lib/flowchart/form";
import type { ChartDoc } from "../../src/lib/flowchart/types";

const doc: ChartDoc = {
  nodes: [
    { id: "a", kind: "question", x: 0, y: 0, w: 200, h: 60, text: "About you",
      fields: [
        { key: "name", type: "text", required: true },
        { key: "email", type: "email" },
        { key: "phone", type: "text" },
      ] },
    { id: "b", kind: "question", x: 0, y: 100, w: 200, h: 60, text: "Extras",
      field: { key: "diet", type: "text" } },
    { id: "r", kind: "rule", x: 300, y: 0, w: 200, h: 60, text: "Limit" },
  ],
  edges: [{ id: "e", from: "a", to: "b" }],
};

const keysOf = (d: ChartDoc, id: string) =>
  orderedFields(d).filter((f) => f.nodeId === id).map((f) => f.key);

test("editing a cell changes only that question", () => {
  const next = setFieldValue(doc, "a", 1, { key: "work_email", required: true });
  assert.deepEqual(keysOf(next, "a"), ["name", "work_email", "phone"]);
  assert.equal(orderedFields(next).find((f) => f.key === "work_email")?.field.required, true);
  // The original is untouched — the grid relies on this to undo cleanly.
  assert.deepEqual(keysOf(doc, "a"), ["name", "email", "phone"]);
});

test("removing a row drops one question and leaves the rest in order", () => {
  assert.deepEqual(keysOf(removeFieldAt(doc, "a", 0), "a"), ["email", "phone"]);
  assert.deepEqual(keysOf(removeFieldAt(doc, "a", 2), "a"), ["name", "email"]);
});

test("adding a row never collides with a key already in use", () => {
  let d = addFieldTo(doc, "b");
  assert.deepEqual(keysOf(d, "b"), ["diet", "answer"]);
  d = addFieldTo(d, "b");
  d = addFieldTo(d, "b");
  assert.deepEqual(keysOf(d, "b"), ["diet", "answer", "answer_2", "answer_3"]);

  // Including a key held by a DIFFERENT box.
  const clash = addFieldTo(doc, "b", "name");
  assert.deepEqual(keysOf(clash, "b"), ["diet", "name_2"]);
});

test("dragging a row reorders inside its own box", () => {
  assert.deepEqual(keysOf(moveFieldWithin(doc, "a", 0, 2), "a"), ["email", "phone", "name"]);
  assert.deepEqual(keysOf(moveFieldWithin(doc, "a", 2, 0), "a"), ["phone", "name", "email"]);
});

test("an out-of-range or no-op drag leaves the order alone", () => {
  for (const [from, to] of [[0, 0], [-1, 1], [0, 9], [5, 0]]) {
    assert.deepEqual(keysOf(moveFieldWithin(doc, "a", from, to), "a"), ["name", "email", "phone"]);
  }
});

test("a question can be moved into another question box", () => {
  const next = moveFieldToNode(doc, "a", 1, "b");
  assert.deepEqual(keysOf(next, "a"), ["name", "phone"]);
  assert.deepEqual(keysOf(next, "b"), ["diet", "email"]);
});

test("a question is never moved into a box that asks nothing", () => {
  // A limit box has no fields; dropping a question there would delete it
  // from the form without saying so.
  const next = moveFieldToNode(doc, "a", 0, "r");
  assert.deepEqual(next, doc, "the move should be refused, not silently lossy");
  assert.equal(orderedFields(next).length, 4, "no question is lost");
});

test("moving a question to its own box is a no-op", () => {
  assert.deepEqual(moveFieldToNode(doc, "a", 0, "a"), doc);
});

test("only question boxes are offered as move targets", () => {
  assert.deepEqual(questionNodes(doc).map((n) => n.id), ["a", "b"]);
});

test("a single-field box is normalised to fields[] on first edit", () => {
  // `b` uses the singular `field`; editing must not leave both shapes set.
  const next = setFieldValue(doc, "b", 0, { required: true });
  const node = next.nodes.find((n) => n.id === "b")!;
  assert.equal(node.field, undefined);
  assert.equal(node.fields?.length, 1);
  assert.equal(node.fields?.[0].required, true);
});
