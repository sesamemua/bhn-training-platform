import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormFillView } from "../../src/components/workspace/FormFillView";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import type { BuiltForm } from "../../src/lib/formbuilder/types";

/**
 * The registrant's view, rendered.
 *
 * First paint only — renderToStaticMarkup does not run effects or
 * clicks — which is exactly the moment that matters: what a person
 * meets before they have told us anything. A conditional question
 * visible here is visible to everybody.
 */
const paint = (doc: BuiltForm, title = "Training Week 2026 registration") =>
  renderToStaticMarkup(React.createElement(FormFillView, { doc, title }));

const html = paint(TRAINING_WEEK_FORM);

test("it says, on the page, that nothing is submitted", () => {
  // An admin will show this to a colleague. A colleague who thinks they
  // have registered is worse off than one who never saw it.
  assert.match(html, /nothing is sent and nobody is registered/);
});

test("the form opens with the question it is supposed to open with", () => {
  assert.match(html, /Are you a current BioHubNet trainee\?/);
});

test("questions behind an answer are not shown before that answer", () => {
  // The trainee follow-ups are gated on trainee = Yes. If they paint,
  // every registrant sees them and the logic is decoration.
  for (const hidden of ["The name we know you by", "The email registered with BioHubNet", "Which programmes are you in?"]) {
    assert.ok(!html.includes(hidden), `"${hidden}" is showing before it should`);
  }
});

test("the confirmation question is not on the registration form at all", () => {
  // Stage, not a rule that might accidentally be true. It goes out by
  // email once a place is approved.
  assert.ok(!html.includes("Can you still make it?"));
});

test("the consent question is rendered as its own statement", () => {
  assert.match(html, /I agree to be photographed/);
  assert.match(html, /type="radio"/);
});

test("required questions are marked", () => {
  assert.match(html, /title="Required"/);
});

test("there is a way to submit, and it is checked for real", () => {
  assert.match(html, /Submit registration/);
  assert.match(html, /Checked for real\. Sent nowhere\./);
});

test("the second stage is offered, because this form has one", () => {
  assert.match(html, /The email after approval/);
});

test("a form with no confirmation questions offers no stage switch", () => {
  const oneStage: BuiltForm = {
    ...TRAINING_WEEK_FORM,
    fields: TRAINING_WEEK_FORM.fields.filter((f) => f.stage !== "confirmation"),
  };
  assert.ok(!paint(oneStage).includes("The email after approval"));
});

test("an empty form says so rather than rendering a bare page", () => {
  const empty: BuiltForm = { ...TRAINING_WEEK_FORM, fields: [] };
  assert.match(paint(empty), /No questions in this part of the form yet/);
});

test("every question a registrant can see at first paint is numbered", () => {
  const shown = TRAINING_WEEK_FORM.fields.filter(
    (f) => (f.stage ?? "registration") === "registration" && f.showWhen.length === 0,
  );
  assert.ok(shown.length > 10, "sanity: the form is not nearly empty");
  const numbers = html.match(/font-mono text-\[11px\] text-subtle">\d+</g) ?? [];
  // Consent carries its statement instead of a numbered heading.
  const numbered = shown.filter((f) => f.type !== "consent").length;
  assert.equal(numbers.length, numbered);
});

test("the title shown is the form's own, not a placeholder", () => {
  assert.match(paint(TRAINING_WEEK_FORM, "Something else entirely"), /Something else entirely/);
});
