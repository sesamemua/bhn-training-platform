import test from "node:test";
import assert from "node:assert/strict";
import { emailKey, sameMailbox } from "../../src/lib/eligibility/email-key";

/**
 * Registration BLOCKS on a non-match, which makes every rule here the
 * difference between a real applicant getting in and a real applicant
 * emailing a coordinator instead. Each case below is a way the same
 * human writes their address differently on two different days.
 */

test("the same address in different cases is the same mailbox", () => {
  assert.ok(sameMailbox("Jane.Doe@UTORONTO.ca", "jane.doe@utoronto.ca"));
});

test("whitespace and stray punctuation from a spreadsheet cell", () => {
  assert.equal(emailKey("  jane@x.com  "), "jane@x.com");
  assert.equal(emailKey('"jane@x.com"'), "jane@x.com");
  assert.equal(emailKey("jane@x.com,"), "jane@x.com");
  assert.equal(emailKey("“jane@x.com”"), "jane@x.com");
});

test("a display name pasted with the address", () => {
  assert.equal(emailKey("Jane Doe <jane@x.com>"), "jane@x.com");
  assert.equal(emailKey("mailto:jane@x.com"), "jane@x.com");
});

test("zero-width characters from a copied web page", () => {
  assert.equal(emailKey("jane​@x.com"), "jane@x.com");
});

test("a UofT address under either of its two names", () => {
  assert.ok(sameMailbox("jane@mail.utoronto.ca", "jane@utoronto.ca"));
});

test("alumni is a different population and must not be folded in", () => {
  assert.ok(!sameMailbox("jane@alumni.utoronto.ca", "jane@utoronto.ca"));
});

test("a plus tag is the same mailbox, at any domain", () => {
  assert.ok(sameMailbox("jane+equip@x.com", "jane@x.com"));
  assert.ok(sameMailbox("jane+anything@utoronto.ca", "jane@utoronto.ca"));
});

test("Gmail ignores dots; an institution does not", () => {
  assert.ok(sameMailbox("jane.doe@gmail.com", "janedoe@gmail.com"));
  assert.ok(sameMailbox("jane.doe@googlemail.com", "janedoe@gmail.com"));
  // Two genuinely different people at a university that uses first.last.
  assert.ok(!sameMailbox("jane.doe@utoronto.ca", "janedoe@utoronto.ca"));
});

test("nonsense gives null rather than a key that matches something", () => {
  for (const bad of ["", "   ", "jane", "@x.com", "jane@", "jane@x", "jane doe@x.com",
                     "jane@@x.com", "+tag@x.com", "jane@.com", "jane@x."]) {
    assert.equal(emailKey(bad), null, `${JSON.stringify(bad)} should not produce a key`);
  }
});

test("null never matches null", () => {
  // Two unusable inputs are not the same person.
  assert.ok(!sameMailbox("nonsense", "nonsense"));
  assert.ok(!sameMailbox("", ""));
});

test("two different people stay different", () => {
  assert.ok(!sameMailbox("jane@x.com", "john@x.com"));
  assert.ok(!sameMailbox("jane@x.com", "jane@y.com"));
});

test("a LIKE wildcard in an address is just a character", () => {
  // This repo has been bitten by case-insensitive matching compiling to
  // ILIKE with _ and % passing straight through as wildcards. The key
  // is compared with plain equality, so they are literal here.
  assert.equal(emailKey("jane_doe@x.com"), "jane_doe@x.com");
  assert.ok(!sameMailbox("jane_doe@x.com", "janexdoe@x.com"));
  assert.ok(!sameMailbox("%@x.com", "anyone@x.com"));
});
