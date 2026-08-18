/**
 * A number for every box, so one can be pointed at.
 *
 * "The third question" is ambiguous the moment two boxes ask three things
 * each; "box 7" is not. The number shows on the box, beside its questions
 * in the live form, in the data sheet and in the admin panel, so the same
 * label works whichever column someone is looking at.
 *
 * Numbered in READING order — down the page, then across — rather than by
 * following the arrows. Graph order is more meaningful in principle and
 * worse in practice: it jumps around the canvas, so checking that you are
 * looking at box 7 means tracing the whole flow. Reading order can be
 * verified by counting.
 *
 * The consequence is that moving a box renumbers it, and possibly its
 * neighbours. That is the honest behaviour for a positional number — it
 * always describes what is on screen — but it does mean a number is not a
 * durable name for a box across an editing session.
 */
import type { ChartDoc } from "./types";

/** Node id → its number, starting at 1. */
export function nodeNumbers(doc: ChartDoc): Map<string, number> {
  const order = [...doc.nodes].sort((a, b) => {
    // A row of boxes is anything within half a box-height of each other;
    // without the tolerance, two boxes meant to sit side by side get
    // numbered by a two-pixel difference nobody can see.
    const row = Math.min(a.h, b.h) / 2;
    if (Math.abs(a.y - b.y) > row) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });
  return new Map(order.map((n, i) => [n.id, i + 1]));
}
