import assert from "node:assert/strict";
import test from "node:test";
import { CLEARANCE, resolveCollisions } from "../../src/lib/flowchart/collide";
import type { FlowNode } from "../../src/lib/flowchart/types";

const box = (id: string, x: number, y: number, w = 200, h = 60): FlowNode =>
  ({ id, kind: "step", x, y, w, h, text: id });

const at = (ns: FlowNode[], id: string) => ns.find((n) => n.id === id)!;

test("the box being dragged always lands where it was dragged", () => {
  const nodes = [box("mover", 0, 0), box("other", 10, 10)];
  const out = resolveCollisions(nodes, ["mover"]);
  assert.equal(at(out, "mover").x, 0);
  assert.equal(at(out, "mover").y, 0);
});

test("a box in the way is pushed clear, not overlapped", () => {
  const nodes = [box("mover", 0, 0), box("other", 0, 20)];
  const out = resolveCollisions(nodes, ["mover"]);
  const m = at(out, "mover"), o = at(out, "other");
  assert.ok(o.y >= m.y + m.h + CLEARANCE - 1, `expected clearance, got ${o.y - (m.y + m.h)}`);
});

test("it pushes along the cheaper axis", () => {
  // Deep vertical overlap, shallow horizontal: shove sideways.
  const nodes = [box("mover", 0, 0), box("other", 190, 2)];
  const out = resolveCollisions(nodes, ["mover"]);
  const o = at(out, "other");
  assert.ok(o.x > 190, "should have moved right");
  assert.equal(o.y, 2, "should not have moved vertically");
});

test("a push cascades to the next box along", () => {
  const nodes = [box("mover", 0, 0), box("a", 0, 20), box("a2", 0, 90)];
  const out = resolveCollisions(nodes, ["mover"]);
  const m = at(out, "mover"), a = at(out, "a"), a2 = at(out, "a2");
  assert.ok(a.y >= m.y + m.h + CLEARANCE - 1);
  assert.ok(a2.y >= a.y + a.h + CLEARANCE - 1, "the second box should have been shoved too");
});

test("boxes that were already overlapping are left alone", () => {
  // Nothing is being dragged, so nothing should be tidied up behind the
  // author's back.
  const nodes = [box("a", 0, 0), box("b", 5, 5)];
  const out = resolveCollisions(nodes, []);
  assert.deepEqual(out.map((n) => [n.x, n.y]), [[0, 0], [5, 5]]);
});

test("a whole group being dragged never pushes its own members", () => {
  const nodes = [box("g1", 0, 0), box("g2", 0, 74), box("other", 0, 150)];
  const out = resolveCollisions(nodes, ["g1", "g2"]);
  assert.deepEqual([at(out, "g1").y, at(out, "g2").y], [0, 74]);
  assert.ok(at(out, "other").y >= 74 + 60 + CLEARANCE - 1);
});

test("nothing is pushed off the canvas", () => {
  const nodes = [box("mover", 0, 100), box("other", 0, 60)];
  const out = resolveCollisions(nodes, ["mover"]);
  assert.ok(at(out, "other").x >= 0);
  assert.ok(at(out, "other").y >= 0);
});

test("a chart with nothing touching comes back unchanged", () => {
  const nodes = [box("a", 0, 0), box("b", 0, 400), box("c", 400, 0)];
  const out = resolveCollisions(nodes, ["a"]);
  assert.equal(out[0], nodes[0]);
  assert.equal(out[1], nodes[1]);
  assert.equal(out[2], nodes[2]);
});
