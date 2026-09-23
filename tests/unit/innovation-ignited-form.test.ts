import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildInnovationIgnited, INNOVATION_IGNITED_SLUG, INNOVATION_SESSION, SHARED_KEYS,
} from "../../src/lib/formbuilder/innovation-ignited";
import { parseForm } from "../../src/lib/formbuilder/types";
import { visibleFields, missing } from "../../src/lib/formbuilder/logic";
import { optionLabel } from "../../src/lib/training-week/schedule-2026";

/* Built from the same fixture the v2 tests use: a real Training Week
   document, so "shared" means shared with something that exists. */
const source = parseForm(
  JSON.parse(readFileSync(resolve("tests/unit/fixtures/training-week-v1-live.json"), "utf8")).fields,
);
const { doc, shared, problems } = buildInnovationIgnited(source);
const keys = doc.fields.map((f) => f.key);

test("it asks the six things, and takes four of them from Training Week", () => {
  assert.deepEqual(problems, []);
  assert.deepEqual(keys, [
    "full_name", "email", "position_title", "institution", "question", "dietary", "dietary_other",
  ]);
  // Not copies with the same words: the same question objects, so a
  // change to one form's wording reaches the other on the next build.
  // What the source does not carry — v1 never asked a name — is filled
  // in here rather than left out, and is not counted as shared.
  for (const key of shared) assert.ok((SHARED_KEYS as readonly string[]).includes(key));
  for (const key of shared) {
    assert.equal(doc.fields.find((f) => f.key === key)?.label, source.fields.find((f) => f.key === key)?.label);
  }
});

test("nobody is checked against a programme list here", () => {
  // The address is the registrant's own, not the one their programme
  // has on file — so none of the eligibility machinery has anything to
  // match on, which is what makes the session open.
  for (const gate of ["trainee_email", "bhn_status", "sessions"]) {
    assert.ok(!keys.includes(gate), `${gate} would turn this into a Training Week form`);
  }
  assert.equal(doc.fields.find((f) => f.key === "email")?.type, "email");
  assert.match(doc.fields.find((f) => f.key === "email")?.help ?? "", /does not have to be an institutional one/);
});

test("a rule may only name a question this form asks", () => {
  // The shared copies arrive carrying conditions about programme status
  // — a rule pointing at a question that is not here is a question
  // nobody can ever see.
  for (const f of doc.fields) {
    for (const c of f.showWhen) assert.ok(keys.includes(c.field), `${f.key} waits on ${c.field}, which is not asked`);
  }
  const open = visibleFields(doc, {}).map((f) => f.key);
  assert.deepEqual(open, keys.filter((k) => k !== "dietary_other"), "everything but the follow-up is asked at once");
  // Whatever the shared form calls its "something else" option is what
  // opens the follow-up here too.
  const other = doc.fields.find((f) => f.key === "dietary_other")?.showWhen[0]?.value ?? "";
  assert.ok(other, "the follow-up waits on nothing");
  assert.ok(visibleFields(doc, { dietary: [other] }).some((f) => f.key === "dietary_other"));
});

test("name, address, position and institution are required; the rest are not", () => {
  const gaps = missing(doc, {}).map((f) => f.key);
  assert.deepEqual(gaps, ["full_name", "email", "position_title", "institution"]);
  assert.equal(doc.fields.find((f) => f.key === "question")?.required, false, "accessibility is optional");
  assert.equal(doc.fields.find((f) => f.key === "dietary")?.required, false);
});

test("every registration books a seat in the same workshop as the week's own", () => {
  // The form has no calendar, so this is what makeSeats reads instead.
  assert.equal(doc.presentation?.session, optionLabel(INNOVATION_SESSION));
  assert.equal(INNOVATION_SESSION.slug, "innovation-showcase-2026");
  assert.equal(INNOVATION_IGNITED_SLUG, "innovation-ignited-2026");
});
