import assert from "node:assert/strict";
import test from "node:test";
import { nodeNumbers } from "../../src/lib/flowchart/numbering";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { ChartDoc } from "../../src/lib/flowchart/types";

const box = (id: string, x: number, y: number, h = 60): ChartDoc["nodes"][number] =>
  ({ id, kind: "step", x, y, w: 200, h, text: id });

test("numbers run 1..n with no gaps and no repeats", () => {
  const nums = nodeNumbers(TRAINING_WEEK_FLOW);
  assert.equal(nums.size, TRAINING_WEEK_FLOW.nodes.length);
  const values = [...nums.values()].sort((a, b) => a - b);
  assert.deepEqual(values, TRAINING_WEEK_FLOW.nodes.map((_, i) => i + 1));
});

test("reading order: down the page first, then across", () => {
  const doc: ChartDoc = {
    nodes: [box("bottom", 0, 300), box("topRight", 400, 0), box("topLeft", 0, 0)],
    edges: [],
  };
  const n = nodeNumbers(doc);
  assert.equal(n.get("topLeft"), 1);
  assert.equal(n.get("topRight"), 2);
  assert.equal(n.get("bottom"), 3);
});

test("boxes on the same visual row are numbered left to right", () => {
  // Six pixels apart is the same row to the eye, so x should decide.
  const doc: ChartDoc = { nodes: [box("right", 400, 6), box("left", 0, 0)], edges: [] };
  const n = nodeNumbers(doc);
  assert.equal(n.get("left"), 1);
  assert.equal(n.get("right"), 2);
});

test("a clear vertical gap still wins over x", () => {
  const doc: ChartDoc = { nodes: [box("lower", 0, 200), box("upperRight", 400, 0)], edges: [] };
  const n = nodeNumbers(doc);
  assert.equal(n.get("upperRight"), 1);
  assert.equal(n.get("lower"), 2);
});

test("numbering is stable for the same document", () => {
  const a = nodeNumbers(TRAINING_WEEK_FLOW);
  const b = nodeNumbers(TRAINING_WEEK_FLOW);
  for (const [id, num] of a) assert.equal(b.get(id), num);
});

test("the seeded chart numbers its spine in the order it reads", () => {
  const n = nodeNumbers(TRAINING_WEEK_FLOW);
  assert.equal(n.get("n1"), 1);            // Registration opens
  assert.ok(n.get("n3")! < n.get("n2")!);  // About you before the sessions
  assert.ok(n.get("n16")! === TRAINING_WEEK_FLOW.nodes.length); // Attends is last
});

test("an empty chart yields no numbers rather than throwing", () => {
  assert.equal(nodeNumbers({ nodes: [], edges: [] }).size, 0);
});
