import test from "node:test";
import assert from "node:assert/strict";
import {
  speakerLimits, clampWordLimit, targetMinFor, maxCharsFor,
  DEFAULT_LIMITS, WORD_LIMIT_MIN, WORD_LIMIT_MAX,
} from "../../src/lib/events/limits";
import { BIO_MAX_WORDS } from "../../src/lib/events/bio";
import { PITCH_MAX_WORDS } from "../../src/lib/events/pitch";

/**
 * The word limit is an admin setting now, per event. These pin the two
 * things that make that safe: null still means the shipped default, and
 * a number an admin types can never make the form impossible to submit.
 */

test("an event nobody has touched keeps the platform defaults", () => {
  const l = speakerLimits({ speakerBioMaxWords: null, speakerPitchMaxWords: null });
  assert.equal(l.bio, BIO_MAX_WORDS);
  assert.equal(l.pitch, PITCH_MAX_WORDS);
  assert.deepEqual(l, DEFAULT_LIMITS);
});

test("a missing event is not a crash", () => {
  assert.deepEqual(speakerLimits(null), DEFAULT_LIMITS);
  assert.deepEqual(speakerLimits(undefined), DEFAULT_LIMITS);
});

test("a stored limit is used as given", () => {
  const l = speakerLimits({ speakerBioMaxWords: 80, speakerPitchMaxWords: 40 });
  assert.equal(l.bio, 80);
  assert.equal(l.pitch, 40);
});

test("either limit can be set on its own", () => {
  const l = speakerLimits({ speakerBioMaxWords: 300, speakerPitchMaxWords: null });
  assert.equal(l.bio, 300);
  assert.equal(l.pitch, PITCH_MAX_WORDS);
});

test("a number below the floor is raised, not accepted", () => {
  // A limit of 3 would make the form impossible to submit — the
  // minimum a bio must meet is higher than that.
  assert.equal(clampWordLimit(3), WORD_LIMIT_MIN);
  assert.equal(speakerLimits({ speakerBioMaxWords: 1, speakerPitchMaxWords: null }).bio, WORD_LIMIT_MIN);
});

test("an absurd number is capped", () => {
  assert.equal(clampWordLimit(999999), WORD_LIMIT_MAX);
});

test("clearing the box means the default, not zero", () => {
  assert.equal(clampWordLimit(""), null);
  assert.equal(clampWordLimit(null), null);
  assert.equal(clampWordLimit(0), null);
  assert.equal(clampWordLimit(-40), null);
  assert.equal(clampWordLimit("not a number"), null);
});

test("a typed string is accepted, since it comes from a form", () => {
  assert.equal(clampWordLimit("120"), 120);
  assert.equal(clampWordLimit(" 120 "), 120);
  assert.equal(clampWordLimit(120.6), 121);
});

test("the shortener's floor scales with the limit", () => {
  // A fixed floor of 200 against a limit an admin moved to 80 would
  // demand the model pad rather than shorten.
  assert.equal(targetMinFor(250), 200);
  assert.equal(targetMinFor(80), 64);
  assert.ok(targetMinFor(WORD_LIMIT_MIN) <= WORD_LIMIT_MIN, "the floor must never exceed the ceiling");
  for (const n of [WORD_LIMIT_MIN, 50, 120, 250, 600, WORD_LIMIT_MAX]) {
    assert.ok(targetMinFor(n) <= n, `floor ${targetMinFor(n)} above ceiling ${n}`);
  }
});

test("the character backstop tracks the limit", () => {
  assert.ok(maxCharsFor(80) < maxCharsFor(250));
  // Generous enough that it can never reject something the word rule
  // would accept: 40 characters per word against an English average of six.
  assert.ok(maxCharsFor(80) / 80 >= 20);
});

test("the bounds are ordered and sane", () => {
  assert.ok(WORD_LIMIT_MIN > 0);
  assert.ok(WORD_LIMIT_MIN < WORD_LIMIT_MAX);
  assert.ok(WORD_LIMIT_MIN <= PITCH_MAX_WORDS);
  assert.ok(WORD_LIMIT_MAX >= BIO_MAX_WORDS);
});
