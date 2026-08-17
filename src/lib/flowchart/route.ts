/**
 * Arrow routing that goes around boxes instead of through them.
 *
 * A straight line between two box centres reads fine on a sparse chart
 * and becomes unreadable the moment a third box sits between them — the
 * line disappears under it and re-emerges somewhere unrelated. So each
 * arrow is drawn as an orthogonal path (right angles only, like a circuit
 * diagram) chosen from a handful of candidates, scored on how many boxes
 * it crosses first and how long it is second.
 *
 * Deliberately not a full router: no A*, no channel packing. Candidates
 * are the shapes a person would draw by hand — straight across, an L in
 * either direction, or a Z that detours around the obstacle — which is
 * enough for charts of this size and stays predictable when a box moves.
 */
import type { FlowNode } from "./types";

export interface Pt { x: number; y: number }
type Side = "top" | "bottom" | "left" | "right";

const PAD = 10;      // clearance kept around every box
const STUB = 18;     // straight run out of a box before the first turn

const rectOf = (n: FlowNode) => ({
  x1: n.x - PAD, y1: n.y - PAD, x2: n.x + n.w + PAD, y2: n.y + n.h + PAD,
});

/** Anchor in the middle of one side of a box. */
function anchor(n: FlowNode, side: Side): Pt {
  switch (side) {
    case "top": return { x: n.x + n.w / 2, y: n.y };
    case "bottom": return { x: n.x + n.w / 2, y: n.y + n.h };
    case "left": return { x: n.x, y: n.y + n.h / 2 };
    case "right": return { x: n.x + n.w, y: n.y + n.h / 2 };
  }
}

/** Push a point away from its box so the line leaves cleanly. */
function stubOut(p: Pt, side: Side): Pt {
  switch (side) {
    case "top": return { x: p.x, y: p.y - STUB };
    case "bottom": return { x: p.x, y: p.y + STUB };
    case "left": return { x: p.x - STUB, y: p.y };
    case "right": return { x: p.x + STUB, y: p.y };
  }
}

/** Does segment a-b pass through the (padded) box? */
function hits(a: Pt, b: Pt, r: ReturnType<typeof rectOf>): boolean {
  // Segments are axis-aligned, so this is a simple overlap test.
  const loX = Math.min(a.x, b.x), hiX = Math.max(a.x, b.x);
  const loY = Math.min(a.y, b.y), hiY = Math.max(a.y, b.y);
  return loX < r.x2 && hiX > r.x1 && loY < r.y2 && hiY > r.y1;
}

function crossings(path: Pt[], boxes: FlowNode[]): number {
  let n = 0;
  for (const b of boxes) {
    const r = rectOf(b);
    for (let i = 1; i < path.length; i++) if (hits(path[i - 1], path[i], r)) { n++; break; }
  }
  return n;
}

function length(path: Pt[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    d += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  }
  return d;
}

/** Collapse points that repeat or sit on the same straight run. */
function simplify(path: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
  }
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const straight =
      (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
      (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
    if (straight) out.splice(i, 1); else i++;
  }
  return out;
}

/** Which sides to leave from and arrive at, given relative position. */
function sidePairs(from: FlowNode, to: FlowNode): [Side, Side][] {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  const horizontal: [Side, Side] = dx >= 0 ? ["right", "left"] : ["left", "right"];
  const vertical: [Side, Side] = dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
  // Prefer the axis with the larger separation, but always offer both.
  return Math.abs(dy) >= Math.abs(dx)
    ? [vertical, horizontal, [vertical[0], horizontal[1]], [horizontal[0], vertical[1]]]
    : [horizontal, vertical, [horizontal[0], vertical[1]], [vertical[0], horizontal[1]]];
}

/**
 * Route one arrow. Returns the points of an orthogonal polyline, already
 * simplified, starting on `from`'s edge and ending on `to`'s.
 */
export function routeEdge(from: FlowNode, to: FlowNode, all: FlowNode[]): Pt[] {
  const obstacles = all.filter((n) => n.id !== from.id && n.id !== to.id);
  const candidates: Pt[][] = [];

  for (const [sa, sb] of sidePairs(from, to)) {
    const a = anchor(from, sa);
    const b = anchor(to, sb);
    const a2 = stubOut(a, sa);
    const b2 = stubOut(b, sb);

    // Elbow both ways round.
    candidates.push([a, a2, { x: b2.x, y: a2.y }, b2, b]);
    candidates.push([a, a2, { x: a2.x, y: b2.y }, b2, b]);

    // Z-shaped detours: split the gap at a few offsets so a blocked
    // channel has somewhere else to go.
    const midY = (a2.y + b2.y) / 2;
    const midX = (a2.x + b2.x) / 2;
    for (const k of [0, -70, 70, -140, 140]) {
      candidates.push([a, a2, { x: a2.x, y: midY + k }, { x: b2.x, y: midY + k }, b2, b]);
      candidates.push([a, a2, { x: midX + k, y: a2.y }, { x: midX + k, y: b2.y }, b2, b]);
    }
  }

  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const p = simplify(c);
    // Crossing a box is far worse than being long: 1000 per hit.
    const score = crossings(p, obstacles) * 1000 + length(p) + p.length * 4;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return simplify(best);
}

/** The polyline as an SVG path, with softly rounded corners. */
export function toPath(points: Pt[], radius = 8): string {
  if (points.length < 2) return "";
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], prev = points[i - 1], next = points[i + 1];
    const r = Math.min(
      radius,
      Math.abs(p.x - prev.x) / 2 || radius,
      Math.abs(p.y - prev.y) / 2 || radius,
      Math.abs(next.x - p.x) / 2 || radius,
      Math.abs(next.y - p.y) / 2 || radius,
    );
    const inX = Math.sign(p.x - prev.x), inY = Math.sign(p.y - prev.y);
    const outX = Math.sign(next.x - p.x), outY = Math.sign(next.y - p.y);
    d.push(`L ${p.x - inX * r} ${p.y - inY * r}`);
    d.push(`Q ${p.x} ${p.y} ${p.x + outX * r} ${p.y + outY * r}`);
  }
  const last = points[points.length - 1];
  d.push(`L ${last.x} ${last.y}`);
  return d.join(" ");
}

/**
 * Midpoint of the polyline plus the direction of travel there, so a label
 * can be pushed perpendicular to the line instead of sitting on top of
 * it. A plate drawn centred on the path punches a visible gap in the
 * arrow — which reads as a disconnected line, not as a label.
 */
export function midpointWithDir(points: Pt[]): Pt & { dx: number; dy: number } {
  const total = length(points);
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (run + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - run) / seg;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        dx: (b.x - a.x) / len,
        dy: (b.y - a.y) / len,
      };
    }
    run += seg;
  }
  const last = points[points.length - 1];
  return { ...last, dx: 1, dy: 0 };
}

/** Midpoint of the polyline, for placing a label. */
export function midpoint(points: Pt[]): Pt {
  const total = length(points);
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    if (run + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - run) / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    run += seg;
  }
  return points[points.length - 1];
}
