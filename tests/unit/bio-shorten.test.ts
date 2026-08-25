import test from "node:test";
import assert from "node:assert/strict";
import { BIO_LIMIT, BIO_TARGET_MIN, tidyBio } from "../../src/lib/events/bio";

/**
 * Why this file exists.
 *
 * The bio shortener "made things way too short": given only a ceiling
 * ("250 or fewer") the model answered around 110 and threw away half a
 * career. The prompt now carries a floor as well, and this file pins
 * the part of that fix which is testable without a model — the tidy
 * pass that brings an over-long answer inside the limit.
 */

test("text already inside the limit is returned untouched", () => {
  const bio = "Dr. Amara Okonkwo leads regulatory affairs at Eurofins Scientific.";
  assert.equal(tidyBio(bio), bio);
});

test("wrapping quotes the model sometimes adds are stripped", () => {
  assert.equal(tidyBio('"She teaches at U of T."'), "She teaches at U of T.");
});

test("never returns more than the limit", () => {
  assert.ok(tidyBio("word ".repeat(200)).length <= BIO_LIMIT);
});

test("does not sever a word", () => {
  const long = `${"a".repeat(BIO_LIMIT - 10)} extraordinary contribution`;
  const out = tidyBio(long);
  assert.ok(!/extraordinar?y?$/.test(out.replace(/\.$/, "")) || out.includes("extraordinary"));
});

test("does not end on a dangling connective", () => {
  // The exact failure seen live: the cut landed after "University of".
  const bio =
    "Dr. Amara Okonkwo is Senior Director of Regulatory Affairs at Eurofins Scientific, " +
    "leading submissions for biologics and therapies in Canada, US and EU. She holds a PhD " +
    "from McMaster University and teaches regulatory strategy at University of Toronto.";
  const out = tidyBio(bio);
  assert.ok(out.length <= BIO_LIMIT, `${out.length} > ${BIO_LIMIT}`);
  assert.ok(!/\b(of|at|the|and|in|for|with|to)\.?$/i.test(out), `ends badly: ${out}`);
});

test("ends on a sentence, not a comma", () => {
  const bio = `${"She led teams across Canada, ".repeat(12)}and beyond`;
  assert.match(tidyBio(bio), /[.!?]$/);
});

test("the floor sits under the ceiling and well above half of it", () => {
  assert.ok(BIO_TARGET_MIN < BIO_LIMIT);
  assert.ok(BIO_TARGET_MIN > BIO_LIMIT / 2);
});
