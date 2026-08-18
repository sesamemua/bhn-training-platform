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
 * Crossing another ARROW is fine and not penalised — in a dense chart
 * some lines have to cross, and forcing them apart costs more clarity
 * than it buys. Crossing a BOX is what makes a chart unreadable, so that
 * is what the scoring hunts down.
 *
 * Shape: a clear shot is drawn as a STRAIGHT line, and anything that has
 * to get out of the way is drawn as one SMOOTH curve through its
 * waypoints. Right-angled staircases were correct and ugly — a chart
 * full of them reads as wonky rather than as deliberate.
 *
 * Deliberately not a full router: no A*, no channel packing. Candidates
 * are the shapes a person would draw by hand — straight across, an L in
 * either direction, or a Z that detours around the obstacle — plus, when
 * something is genuinely in the way, explicit detours around that box's
 * four sides. Enough for charts of this size, and predictable when a box
 * moves.
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

  // A clear shot needs no routing at all. Straight beats a curve, and a
  // curve beats a staircase — so try them in that order.
  const ac = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const bc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const straight = [edgePointOf(ac, bc, from), edgePointOf(bc, ac, to)];
  if (crossings(straight, obstacles) === 0) return straight;
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

  // If everything so far still hits something, try going round the
  // offending box explicitly — over its top, under its bottom, or past
  // either side — which is what a person does when a line is blocked.
  const blocked = candidates.every((c) => crossings(simplify(c), obstacles) > 0);
  if (blocked) {
    for (const o of obstacles) {
      const r = rectOf(o);
      for (const [sa, sb] of sidePairs(from, to)) {
        const a = anchor(from, sa);
        const b = anchor(to, sb);
        const a2 = stubOut(a, sa);
        const b2 = stubOut(b, sb);
        for (const lane of [r.y1 - STUB, r.y2 + STUB]) {
          candidates.push([a, a2, { x: a2.x, y: lane }, { x: b2.x, y: lane }, b2, b]);
        }
        for (const lane of [r.x1 - STUB, r.x2 + STUB]) {
          candidates.push([a, a2, { x: lane, y: a2.y }, { x: lane, y: b2.y }, b2, b]);
        }
      }
    }
  }

  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const p = simplify(c);
    // Crossing a box is far worse than being long: 1000 per hit. Each
    // extra bend costs 60px of detour, so a slightly longer line with one
    // turn beats a shorter staircase with three.
    const score = crossings(p, obstacles) * 1000 + length(p) + p.length * 60;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return simplify(best);
}

/**
 * Where a line aimed at `to` leaves `box` — the midpoint of whichever
 * edge it faces. Exported for the rubber-band line drawn while a
 * connection is being made, which needs the same anchor a finished arrow
 * would use so the line does not jump when you let go.
 */
export function edgeAnchor(box: FlowNode, to: Pt): Pt {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return edgePointOf(c, to, box);
}

/** Where the straight line between two centres meets a box's edge. */
function edgePointOf(from: Pt, to: Pt, box: FlowNode): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const hw = box.w / 2 + 4;
  const hh = box.h / 2 + 4;
  const scale = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

/**
 * The route as an SVG path: straight runs joined by small, evenly rounded
 * corners.
 *
 * An earlier version drew one Catmull-Rom spline through every waypoint.
 * It passed through the right places but bulged between them — a long
 * segment either side of a turn produced a wide, swooping bend that reads
 * as unnatural, because nothing in the chart is actually curving there.
 * A fillet of a fixed small radius is what a person draws: the line is
 * straight where it travels and only softens where it turns.
 */
export function toPath(points: Pt[], radius = 22): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  /** Step from `a` towards `b` by `d` pixels. */
  const towards = (a: Pt, b: Pt, d: number): Pt => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = Math.min(1, d / len);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const f = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

  const d: string[] = [`M ${f(points[0])}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1];
    // Never eat more than half of either neighbouring run, or two corners
    // on a short segment would overlap and the line would kink.
    const r = Math.min(
      radius,
      Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2,
      Math.hypot(next.x - cur.x, next.y - cur.y) / 2,
    );
    const a = towards(cur, prev, r);
    const b = towards(cur, next, r);
    d.push(`L ${f(a)}`);
    d.push(`C ${f(cur)} ${f(cur)} ${f(b)}`);
  }
  d.push(`L ${f(points[points.length - 1])}`);
  return d.join(" ");
}

/**
 * A point some fraction of the way along the polyline, plus the direction
 * of travel there — so a label can be pushed perpendicular to the line
 * instead of sitting on top of it, and can slide along the line when the
 * midpoint has nowhere free to go.
 *
 * A plate drawn centred on the path punches a visible gap in the arrow,
 * which reads as a disconnected line rather than as a label.
 */
export function pointAt(points: Pt[], frac: number): Pt & { dx: number; dy: number } {
  const target = length(points) * Math.min(1, Math.max(0, frac));
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (run + seg >= target) {
      const t = seg === 0 ? 0 : (target - run) / seg;
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

/** The middle of the polyline, with its direction of travel. */
export function midpointWithDir(points: Pt[]): Pt & { dx: number; dy: number } {
  return pointAt(points, 0.5);
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
