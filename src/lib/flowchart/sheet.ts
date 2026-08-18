/**
 * Edits the data-sheet view makes to a chart.
 *
 * Every one takes a document and returns a new one, so the grid can run
 * the same code in the editor window and in the popped-out panel — the
 * panel computes the result locally and sends the whole document back,
 * rather than the two windows growing separate half-implementations of
 * "remove a question".
 *
 * A question lives in a box (`nodeId`) at a position (`index`) in that
 * box's `fields`. Both matter: order inside a box is the order the form
 * asks, and which box it is in decides when it is asked at all.
 */
import { fieldsOf } from "./form";
import type { ChartDoc, FieldDef, FlowNode } from "./types";

/** Rewrite one node's questions, normalising onto `fields`. */
function withFields(doc: ChartDoc, nodeId: string, fn: (f: FieldDef[]) => FieldDef[]): ChartDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === nodeId ? { ...n, fields: fn(fieldsOf(n)), field: undefined } : n,
    ),
  };
}

export function setFieldValue(
  doc: ChartDoc,
  nodeId: string,
  index: number,
  patch: Partial<FieldDef>,
): ChartDoc {
  return withFields(doc, nodeId, (fs) => fs.map((f, i) => (i === index ? { ...f, ...patch } : f)));
}

export function removeFieldAt(doc: ChartDoc, nodeId: string, index: number): ChartDoc {
  return withFields(doc, nodeId, (fs) => fs.filter((_, i) => i !== index));
}

/** A new question at the end of a box, with a key that is not taken. */
export function addFieldTo(doc: ChartDoc, nodeId: string, key = "answer"): ChartDoc {
  const taken = new Set(doc.nodes.flatMap((n) => fieldsOf(n).map((f) => f.key)));
  let k = key;
  let i = 2;
  while (taken.has(k)) k = `${key}_${i++}`;
  return withFields(doc, nodeId, (fs) => [...fs, { key: k, type: "text" }]);
}

/** Move a question up or down inside its own box. */
export function moveFieldWithin(doc: ChartDoc, nodeId: string, from: number, to: number): ChartDoc {
  return withFields(doc, nodeId, (fs) => {
    if (from < 0 || from >= fs.length || to < 0 || to >= fs.length || from === to) return fs;
    const next = [...fs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

/**
 * Move a question into a different box, at the end of it.
 *
 * Rejected when the target is not a question box: a limit or a decision
 * has no form fields, and silently dropping the question there would lose
 * it from the form without saying so.
 */
export function moveFieldToNode(
  doc: ChartDoc,
  fromNodeId: string,
  index: number,
  toNodeId: string,
): ChartDoc {
  if (fromNodeId === toNodeId) return doc;
  const from = doc.nodes.find((n) => n.id === fromNodeId);
  const to = doc.nodes.find((n) => n.id === toNodeId);
  if (!from || !to || to.kind !== "question") return doc;

  const field = fieldsOf(from)[index];
  if (!field) return doc;

  const pulled = withFields(doc, fromNodeId, (fs) => fs.filter((_, i) => i !== index));
  return withFields(pulled, toNodeId, (fs) => [...fs, field]);
}

/** Boxes a question can be moved into. */
export function questionNodes(doc: ChartDoc): FlowNode[] {
  return doc.nodes.filter((n) => n.kind === "question");
}
