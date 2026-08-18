/**
 * Keeping boxes off each other while one is being dragged.
 *
 * The rule is "give way, don't block": the box under the pointer always
 * goes exactly where the pointer goes, and anything it lands on steps
 * aside. Refusing the move instead — the other obvious design — makes the
 * box stick to the cursor and feels broken, and it is worse the more
 * crowded the chart gets, which is exactly when you need to move things.
 *
 * Displacement is along whichever axis needs the smaller push, so a box
 * approached from above is nudged down and one approached from the side
 * is nudged sideways. That reads as being shouldered out of the way
 * rather than teleporting.
 *
 * Pushes cascade — a shoved box can shove the next — but the cascade is
 * bounded, because a chain that runs away is worse than one that stops a
 * box short.
 */
import type { FlowNode } from "./types";

/** Clear space kept between two boxes. */
export const CLEARANCE = 14;

interface Rect { x: number; y: number; w: number; h: number }

function overlap(a: Rect, b: Rect, pad = CLEARANCE) {
  const dx = Math.min(a.x + a.w + pad - b.x, b.x + b.w + pad - a.x);
  const dy = Math.min(a.y + a.h + pad - b.y, b.y + b.h + pad - a.y);
  return dx > 0 && dy > 0 ? { dx, dy } : null;
}

/**
 * Move `movingId` to where it has been dragged, and push whatever is in
 * the way out of it. Returns every node, with the ones that had to move
 * carrying new positions.
 *
 * `pinned` never moves — the boxes being dragged as a group, which are
 * placed by the caller and must not shove each other.
 */
export function resolveCollisions(
  nodes: FlowNode[],
  movingIds: string[],
  maxPasses = 6,
): FlowNode[] {
  const pos = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const pinned = new Set(movingIds);
  // Everything the moving boxes have already displaced this drag; they
  // are free to move again, but they do not push the mover back.
  const settled = new Set(movingIds);

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;

    for (const a of nodes) {
      const pa = pos.get(a.id)!;
      for (const b of nodes) {
        if (a.id === b.id) continue;
        // Only a settled box pushes; two idle boxes that were already
        // overlapping are left exactly as the author left them.
        if (!settled.has(a.id)) continue;
        if (pinned.has(b.id)) continue;

        const pb = pos.get(b.id)!;
        const hit = overlap(
          { x: pa.x, y: pa.y, w: a.w, h: a.h },
          { x: pb.x, y: pb.y, w: b.w, h: b.h },
        );
        if (!hit) continue;

        // Push along the cheaper axis, in the direction that is already
        // further away — the side b is mostly on.
        if (hit.dy <= hit.dx) {
          pb.y += pb.y + b.h / 2 >= pa.y + a.h / 2 ? hit.dy : -hit.dy;
        } else {
          pb.x += pb.x + b.w / 2 >= pa.x + a.w / 2 ? hit.dx : -hit.dx;
        }
        pb.x = Math.max(0, pb.x);
        pb.y = Math.max(0, pb.y);
        settled.add(b.id);
        moved = true;
      }
    }

    if (!moved) break;
  }

  return nodes.map((n) => {
    const p = pos.get(n.id)!;
    return p.x === n.x && p.y === n.y ? n : { ...n, x: p.x, y: p.y };
  });
}
