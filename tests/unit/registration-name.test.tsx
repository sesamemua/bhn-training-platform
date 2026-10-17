import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nameReviewKey, registrationName, workshopNameField } from "../../src/lib/formbuilder/registration-name";
import { RegistrationNameInput } from "../../src/components/forms/RegistrationNameInput";
import { Question } from "../../src/components/workspace/FormFillView";
import { checkSubmission } from "../../src/lib/formbuilder/submit";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import { buildInnovationIgnited } from "../../src/lib/formbuilder/innovation-ignited";
import { FieldSchema, type BuiltForm } from "../../src/lib/formbuilder/types";

const field = FieldSchema.parse({ id: "badge_name", key: "full_name", label: "Full name", type: "short_text", required: true });
const doc: BuiltForm = { ...TRAINING_WEEK_FORM, fields: [field], presentation: { session: "Innovation Ignited" } };

test("normalization removes extra spacing without changing spelling, accents or case", () => {
  assert.equal(registrationName("  E\u0301lodie   de la Cruz  ", "full_name").value, "Élodie de la Cruz");
  assert.equal(registrationName("Mary-Jane O’Neill", "full_name").suggestion, undefined);
  for (const name of ["王小明", "عائشة أحمد", "José Núñez", "Renée van der Meer", "Jean-Luc D'Amour"]) {
    const result = registrationName(name, "full_name");
    assert.equal(result.value, name);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.warnings, []);
  }
});

test("capitalization is an optional suggestion and never silently applied", () => {
  for (const raw of ["AMARA OKONKWO", "amara okonkwo"]) {
    const result = registrationName(raw, "full_name");
    assert.equal(result.value, raw);
    assert.equal(result.suggestion, "Amara Okonkwo");
    assert.ok(result.warnings.length);
  }
  assert.equal(registrationName("CT Murphy", "full_name").suggestion, undefined);
});

test("organization names, incomplete names, initials, repetitions and titles ask for review", () => {
  for (const name of ["HI³", "HI3", "University of Toronto", "AstraZeneca Canada", "Amara", "Yasmine N", "Amara Amara", "Dr Amara Okonkwo", "Amara 123"]) {
    assert.ok(registrationName(name, "full_name").warnings.length, name);
  }
});

test("email addresses, URLs, markup, controls, numbers-only, non-string and overlong names are refused", () => {
  for (const raw of ["amara@example.org", "https://example.org", "www.example.org", "<b>Amara</b>", "Amara\u0000Okonkwo", "Amara\u202eOkonkwo", "12345", "😀", { name: "Amara" }, ["Amara"], "A".repeat(161)]) {
    assert.ok(registrationName(raw, "full_name").error, JSON.stringify(raw));
  }
});

test("server requires review of the current name, but allows genuine single names and preferred casing", () => {
  for (const name of ["Amara", "AMARA OKONKWO"]) {
    assert.equal(checkSubmission(doc, { full_name: name }).ok, false);
    assert.equal(checkSubmission(doc, { full_name: name, [nameReviewKey("full_name")]: "an earlier name" }).ok, false);
    const accepted = checkSubmission(doc, { full_name: name, [nameReviewKey("full_name")]: name });
    assert.equal(accepted.ok, true, accepted.problems.join("; "));
    assert.deepEqual(accepted.clean, { full_name: name });
  }
  assert.equal(checkSubmission(doc, { full_name: "bad@example.org", [nameReviewKey("full_name")]: "bad@example.org" }).ok, false);
});

test("normal names are cleaned server-side and need no extra confirmation", () => {
  assert.deepEqual(checkSubmission(doc, { full_name: "  Amara   Okonkwo  " }).clean, { full_name: "Amara Okonkwo" });
  assert.equal(checkSubmission(doc, { full_name: "Amara Okonkwo" }).ok, true);
});

test("checks are scoped to workshop names, including old split-name forms and Innovation Ignited", () => {
  assert.equal(workshopNameField(doc, field), true);
  for (const f of TRAINING_WEEK_FORM.fields.filter(f => ["first_name", "last_name"].includes(f.key))) assert.equal(workshopNameField(TRAINING_WEEK_FORM, f), true);
  const ignited = buildInnovationIgnited(TRAINING_WEEK_FORM).doc;
  assert.equal(workshopNameField(ignited, ignited.fields.find(f => f.key === "full_name")!), true);
  const other: BuiltForm = { version: 1, fields: [field], sources: [], steps: [] };
  assert.equal(workshopNameField(other, field), false);
  assert.equal(checkSubmission(other, { full_name: "Amara" }).ok, true);
});

test("hidden and confirmation-stage names do not block registration", () => {
  const hidden = { ...doc, fields: [{ ...field, showWhen: [{ field: "other", op: "is" as const, value: "yes" }] }] };
  assert.equal(checkSubmission(hidden, { full_name: "bad@example.org" }).ok, true);
  const later = { ...doc, fields: [{ ...field, stage: "confirmation" as const }] };
  assert.equal(checkSubmission(later, { full_name: "bad@example.org" }).ok, true);
});

test("the name input has an accessible badge preview and correct autocomplete without recasing", () => {
  const html = renderToStaticMarkup(createElement(RegistrationNameInput, { field, answers: { full_name: "AMARA OKONKWO" }, set: () => {}, className: "input" }));
  assert.match(html, /aria-label="Full name"/);
  assert.match(html, /autoComplete="name"/);
  assert.match(html, /maxLength="160"/);
  assert.match(html, /Name for your badge/);
  assert.match(html, /AMARA OKONKWO/);
  assert.doesNotMatch(html, /value="Amara Okonkwo"/);
  const question = renderToStaticMarkup(createElement(Question, { doc, field, index: 1, answers: { full_name: "Amara Okonkwo" }, set: () => {}, flagged: false }));
  assert.match(question, /Name for your badge/);
});
