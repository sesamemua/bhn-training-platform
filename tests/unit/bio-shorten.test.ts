import test from "node:test";
import assert from "node:assert/strict";
import {
  BIO_MAX_WORDS,
  BIO_TARGET_MIN_WORDS,
  BIO_INPUT_MAX_WORDS,
  countWords,
  tidyBio,
} from "../../src/lib/events/bio";

/**
 * Why this file exists.
 *
 * The speaker bio limit is 250 WORDS. It used to be 250 characters —
 * about forty words — which is a caption, not a biography. Every
 * length rule in the feature is now counted the way a person counting
 * would, and this file pins that counting plus the tidy pass that
 * brings an over-long AI suggestion inside the limit.
 */

const sentence = (n: number) => Array.from({ length: n }, (_, i) => `word${i + 1}`).join(" ");

test("counts whitespace-delimited words", () => {
  assert.equal(countWords("Jane Doe leads regulatory affairs"), 5);
});

test("collapses runs of whitespace and newlines", () => {
  assert.equal(countWords("  Jane   Doe\n\nleads\tregulatory affairs  "), 5);
});

test("pasted invisible separators do not turn each line into one word", () => {
  const pasted = "Jane\u200BDoe\u200Bleads\nregulatory\u2060affairs";
  assert.equal(countWords(pasted), 5);
});

test("a hyphenated compound is one word, as it is in Word", () => {
  assert.equal(countWords("state-of-the-art bioreactor"), 2);
});

test("an abbreviation with dots is one word", () => {
  assert.equal(countWords("She holds a Ph.D."), 4);
});

test("stray punctuation is not a word", () => {
  assert.equal(countWords("Jane Doe — scientist"), 3);
  assert.equal(countWords("   "), 0);
});

test("text inside the limit is returned untouched", () => {
  const bio = "Dr. Amara Okonkwo leads regulatory affairs at Eurofins Scientific.";
  assert.equal(tidyBio(bio), bio);
});

test("a bio at exactly the limit is left alone", () => {
  const bio = sentence(BIO_MAX_WORDS);
  assert.equal(countWords(tidyBio(bio)), BIO_MAX_WORDS);
});

test("wrapping quotes the model sometimes adds are stripped", () => {
  assert.equal(tidyBio('"She teaches at U of T."'), "She teaches at U of T.");
});

test("never returns more than the limit", () => {
  const out = tidyBio(sentence(BIO_MAX_WORDS * 3));
  assert.ok(countWords(out) <= BIO_MAX_WORDS, `${countWords(out)} > ${BIO_MAX_WORDS}`);
});

test("does not end on a dangling connective", () => {
  // The exact failure seen live at the old limit: the cut landed after
  // "University of". Counting in words does not make that go away.
  const bio = `${sentence(BIO_MAX_WORDS - 1)} of Toronto and several other places`;
  const out = tidyBio(bio);
  assert.ok(countWords(out) <= BIO_MAX_WORDS);
  assert.ok(!/\b(of|at|the|and|in|for|with|to)\.?$/i.test(out), `ends badly: ${out}`);
});

test("ends on a sentence, not a comma", () => {
  const bio = `${"She led teams across Canada, ".repeat(120)}and beyond`;
  assert.match(tidyBio(bio), /[.!?]$/);
});

test("keeps a real prose bio readable when it has to cut", () => {
  const para =
    "Dr. Amara Okonkwo is Senior Director of Regulatory Affairs at Eurofins Scientific in " +
    "Mississauga, where she leads a team of fourteen across submissions for biologics and " +
    "advanced therapies in Canada, the United States and the European Union. ";
  const out = tidyBio(para.repeat(10));
  assert.ok(countWords(out) <= BIO_MAX_WORDS);
  assert.ok(countWords(out) > BIO_MAX_WORDS - 15, "should use nearly all the room it has");
  assert.match(out, /[.!?]$/);
});

test("the bounds are ordered and sane", () => {
  assert.ok(BIO_TARGET_MIN_WORDS > 0);
  assert.ok(BIO_TARGET_MIN_WORDS < BIO_MAX_WORDS);
  assert.ok(BIO_MAX_WORDS < BIO_INPUT_MAX_WORDS);
  // The floor exists to stop over-compression; a floor below half the
  // ceiling would not stop anything.
  assert.ok(BIO_TARGET_MIN_WORDS > BIO_MAX_WORDS / 2);
});

test("paragraph breaks inside the kept text survive the cut", () => {
  const para = `${Array.from({ length: 120 }, (_, i) => `w${i}`).join(" ")}.`;
  const bio = `${para}\n\n${para}\n\nand a third paragraph that will not fit at all here`;
  const out = tidyBio(bio);
  assert.ok(countWords(out) <= BIO_MAX_WORDS);
  assert.ok(out.includes("\n\n"), "the blank line between paragraphs was flattened");
});

test("a word after a newline is still seen when walking the tail back", () => {
  const bio = `${Array.from({ length: BIO_MAX_WORDS - 1 }, (_, i) => `w${i}`).join(" ")}\nof Toronto`;
  assert.ok(!/\bof\.?$/i.test(tidyBio(bio)));
});
