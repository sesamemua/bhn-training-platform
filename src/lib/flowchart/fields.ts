/**
 * Moving a question up or down within its box.
 *
 * Two things this deliberately does NOT do, both learned the hard way.
 *
 * It does not move a question into the box above or below. A box with
 * ONE question shows that BOX's text as the question's label (see
 * `labelFor` in form.ts), so a question that crosses a boundary arrives
 * wearing its new box's name: moving "Contact" up put a name-and-email
 * field under the heading "Are you a current BioHubNet trainee?". A move
 * that renames the thing being moved is worse than a move that is
 * refused.
 *
 * And it does not silently do nothing at the boundaries. The first
 * question in a box has no "up" — but an arrow that looks alive and
 * ignores the click is indistinguishable from a broken feature, which
 * is exactly how this looked when the arrows were also hidden until
 * hover. `moveBounds` tells the caller which arrows to grey out and,
 * with them, why.
 *
 * Reordering the STEPS themselves is a different gesture, done on the
 * chart by redrawing the arrows.
 *
 * Pure `doc -> doc`, so the behaviour can be tested without a form.
 */
import { fieldsOf } from "./form";
import type { ChartDoc, FieldDef } from "./types";

/** Rewrite one node's questions, normalising onto `fields`. */
function withFields(doc: ChartDoc, nodeId: string, fn: (f: FieldDef[]) => FieldDef[]): ChartDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === nodeId ? { ...n, fields: fn(fieldsOf(n)), field: undefined } : n,
    ),
  };
}

/**
 * Swap the question at `index` with its neighbour inside the same box.
 *
 * Returns the document unchanged at either end, so a caller can compare
 * by identity to know whether anything happened.
 */
export function moveFieldInForm(
  doc: ChartDoc,
  nodeId: string,
  index: number,
  dir: -1 | 1,
): ChartDoc {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return doc;
  const fields = fieldsOf(node);
  const to = index + dir;
  if (index < 0 || index >= fields.length || to < 0 || to >= fields.length) return doc;

  return withFields(doc, nodeId, (fs) => {
    const next = [...fs];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
  });
}

/**
 * Which arrows this question should offer, and what to say when it
 * cannot move — the reason is the useful half.
 */
export function moveBounds(doc: ChartDoc, nodeId: string, index: number) {
  const node = doc.nodes.find((n) => n.id === nodeId);
  const count = node ? fieldsOf(node).length : 0;
  const alone = count < 2;
  return {
    canMoveUp: index > 0,
    canMoveDown: index >= 0 && index < count - 1,
    /** Why the up arrow is dead, in words a person can act on. */
    upReason: alone
      ? "The only question in this step — move the step itself on the chart"
      : "Already first in this step",
    downReason: alone
      ? "The only question in this step — move the step itself on the chart"
      : "Already last in this step",
  };
}
