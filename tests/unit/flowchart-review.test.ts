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
    "trainee-vs-account": "met",
    "trainee-priority": "met",
    "trainee-apply-or-register": "met",
    "trainee-email-check": "met",
    // Waiting on the sheet itself, which the coordinator will provide.
    "roster-sheet-configured": "attention",
    "trainee-status-backend": "met",
    "non-trainee-continues": "met",
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

test("pasting the roster sheet link turns its row green", () => {
  const doc: ChartDoc = {
    ...TRAINING_WEEK_FLOW,
    settings: { rosterSheetUrl: "https://docs.google.com/spreadsheets/d/abc123/edit" },
  };
  assert.equal(statusOf(doc, "roster-sheet-configured"), "met");
});

test("the trainee gate must come first, not merely exist", () => {
  // Move the gate's question into a later box: still asked, still
  // required, but no longer the first thing anybody answers.
  const doc = doctored((nodes) =>
    nodes
      .map((n) => (n.id === "nT" ? { ...n, field: undefined, kind: "step" as const } : n))
      .map((n) =>
        n.id === "n7"
          ? { ...n, fields: [...n.fields!, { key: "trainee", type: "yesno" as const, required: true, help: "ENGAGE, EXPERIENCE or EQUIP." }] }
          : n,
      ),
  );
  assert.equal(statusOf(doc, "trainee-gate"), "missed");
});

test("dropping a programme name from the gate is caught", () => {
  const doc = doctored((nodes) =>
    nodes.map((n) =>
      n.id === "nT"
        ? { ...n, field: { ...n.field!, help: "Accepted into ENGAGE or EXPERIENCE." } }
        : n,
    ),
  );
  assert.equal(statusOf(doc, "trainee-gate"), "missed");
});

test("losing the priority statement is caught", () => {
  const doc = doctored((nodes) =>
    nodes
      .map((n) => (n.id === "nT" ? { ...n, field: { ...n.field!, help: "ENGAGE, EXPERIENCE or EQUIP. An account is not the same thing." } } : n))
      .filter((n) => n.id !== "nPri"),
  );
  assert.equal(statusOf(doc, "trainee-priority"), "missed");
});

test("asking everyone for the trainee email, not just claimants, is caught", () => {
  const doc: ChartDoc = {
    ...TRAINING_WEEK_FLOW,
    edges: TRAINING_WEEK_FLOW.edges.map((e) => (e.id === "eT1" ? { ...e, when: undefined } : e)),
  };
  assert.equal(statusOf(doc, "trainee-email-check"), "attention");
});

test("a trainee not found on the roster must not be a dead end", () => {
  const doc: ChartDoc = {
    ...TRAINING_WEEK_FLOW,
    edges: TRAINING_WEEK_FLOW.edges.filter((e) => e.id !== "eT9"),
  };
  assert.equal(statusOf(doc, "non-trainee-continues"), "missed");
});

test("removing the roster record breaks the verification check", () => {
  const doc = doctored((nodes) => nodes.filter((n) => n.id !== "nTroster"));
  assert.equal(statusOf(doc, "trainee-email-check"), "missed");
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
