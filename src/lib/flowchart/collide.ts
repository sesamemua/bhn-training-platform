/**
 * Keeping the box you are dragging out of the boxes you are not.
 *
 * The rule is "block, don't shove": every box you are NOT holding stays
 * exactly where you put it, and the one under the pointer is stopped at
 * the edge of anything in its way.
 *
 * This is the reverse of what it used to do. The old rule was give-way —
 * the mover went wherever the pointer went and shouldered its neighbours
 * aside. In practice that rearranged a chart you had already arranged:
 * you would move one box a little and find three others had drifted, and
 * the only way to put them back was to remember where they had been.
 * A chart is a drawing, and a drawing should not redraw itself.
 *
 * Blocking has one well-known failure — a box that simply stops feels
 * stuck to the cursor — so it is not a plain stop. Each move is resolved
 * one axis at a time, horizontally first and then vertically, which lets
 * a blocked box SLIDE along whatever is holding it instead of jamming.
 * Push into a box from the left and you slide up and down its face; the
 * moment you clear its corner the box catches up with the pointer,
 * because the wanted position is always measured from the pointer and
 * never accumulated.
 */
import type { FlowNode } from "./types";

/**
 * Clear space kept between two boxes.
 *
 * Small on purpose. Under the old give-way rule this was 14px, and since
 * every box within 14px of the mover was shoved, boxes appeared to repel
 * each other across a visible gap — they were pushed while plainly not
 * touching. Blocking is felt rather than watched, so the number only has
 * to be big enough to keep two borders from merging into one line.
 */
export const CLEARANCE = 4;

interface Rect { x: number; y: number; w: number; h: number }

const rectOf = (n: FlowNode): Rect => ({ x: n.x, y: n.y, w: n.w, h: n.h });

/**
 * Can `o` block `m` from moving along `axis` at all?
 *
 * Only if they share the span across that axis: for a sideways move that
 * means sharing rows. A box directly above the mover is irrelevant to
 * moving left, which is what stops the whole chart from feeling sticky.
 */
function blocksAlong(m: Rect, o: Rect, axis: "x" | "y") {
  return axis === "x"
    ? m.y < o.y + o.h + CLEARANCE && o.y < m.y + m.h + CLEARANCE
    : m.x < o.x + o.w + CLEARANCE && o.x < m.x + m.w + CLEARANCE;
}

/**
 * How far the movers may actually travel along one axis.
 *
 * Note what is NOT handled here: a mover already overlapping an obstacle.
 * Nothing in this module can create that state, so it only ever arrives
 * from a chart authored before these rules, or one edited in another
 * window. Such a pair simply does not block — otherwise a box that
 * starts overlapping is welded in place, unable to move even to get
 * free, which is the one thing the person is certainly trying to do.
 */
function clampAxis(movers: Rect[], obstacles: Rect[], axis: "x" | "y", want: number) {
  if (want === 0) return 0;
  const lo = (r: Rect) => (axis === "x" ? r.x : r.y);
  const hi = (r: Rect) => lo(r) + (axis === "x" ? r.w : r.h);

  let allowed = want;
  for (const m of movers) {
    for (const o of obstacles) {
      if (!blocksAlong(m, o, axis)) continue;
      if (want > 0 && hi(m) + CLEARANCE <= lo(o)) {
        // Ahead of us: close the gap, no further.
        allowed = Math.min(allowed, lo(o) - CLEARANCE - hi(m));
      } else if (want < 0 && lo(m) - CLEARANCE >= hi(o)) {
        allowed = Math.max(allowed, hi(o) + CLEARANCE - lo(m));
      }
      // Anything else is behind us, and moving away from a box is
      // always allowed.
    }
  }
  return allowed;
}

/**
 * Clamp a drag so the boxes being dragged land as close to where they
 * were asked to go as they can get without overlapping anything else.
 *
 * `want` holds the positions the pointer is asking for. The returned map
 * holds the positions they may actually have. Every other box in `nodes`
 * is left untouched — that is the entire point.
 *
 * Several boxes dragged together move rigidly: one delta is clamped for
 * the whole group, so the group never deforms just because one member
 * met an obstacle.
 */
export function limitDrag(
  nodes: FlowNode[],
  movingIds: string[],
  want: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const moving = new Set(movingIds);
  const movers = nodes.filter((n) => moving.has(n.id));
  const ref = movers[0];
  const target = ref && want.get(ref.id);
  if (!ref || !target) return want;

  const obstacles = nodes.filter((n) => !moving.has(n.id)).map(rectOf);
  const rects = movers.map(rectOf);

  // Measured from where the boxes are now, toward where the pointer
  // wants them. Asking fresh each time is what lets a box that was held
  // up catch back up with the cursor the moment its way is clear.
  let dx = clampAxis(rects, obstacles, "x", target.x - ref.x);
  // Horizontally first, then vertically against the result, so a box
  // held up on one axis still travels freely on the other.
  const afterX = rects.map((r) => ({ ...r, x: r.x + dx }));
  let dy = clampAxis(afterX, obstacles, "y", target.y - ref.y);

  // The canvas has no negative quadrant. Clamped as one delta rather
  // than per box, or a group meeting the edge would squash against it.
  dx = Math.max(dx, -Math.min(...rects.map((r) => r.x)));
  dy = Math.max(dy, -Math.min(...rects.map((r) => r.y)));

  const out = new Map<string, { x: number; y: number }>();
  for (const m of movers) out.set(m.id, { x: m.x + dx, y: m.y + dy });
  return out;
}
