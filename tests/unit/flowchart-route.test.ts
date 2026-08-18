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

test("a clear shot is a straight line, not a staircase", () => {
  const a = node("a", 0, 0);
  const b = node("b", 400, 300);
  const pts = routeEdge(a, b, [a, b]);
  assert.equal(pts.length, 2, "nothing was in the way, so it should be one segment");
  assert.ok(toPath(pts).startsWith("M "));
  assert.ok(toPath(pts).includes(" L "), "a clear shot should be a plain line");
  assert.ok(!toPath(pts).includes("C"), "a clear shot should not curve");
});

test("a blocked route curves rather than turning square corners", () => {
  const from = node("a", 0, 0);
  const blocker = node("b", 0, 200);
  const to = node("c", 0, 400);
  const pts = routeEdge(from, to, [from, blocker, to]);
  assert.ok(pts.length > 2, "a detour needs waypoints");
  assert.ok(toPath(pts).includes("C"), "a detour should render as a curve");
  assert.equal(crosses(pts, blocker), false);
});

test("a route starts and ends just outside the boxes it connects", () => {
  const a = node("a", 0, 0);
  const b = node("b", 400, 300);
  const pts = routeEdge(a, b, [a, b]);
  const gap = (p: { x: number; y: number }, n: typeof a) => {
    const dx = Math.max(n.x - p.x, 0, p.x - (n.x + n.w));
    const dy = Math.max(n.y - p.y, 0, p.y - (n.y + n.h));
    return Math.hypot(dx, dy);
  };
  assert.ok(gap(pts[0], a) <= 8, "start drifted away from its box");
  assert.ok(gap(pts[pts.length - 1], b) <= 8, "end drifted away from its box");
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

test("crossing another arrow is allowed — only boxes are avoided", () => {
  // Two edges that must cross each other: a->d and b->c laid out as an X.
  const a = node("a", 0, 0);
  const b = node("b", 400, 0);
  const c = node("c", 0, 400);
  const d = node("d", 400, 400);
  const all = [a, b, c, d];
  const p1 = routeEdge(a, d, all);
  const p2 = routeEdge(b, c, all);
  // Neither route may clip the two boxes it does not connect…
  assert.equal(crosses(p1, b), false);
  assert.equal(crosses(p1, c), false);
  assert.equal(crosses(p2, a), false);
  assert.equal(crosses(p2, d), false);
  // …and both still exist, i.e. the router did not refuse to draw them.
  assert.ok(p1.length >= 2 && p2.length >= 2);
});

test("a wall of boxes still yields a box-free route", () => {
  const from = node("from", 0, 0);
  const to = node("to", 0, 600);
  const wall = [node("w1", -200, 300), node("w2", 0, 300), node("w3", 200, 300)];
  const all = [from, ...wall, to];
  const pts = routeEdge(from, to, all);
  for (const w of wall) {
    assert.equal(crosses(pts, w), false, `route went through ${w.id}`);
  }
});

/**
 * The registration flow is linear, so the seeded chart should read as a
 * column. If it ever spreads out again the canvas grows past the pane and
 * you have to scroll sideways to follow a process that only goes down.
 */
test("the seeded chart stays narrow enough not to scroll sideways", () => {
  const right = Math.max(...TRAINING_WEEK_FLOW.nodes.map((n) => n.x + n.w));
  assert.ok(right <= 760, `chart is ${right}px wide; it should stay within one pane`);
  // At most two columns: the spine, plus the lane branches step out to.
  const columns = new Set(TRAINING_WEEK_FLOW.nodes.map((n) => n.x));
  assert.ok(columns.size <= 2, `expected a spine and one branch lane, got ${columns.size} columns`);
});

test("bends are small fillets, not wide swooping curves", () => {
  // Two long runs meeting at a right angle: the corner should be softened
  // by a few tens of pixels, and the rest of the line should stay straight.
  const d = toPath([{ x: 0, y: 0 }, { x: 0, y: 400 }, { x: 400, y: 400 }]);
  const first = d.match(/L ([\d.]+) ([\d.]+)/);
  assert.ok(first, "the path should travel straight before it turns");
  assert.ok(Number(first![2]) > 340, "the straight run should reach close to the corner");
});
