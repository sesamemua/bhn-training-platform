import test from "node:test";
import assert from "node:assert/strict";
import { ALL_SPEAKER_FIELDS, SPEAKER_FIELD_LABELS, speakerFields } from "../../src/lib/events/fields";

test("an event's flags are what the form asks", () => {
  assert.deepEqual(
    speakerFields({
      speakerAskSessionTitle: true,
      speakerAskSessionPitch: false,
      speakerAskLinkedin: true,
    }),
    { sessionTitle: true, sessionPitch: false, linkedin: true },
  );
});

test("each question is independent — turning one off leaves the others alone", () => {
  // The failure this exists to prevent: one decision applied to every
  // field at once, which is how the pitch and the LinkedIn URL both
  // disappeared in a single commit.
  const keys = ["sessionTitle", "sessionPitch", "linkedin"] as const;
  for (const off of keys) {
    const resolved = speakerFields({
      speakerAskSessionTitle: off !== "sessionTitle",
      speakerAskSessionPitch: off !== "sessionPitch",
      speakerAskLinkedin: off !== "linkedin",
    });
    assert.equal(resolved[off], false, `${off} should be off`);
    for (const other of keys) {
      if (other !== off) assert.equal(resolved[other], true, `${other} should be unaffected`);
    }
  }
});

test("an event we could not load asks everything rather than dropping an answer", () => {
  // Better an extra question than silently discarding something a
  // speaker typed, which is what a false default would do.
  assert.deepEqual(speakerFields(null), ALL_SPEAKER_FIELDS);
  assert.deepEqual(speakerFields(undefined), ALL_SPEAKER_FIELDS);
  assert.equal(Object.values(ALL_SPEAKER_FIELDS).every(Boolean), true);
});

test("every toggle the admin page renders maps to a real field", () => {
  const keys = Object.keys(ALL_SPEAKER_FIELDS).sort();
  assert.deepEqual(SPEAKER_FIELD_LABELS.map((f) => f.key).sort(), keys);
  for (const f of SPEAKER_FIELD_LABELS) {
    assert.ok(f.label.length > 0 && f.hint.length > 0, `${f.key} needs a label and a hint`);
  }
});
