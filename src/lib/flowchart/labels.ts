/**
 * Where an arrow's label goes.
 *
 * The obvious answer — a fixed nudge perpendicular to the line's midpoint
 * — works on a sparse chart and fails on a column. On a vertical spine
 * the perpendicular is horizontal, so every label lands a few pixels to
 * the side of the line, which on a tight layout is squarely on top of the
 * neighbouring box. "not a trainee" over "Trainee details", "no reply"
 * over "Seat released" — the text is unreadable and it hides the box.
 *
 * So a label is placed by search rather than by formula: try positions
 * near the line first, then further out to either side, then further
 * along the line, and take the first that lands in genuinely empty space.
 * A chart laid out as a column has wide empty margins either side of the
 * spine, and that is exactly where a blocked label should end up.
 *
 * Placement is sequential and order-dependent: each label is an obstacle
 * for the ones after it, so two labels never stack on the same spot.
 */
import { pointAt, type Pt } from "./route";
import type { FlowNode } from "./types";

export interface Rect { x: number; y: number; w: number; h: number }

/** Clearance kept around a box before a label counts as "on" it. */
const BOX_PAD = 6;

/**
 * The plate a label needs. Matches the SVG the editor draws: ~5.8px per
 * character at 10px semibold, plus padding.
 */
export function labelSize(text: string): { w: number; h: number } {
  return { w: text.length * 5.8 + 10, h: 14 };
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** How far along the line to try, in order: middle first, then outward. */
const FRACTIONS = [0.5, 0.42, 0.58, 0.32, 0.68, 0.24, 0.76];
/** How far off the line to try. The first few are nudges; the rest reach
 *  for the empty margins either side of the chart. */
const OFFSETS = [12, 22, 34, 50, 70, 95, 125, 160, 200];

export interface Placement {
  /** Centre of the label plate. */
  x: number;
  y: number;
  /** The point on the line it belongs to — drawn as a leader when far. */
  anchorX: number;
  anchorY: number;
  /** True when the label sat down in clear space. */
  clear: boolean;
}

/**
 * Place one label. `boxes` are the chart's boxes, `taken` the plates of
 * labels already placed; both are avoided. `bounds` keeps a label from
 * being pushed off the canvas, where it would simply be invisible.
 */
export function placeLabel(
  points: Pt[],
  text: string,
  boxes: FlowNode[],
  taken: Rect[],
  bounds: { w: number; h: number },
): Placement {
  const size = labelSize(text);
  const obstacles: Rect[] = boxes.map((n) => ({
    x: n.x - BOX_PAD, y: n.y - BOX_PAD, w: n.w + BOX_PAD * 2, h: n.h + BOX_PAD * 2,
  }));

  let best: Placement | null = null;
  let bestScore = Infinity;

  for (const frac of FRACTIONS) {
    const p = pointAt(points, frac);
    // Perpendicular to the direction of travel.
    const px = -p.dy, py = p.dx;
    for (const off of OFFSETS) {
      for (const side of [1, -1]) {
        const cx = p.x + px * side * off;
        const cy = p.y + py * side * off;
        const rect: Rect = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };

        // Off-canvas is not a placement at all, only somewhere invisible.
        if (rect.x < 2 || rect.y < 2 || rect.x + rect.w > bounds.w - 2 || rect.y + rect.h > bounds.h - 2) {
          continue;
        }

        let score = 0;
        for (const o of obstacles) if (overlaps(rect, o)) score += 1000;
        for (const t of taken) if (overlaps(rect, t)) score += 600;
        // Prefer close to the line, and prefer the middle of it — a label
        // far from its arrow, or bunched at one end, is harder to read
        // back to the arrow it names.
        score += off + Math.abs(frac - 0.5) * 120;

        if (score < bestScore) {
          bestScore = score;
          best = { x: cx, y: cy, anchorX: p.x, anchorY: p.y, clear: score < 600 };
        }
        // Nothing in the way and close in: no candidate can beat this.
        if (score === off && off === OFFSETS[0] && frac === 0.5) return best!;
      }
    }
  }

  if (best) return best;
  const p = pointAt(points, 0.5);
  return { x: p.x, y: p.y, anchorX: p.x, anchorY: p.y, clear: false };
}

/**
 * Place every label on the chart, each avoiding the ones before it.
 * Returned in the same order as `edges`.
 */
export function placeLabels(
  edges: { points: Pt[]; text: string }[],
  boxes: FlowNode[],
  bounds: { w: number; h: number },
): Placement[] {
  const taken: Rect[] = [];
  return edges.map((e) => {
    const at = placeLabel(e.points, e.text, boxes, taken, bounds);
    const size = labelSize(e.text);
    taken.push({ x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h });
    return at;
  });
}
