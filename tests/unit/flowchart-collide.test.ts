import test from "node:test";
import assert from "node:assert/strict";
import { CLEARANCE, limitDrag, settleGrowth } from "../../src/lib/flowchart/collide";
import type { FlowNode } from "../../src/lib/flowchart/types";

const node = (id: string, x: number, y: number, w = 220, h = 60): FlowNode =>
  ({ id, x, y, w, h, kind: "step", text: id }) as FlowNode;

/** Drag `id` toward (x, y) and report where it is allowed to end up. */
const drag = (nodes: FlowNode[], id: string, x: number, y: number) =>
  limitDrag(nodes, [id], new Map([[id, { x, y }]])).get(id)!;

const at = (nodes: FlowNode[], id: string) => nodes.find((n) => n.id === id)!;

/** Positions of everything that was NOT dragged. */
const bystanders = (nodes: FlowNode[], movingIds: string[], want: Map<string, { x: number; y: number }>) => {
  const out = limitDrag(nodes, movingIds, want);
  return nodes.filter((n) => !movingIds.includes(n.id)).map((n) => ({ id: n.id, moved: out.has(n.id) }));
};

test("a box moves freely when nothing is in the way", () => {
  const nodes = [node("mover", 0, 0), node("far", 0, 900)];
  const at = drag(nodes, "mover", 120, 300);
  assert.deepEqual(at, { x: 120, y: 300 });
});

test("the box being dragged stops short instead of overlapping", () => {
  const nodes = [node("mover", 0, 0), node("wall", 0, 200)];
  const at = drag(nodes, "mover", 0, 400); // straight through the wall
  assert.equal(at.y, 200 - CLEARANCE - 60, "should rest one clearance above the wall");
  assert.ok(at.y + 60 + CLEARANCE <= 200, "must not overlap");
});

test("boxes that are NOT being dragged never move", () => {
  const nodes = [node("mover", 0, 0), node("a", 0, 200), node("b", 0, 400)];
  const seen = bystanders(nodes, ["mover"], new Map([["mover", { x: 0, y: 600 }]]));
  assert.deepEqual(seen, [
    { id: "a", moved: false },
    { id: "b", moved: false },
  ]);
});

test("a box far away does not block, however hard you drag past it", () => {
  // 'aside' shares no rows with the mover's path along x.
  const nodes = [node("mover", 0, 0), node("aside", 600, 800)];
  const at = drag(nodes, "mover", 900, 0);
  assert.deepEqual(at, { x: 900, y: 0 });
});

test("a box one clearance away is not blocked until it actually closes the gap", () => {
  const nodes = [node("mover", 0, 0), node("wall", 0, 200)];
  // Asking for less than the gap is granted in full.
  const near = drag(nodes, "mover", 0, 100);
  assert.equal(near.y, 100);
});

test("blocked on one axis, still free on the other — it slides", () => {
  const nodes = [node("mover", 0, 100), node("wall", 300, 100)];
  // Push right into the wall and down at the same time.
  const at = drag(nodes, "mover", 400, 260);
  assert.equal(at.x, 300 - CLEARANCE - 220, "held at the wall's face");
  assert.equal(at.y, 260, "but the vertical part of the move is granted");
});

test("a group moves rigidly — one member blocked holds the whole group", () => {
  const nodes = [node("g1", 0, 0), node("g2", 0, 100), node("wall", 0, 300)];
  const want = new Map([
    ["g1", { x: 0, y: 200 }],
    ["g2", { x: 0, y: 300 }],
  ]);
  const out = limitDrag(nodes, ["g1", "g2"], want);
  const g1 = out.get("g1")!;
  const g2 = out.get("g2")!;
  assert.equal(g2.y - g1.y, 100, "the group must not deform");
  assert.ok(g2.y + 60 + CLEARANCE <= 300, "the trailing member stops at the wall");
});

test("a group is stopped by the canvas edge without squashing", () => {
  const nodes = [node("g1", 100, 0), node("g2", 300, 0)];
  const want = new Map([
    ["g1", { x: -200, y: 0 }],
    ["g2", { x: 0, y: 0 }],
  ]);
  const out = limitDrag(nodes, ["g1", "g2"], want);
  assert.equal(out.get("g1")!.x, 0);
  assert.equal(out.get("g2")!.x, 200, "spacing preserved against the edge");
});

test("a box that already overlaps another can still be dragged free", () => {
  // Charts authored before these rules can hold overlaps; a box must
  // never be welded in place by one.
  const nodes = [node("mover", 0, 0), node("under", 10, 10)];
  const at = drag(nodes, "mover", 0, 400);
  assert.equal(at.y, 400, "an existing overlap does not trap the box");
});

test("moving away from a box is never restricted", () => {
  const nodes = [node("mover", 0, 200), node("wall", 0, 400)];
  const at = drag(nodes, "mover", 0, 0);
  assert.equal(at.y, 0);
});

test("dragging nothing is a no-op", () => {
  const nodes = [node("a", 0, 0)];
  const out = limitDrag(nodes, [], new Map());
  assert.equal(out.size, 0);
});

// ── settleGrowth ────────────────────────────────────────────────────

test("a box that grows into the gap below it moves nothing", () => {
  // 100px of gap, 20px of growth: nobody needs to move.
  const nodes = [node("top", 0, 0, 220, 60), node("below", 0, 160)];
  const out = settleGrowth(nodes, { top: 80 });
  assert.equal(at(out, "top").h, 80, "the box itself gets its measured height");
  assert.equal(at(out, "below").y, 160, "the box below did not have to move");
});

test("a box that grows past the one below pushes it down, and no further", () => {
  const nodes = [node("top", 0, 0, 220, 60), node("below", 0, 100)];
  const out = settleGrowth(nodes, { top: 140 }); // bottom now 140
  assert.equal(at(out, "below").y, 140 + CLEARANCE, "moved exactly clear, not more");
});

test("the push cascades to boxes further down", () => {
  const nodes = [node("top", 0, 0, 220, 60), node("mid", 0, 100), node("low", 0, 170)];
  const out = settleGrowth(nodes, { top: 140 });
  const mid = at(out, "mid");
  const low = at(out, "low");
  assert.equal(mid.y, 140 + CLEARANCE);
  assert.ok(low.y >= mid.y + mid.h + CLEARANCE, "the third box is cleared too");
});

test("growth in one column leaves a different column alone", () => {
  const nodes = [node("top", 0, 0, 220, 60), node("aside", 400, 100)];
  const out = settleGrowth(nodes, { top: 200 });
  assert.equal(at(out, "aside").y, 100, "a box in another column is not below it");
});

test("settling is idempotent — the second pass changes nothing", () => {
  const nodes = [node("top", 0, 0, 220, 60), node("below", 0, 100)];
  const once = settleGrowth(nodes, { top: 140 });
  const heights = Object.fromEntries(once.map((n) => [n.id, n.h]));
  const twice = settleGrowth(once, heights);
  assert.equal(twice, once, "identity returned, so no render loop");
});

test("a measurement within the deadband is ignored entirely", () => {
  const nodes = [node("a", 0, 0, 220, 60)];
  assert.equal(settleGrowth(nodes, { a: 61 }), nodes, "1px of noise must not rewrite the doc");
});
