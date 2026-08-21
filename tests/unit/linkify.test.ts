import test from "node:test";
import assert from "node:assert/strict";
import { hasLink, linkify } from "../../src/lib/formbuilder/linkify";

const hrefs = (s: string) => linkify(s).flatMap((p) => ("href" in p ? [p.href] : []));
const words = (s: string) => linkify(s).map((p) => p.text).join("");

test("a bare domain becomes a link, with a scheme added", () => {
  // Without the scheme the browser reads it as a path relative to the
  // admin page you are on, which goes nowhere.
  assert.deepEqual(hrefs("Read about all three at biohubnet.ca, then come back."), ["https://biohubnet.ca"]);
});

test("a full URL is left as it is", () => {
  assert.deepEqual(hrefs("Apply at https://biohubnet.ca/equip today"), ["https://biohubnet.ca/equip"]);
});

test("the sentence survives — nothing is lost or duplicated", () => {
  for (const s of [
    "Read about all three at biohubnet.ca, then come back to this form.",
    "No address in this one at all.",
    "https://example.org",
    "",
  ]) {
    assert.equal(words(s), s);
  }
});

test("a full stop after a domain is punctuation, not part of the address", () => {
  // "biohubnet.ca." resolves to nothing, and the reader sees a link
  // that fails for a reason they cannot see.
  assert.deepEqual(hrefs("Start at biohubnet.ca."), ["https://biohubnet.ca"]);
  assert.match(words("Start at biohubnet.ca."), /biohubnet\.ca\.$/);
});

test("a trailing comma, colon or bracket is not part of the address", () => {
  for (const [s, want] of [
    ["Go to biohubnet.ca, then return", "https://biohubnet.ca"],
    ["Go to biohubnet.ca; then return", "https://biohubnet.ca"],
    ["Go to biohubnet.ca: the front page", "https://biohubnet.ca"],
  ] as const) {
    assert.deepEqual(hrefs(s), [want]);
  }
});

test("a sentence naming the programmes is not mistaken for an address", () => {
  // "e.g. ENGAGE" and "EQUIP. EXPERIENCE" are the shapes that a naive
  // "any dotted word" rule turns into links.
  assert.deepEqual(hrefs("Apply to ENGAGE, EXPERIENCE or EQUIP. Both run on the platform."), []);
  assert.deepEqual(hrefs("e.g. an EQUIP application counts."), []);
  assert.equal(hasLink("No address here."), false);
});

test("two addresses in one sentence both become links", () => {
  assert.deepEqual(
    hrefs("Start at biohubnet.ca or read https://biohubnet.ca/equip first"),
    ["https://biohubnet.ca", "https://biohubnet.ca/equip"],
  );
});

test("an empty string is nothing, not a piece of nothing", () => {
  assert.deepEqual(linkify(""), []);
});
