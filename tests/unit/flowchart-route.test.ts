import assert from "node:assert/strict";
import test from "node:test";
import { midpoint, routeEdge, toPath } from "../../src/lib/flowchart/route";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { FlowNode } from "../../src/lib/flowchart/types";

const PAD = 10;
const box = (n: FlowNode) => ({ x1: n.x - PAD, y1: n.y - PAD, x2: n.x + n.w + PAD, y2: n.y + n.h + PAD });

/** Does any segment of the path pass through this box? */
function crosses(pts: { x: number; y: number }[], n: FlowNode): boolean {
  const r = box(n);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const loX = Math.min(a.x, b.x), hiX = Math.max(a.x, b.x);
    const loY = Math.min(a.y, b.y), hiY = Math.max(a.y, b.y);
    if (loX < r.x2 && hiX > r.x1 && loY < r.y2 && hiY > r.y1) return true;
  }
  return false;
}

const node = (id: string, x: number, y: number): FlowNode => ({
  id, x, y, w: 190, h: 58, kind: "step", text: id,
});

test("a box directly between two others is routed around, not through", () => {
  const from = node("a", 0, 0);
  const blocker = node("b", 0, 200);
  const to = node("c", 0, 400);
  const pts = routeEdge(from, to, [from, blocker, to]);
  assert.equal(crosses(pts, blocker), false, "the arrow went straight through the middle box");
});

test("every arrow in the seeded Training Week chart clears every other box", () => {
  const { nodes, edges } = TRAINING_WEEK_FLOW;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const offenders: string[] = [];

  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const pts = routeEdge(a, b, nodes);
    for (const other of nodes) {
      if (other.id === a.id || other.id === b.id) continue;
      if (crosses(pts, other)) offenders.push(`${e.from}->${e.to} crosses ${other.id}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

test("routes are orthogonal — every segment is horizontal or vertical", () => {
  const { nodes, edges } = TRAINING_WEEK_FLOW;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const pts = routeEdge(a, b, nodes);
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i].x - pts[i - 1].x);
      const dy = Math.abs(pts[i].y - pts[i - 1].y);
      assert.ok(dx < 0.5 || dy < 0.5, `${e.id} has a diagonal segment`);
    }
  }
});

test("a route always starts and ends on the box edges it connects", () => {
  const a = node("a", 0, 0);
  const b = node("b", 400, 300);
  const pts = routeEdge(a, b, [a, b]);
  const onEdge = (p: { x: number; y: number }, n: FlowNode) =>
    (Math.abs(p.x - n.x) < 1 || Math.abs(p.x - (n.x + n.w)) < 1 ||
     Math.abs(p.y - n.y) < 1 || Math.abs(p.y - (n.y + n.h)) < 1);
  assert.ok(onEdge(pts[0], a), "start is not on the source box");
  assert.ok(onEdge(pts[pts.length - 1], b), "end is not on the target box");
});

test("toPath emits a valid path and midpoint lands on the route", () => {
  const a = node("a", 0, 0);
  const b = node("b", 300, 260);
  const pts = routeEdge(a, b, [a, b]);
  const d = toPath(pts);
  assert.match(d, /^M [\d.-]+ [\d.-]+/);
  assert.ok(!/NaN|undefined/.test(d), "path contains NaN");
  const m = midpoint(pts);
  assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y));
});
