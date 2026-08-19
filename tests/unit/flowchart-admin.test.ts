import assert from "node:assert/strict";
import test from "node:test";
import { adminColumns, parseSheetUrl, processStages, requiredKeys } from "../../src/lib/flowchart/admin";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { ChartDoc } from "../../src/lib/flowchart/types";

test("columns are the questions, in the order the form asks them", () => {
  const cols = adminColumns(TRAINING_WEEK_FLOW);
  assert.deepEqual(cols.slice(0, 3).map((c) => c.key), ["trainee", "trainee_name", "trainee_email"]);
  // Every column names the box it came from, so the header can group them.
  assert.equal(cols[1].group, "Confirm the details we know you by");
  assert.ok(cols.every((c) => c.label.length > 0 && c.key.length > 0));
});

test("stages are the boxes a person can sit in, and exclude questions and limits", () => {
  const stages = processStages(TRAINING_WEEK_FLOW);
  const labels = stages.map((s) => s.label);

  assert.ok(labels.includes("Added to the waitlist"));
  assert.ok(labels.includes("Eligible?"));
  assert.ok(labels.includes("Attends"));

  // A question is something you answer, not somewhere you wait.
  assert.ok(!labels.includes("About you"), "questions are not stages");
  // A limit is a constraint, not a place.
  assert.ok(!labels.some((l) => l.startsWith("Up to 3")), "limits are not stages");
  // Nor is the opening — a start is an event, not a state.
  assert.ok(!labels.includes("Registration opens"), "the start is not a stage");
});

test("stages come out in the order they happen, not array order", () => {
  const labels = processStages(TRAINING_WEEK_FLOW).map((s) => s.label);
  const at = (l: string) => labels.indexOf(l);
  assert.ok(at("Checked against the eligibility sheet") < at("Attends"));
  assert.ok(at("Seat confirmed, info pack emailed") < at("Attends"));
});

test("terminal stages are marked", () => {
  const stages = processStages(TRAINING_WEEK_FLOW);
  assert.equal(stages.find((s) => s.label === "Attends")?.terminal, true);
  assert.equal(stages.find((s) => s.label === "Added to the waitlist")?.terminal, false);
});

test("a chart with no stages yields none rather than throwing", () => {
  const doc: ChartDoc = {
    nodes: [{ id: "q", kind: "question", x: 0, y: 0, w: 190, h: 58, text: "Name",
      field: { key: "name", type: "text" } }],
    edges: [],
  };
  assert.deepEqual(processStages(doc), []);
  assert.equal(adminColumns(doc).length, 1);
});

test("required keys are the ones the panel can flag as missing", () => {
  const keys = requiredKeys(TRAINING_WEEK_FLOW);
  assert.ok(keys.includes("sessions"));
  assert.ok(keys.includes("media_consent"));
  assert.ok(!keys.includes("linkedin"), "an optional question is not flagged");
});

// ── the roster sheet link ───────────────────────────────────────────

test("a normal Google Sheets URL parses to its id", () => {
  const r = parseSheetUrl("https://docs.google.com/spreadsheets/d/1AbC-dEf_123/edit#gid=0");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.id, "1AbC-dEf_123");
    assert.equal(r.gid, "0");
  }
});

test("the messy forms people actually paste still parse", () => {
  const cases = [
    "https://docs.google.com/spreadsheets/d/1AbC-dEf_123",
    "https://docs.google.com/spreadsheets/d/1AbC-dEf_123/edit?usp=sharing",
    "  https://docs.google.com/spreadsheets/d/1AbC-dEf_123/edit#gid=1234567  ",
  ];
  for (const c of cases) {
    const r = parseSheetUrl(c);
    assert.equal(r.ok, true, `${c} should parse`);
    if (r.ok) assert.equal(r.id, "1AbC-dEf_123");
  }
});

test("anything that is not a Google Sheet is refused with a reason", () => {
  const bad: [string, RegExp][] = [
    ["", /Paste the link/],
    ["not a url", /not a link/],
    ["http://docs.google.com/spreadsheets/d/abc", /https/],
    ["https://example.com/spreadsheets/d/abc", /Google Sheets/],
    ["https://docs.google.com/document/d/abc/edit", /not to a spreadsheet/],
  ];
  for (const [input, reason] of bad) {
    const r = parseSheetUrl(input);
    assert.equal(r.ok, false, `${input} should be refused`);
    if (!r.ok) assert.match(r.reason, reason);
  }
});

test("a lookalike host is not accepted", () => {
  // notgoogle.com and google.com.evil.test must not pass the host check.
  for (const host of ["notgoogle.com", "google.com.evil.test", "evilgoogle.com"]) {
    const r = parseSheetUrl(`https://${host}/spreadsheets/d/1AbC`);
    assert.equal(r.ok, false, `${host} should be refused`);
  }
  // A real Google subdomain is fine.
  assert.equal(parseSheetUrl("https://docs.google.com/spreadsheets/d/1AbC").ok, true);
});
