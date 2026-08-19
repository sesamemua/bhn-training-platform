import test from "node:test";
import assert from "node:assert/strict";
import { runReview } from "../../src/lib/flowchart/review";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { ChartDoc, FlowNode } from "../../src/lib/flowchart/types";

const statusOf = (doc: ChartDoc, id: string) => {
  const r = runReview(doc).find((x) => x.id === id);
  assert.ok(r, `no review item ${id}`);
  return r.status;
};

/** The seed with one node swapped in or its fields doctored. */
const doctored = (mutate: (nodes: FlowNode[]) => FlowNode[]): ChartDoc => ({
  ...TRAINING_WEEK_FLOW,
  nodes: mutate(structuredClone(TRAINING_WEEK_FLOW.nodes) as FlowNode[]),
});

test("the shipped chart answers the note", () => {
  const byId = Object.fromEntries(runReview(TRAINING_WEEK_FLOW).map((r) => [r.id, r.status]));
  assert.deepEqual(byId, {
    "training-week-only": "met",
    "trainee-gate": "met",
    "drop-institution-free-text": "met",
    "institution-dropdown": "met",
    "one-primary-institution": "met",
    "category-replaced": "met",
    "definitions-in-question": "met",
    "hospitals-included": "met",
    "position-dropdown": "met",
    // The note asks a question here rather than making a request, so
    // the honest status is a standing flag, not a green tick.
    "expertise-clarify": "attention",
    "symposium-participant-q": "out-of-scope",
    "relevant-questions": "met",
    "standardised-data": "met",
  });
});

test("a symposium mention flips the separation check", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) => (n.id === "n16" ? { ...n, text: "Attends the symposium" } : n)),
  );
  assert.equal(statusOf(doc, "training-week-only"), "missed");
});

test("bringing back the old Category menu is caught", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) =>
      n.id === "n5"
        ? {
            ...n,
            field: { key: "category", type: "choice", options: ["Industry", "Academia", "Government"] },
          }
        : n,
    ),
  );
  assert.equal(statusOf(doc, "category-replaced"), "missed");
});

test("a free-text institution question is caught", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) =>
      n.id === "n5"
        ? { ...n, field: { key: "institution_company", type: "text", required: true } }
        : n,
    ),
  );
  assert.equal(statusOf(doc, "drop-institution-free-text"), "missed");
});

test("making every institution question unconditional loses the one-primary guarantee", () => {
  const doc: ChartDoc = {
    ...TRAINING_WEEK_FLOW,
    edges: TRAINING_WEEK_FLOW.edges.map((e) => (e.id === "e4a" ? { ...e, when: undefined } : e)),
    nodes: TRAINING_WEEK_FLOW.nodes,
  };
  assert.equal(statusOf(doc, "one-primary-institution"), "attention");
});

test("stripping the definitions from the questions is caught", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) =>
      n.id === "n3b"
        ? { ...n, fields: n.fields!.map((f) => ({ ...f, help: undefined })) }
        : n,
    ),
  );
  assert.equal(statusOf(doc, "definitions-in-question"), "missed");
});

test("a required free-text position title is caught", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) =>
      n.id === "n7"
        ? { ...n, fields: [...n.fields!, { key: "position_title", type: "text" as const, required: true }] }
        : n,
    ),
  );
  assert.equal(statusOf(doc, "position-dropdown"), "missed");
});

test("dropping the expertise flag note keeps the row on attention, with the evidence changed", () => {
  const doc = doctored((nodes) => nodes.filter((n) => n.id !== "n5r"));
  const r = runReview(doc).find((x) => x.id === "expertise-clarify")!;
  assert.equal(r.status, "attention");
  assert.match(r.evidence, /nothing on the chart records/i);
});

test("a symposium-participant question creeping in is caught", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) =>
      n.id === "n5"
        ? { ...n, field: { key: "participant", type: "choice", options: ["Attendee", "Speaker", "Exhibitor"] } }
        : n,
    ),
  );
  assert.equal(statusOf(doc, "symposium-participant-q"), "missed");
});
