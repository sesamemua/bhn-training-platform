/** Per-session Open / Full / Closed: what the form disables and the server refuses. */
import test from "node:test";
import assert from "node:assert/strict";
import { SESSIONS, optionLabel } from "../../src/lib/training-week/schedule-2026";
import { messageOf, parseStatusMap, shutOptions, shutProblems, statusOf } from "../../src/lib/training-week/workshop-status";
import type { BuiltForm } from "../../src/lib/formbuilder/types";

const [a, b] = SESSIONS;
const optA = optionLabel(a), optB = optionLabel(b);

test("unset is open; empty message falls back to the default", () => {
  const map = parseStatusMap(JSON.stringify({ [a.slug]: { state: "full", message: "" }, [b.slug]: { state: "closed", message: "Moved to 2027." } }));
  assert.equal(statusOf(map, "nope").state, "open");
  assert.equal(messageOf(statusOf(map, a.slug)), "This session is full.");
  assert.equal(messageOf(statusOf(map, b.slug)), "Moved to 2027.");
  assert.deepEqual(parseStatusMap("garbage"), {});
});

test("shut options are keyed by the form's option string", () => {
  const map = { [a.slug]: { state: "full" as const, message: "" } };
  assert.deepEqual(Object.keys(shutOptions([optA, optB], map)), [optA]);
  assert.equal(shutOptions([optA], map)[optA].label, "Full");
});

test("a submission asking for a shut session is refused, one line each", () => {
  const doc = { fields: [{ key: "sessions", type: "multi", options: [optA, optB], slots: [{ option: optA }, { option: optB }] }] } as unknown as BuiltForm;
  const map = { [b.slug]: { state: "closed" as const, message: "" } };
  assert.deepEqual(shutProblems(doc, { sessions: [optA] }, map), []);
  const p = shutProblems(doc, { sessions: [optA, optB] }, map);
  assert.equal(p.length, 1);
  assert.match(p[0], /Registration for this session is closed\. Please take it off your choices\./);
});
