import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../fixtures/training-week-v2-oct13.json";
import { openTrainingWeekRegistration, OPEN_TRAINING_WEEK_COPY, OPEN_TRAINING_WEEK_OPTIONS } from "../../src/lib/formbuilder/training-week-open-registration";
import { visibleFields, walk } from "../../src/lib/formbuilder/logic";
import { checkSubmission } from "../../src/lib/formbuilder/submit";
import { V2_ACCEPTED, V2_EQUIP_APPLIED, V2_HAS_ACCOUNT, V2_NO_ACCOUNT } from "../../src/lib/formbuilder/training-week-v2";
const slug = "training-week-registration-2026-v2";

test("new participants reach session selection and pass the same server validation as program participants", () => {
  const doc = openTrainingWeekRegistration(slug, fixture);
  for (const bhn_status of OPEN_TRAINING_WEEK_OPTIONS) {
    const answers = { bhn_status, full_name: "Test Applicant", trainee_email: "test@example.org",
      sessions: [doc.fields.find((f) => f.key === "sessions")!.options[2]],
      symposium_signup: "No — I do not plan to attend" };
    const visible = visibleFields(doc, answers);
    assert.ok(visible.some((f) => f.key === "sessions"));
    assert.ok(!visible.some((f) => f.stopsHere));
    assert.equal(checkSubmission(doc, answers).ok, true);
    assert.ok(!walk(doc, answers).some((p) => p.step.id === "w_declined"));
    assert.equal(walk(doc, answers).some((p) => p.step.id === "w_roster"), bhn_status !== V2_NO_ACCOUNT);
  }
  assert.equal(checkSubmission(doc, { bhn_status: V2_NO_ACCOUNT }).ok, false);
  assert.equal(checkSubmission(doc, { bhn_status: V2_HAS_ACCOUNT }).ok, false);
});

test("copy, options and stopping notes change; schedule, stored answer values and other coordinator edits survive", () => {
  const before = structuredClone(fixture);
  const doc = openTrainingWeekRegistration(slug, fixture);
  assert.deepEqual(fixture, before);
  assert.deepEqual(doc.fields.find((f) => f.key === "bhn_status")?.options, [V2_ACCEPTED, V2_EQUIP_APPLIED, V2_NO_ACCOUNT]);
  assert.equal(doc.fields.find((f) => f.key === "bhn_status")?.help, OPEN_TRAINING_WEEK_COPY);
  assert.equal(doc.presentation?.facts?.find((f) => f.label === "Who can register")?.text, OPEN_TRAINING_WEEK_COPY);
  assert.deepEqual(doc.fields.find((f) => f.key === "sessions")?.slots, fixture.fields.find((f) => f.key === "sessions")?.slots);
  assert.equal(doc.submitNote, fixture.submitNote);
  assert.deepEqual(doc.steps.find((s) => s.id === "w_trainee"), fixture.steps.find((s) => s.id === "w_trainee"));
  assert.deepEqual(openTrainingWeekRegistration(slug, doc), doc);
});

test("archived versions and unexpected form rules cannot be silently rewritten", () => {
  assert.throws(() => openTrainingWeekRegistration("training-week-registration-2026", fixture));
  const changed = structuredClone(fixture);
  (changed.fields.find((f) => f.key === "bhn_status")!.options as string[]).push("Unexpected status");
  assert.throws(() => openTrainingWeekRegistration(slug, changed));
});
