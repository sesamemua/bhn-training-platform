import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_ROUND_KEY,
  QUOTE_WORDS_KEY,
  checkAwardee,
  clampQuoteWords,
  parseRound,
  photoTypeOf,
  settingsFrom,
} from "../../src/lib/knowledge-exchange/intake";

const answers: Record<string, string> = {
  fullName: " Amara Okonkwo ",
  projectTitle: "Faster biologics purification",
  projectSummary: "A membrane that halves downstream purification time.",
  homeInstitution: "University of Toronto",
  hostInstitution: "CCRM",
  hostDepartment: "Process Development",
  quote: "I want to learn how a lab result becomes a product people can use.",
  linkedin: "",
};
const get = (over: Record<string, string> = {}) => (k: string) => ({ ...answers, ...over })[k];

test("settings start at Round 5 with a 40-word quote, and follow what an admin saved", () => {
  assert.deepEqual(settingsFrom([]), { round: 5, quoteMaxWords: 40 });
  assert.deepEqual(
    settingsFrom([{ key: CURRENT_ROUND_KEY, value: "6" }, { key: QUOTE_WORDS_KEY, value: "60" }]),
    { round: 6, quoteMaxWords: 60 },
  );
  assert.equal(parseRound("0"), null);
  assert.equal(parseRound("5.5"), null);
  assert.equal(clampQuoteWords("3"), 10);
  assert.equal(clampQuoteWords("900"), 200);
  assert.equal(clampQuoteWords("abc"), null);
});

test("a complete submission is trimmed, and LinkedIn is optional", () => {
  const r = checkAwardee(get(), 40);
  assert.ok(r.ok);
  assert.equal(r.answers.fullName, "Amara Okonkwo");
  assert.equal(r.answers.linkedinUrl, null);
  const withLink = checkAwardee(get({ linkedin: "linkedin.com/in/amara" }), 40);
  assert.ok(withLink.ok && withLink.answers.linkedinUrl === "linkedin.com/in/amara");
});

test("every other question is required, and the quote is held to the admin's word limit", () => {
  const blank = checkAwardee(get({ hostDepartment: "  " }), 40);
  assert.deepEqual(blank, { ok: false, error: "Please fill in “Host department”." });
  const long = checkAwardee(get({ quote: "word ".repeat(12) }), 10);
  assert.deepEqual(long, { ok: false, error: "Please keep your answer to 10 words — yours is 12." });
  assert.equal(checkAwardee(get({ quote: "" }), 40).ok, false);
});

test("a photo is recognised by its bytes, not by what it claims to be", () => {
  assert.equal(photoTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(photoTypeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "image/png");
  assert.equal(photoTypeOf(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(photoTypeOf(new TextEncoder().encode("<html><script>")), null);
});
