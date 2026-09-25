/** Postal code → how far from 144 College Street, and how it reads. */
import test from "node:test";
import assert from "node:assert/strict";
import { travelFromPostcode, travelWords } from "../../src/lib/travel/from-postcode";

const band = (code: string) => travelFromPostcode(code)?.band;

test("the bug this exists for: a downtown postal code is never a two-hour journey", () => {
  // Both of these were on the travel follow-up list.
  assert.equal(band("M5S 1A1"), "local");
  assert.equal(band("M5T"), "local");
  assert.equal(band("m6g2t6"), "local");
});

test("Toronto is always inside two hours, Scarborough included", () => {
  for (const c of ["M1B", "M1X", "M9V", "M2N", "M4Y"]) {
    assert.equal(band(c), "local", `${c} should be local`);
  }
});

test("the cases worth a human: Oshawa, Barrie, Kitchener, Peterborough", () => {
  for (const c of ["L1J", "L4N", "N2L", "K9H", "L9C"]) {
    assert.equal(band(c), "borderline", `${c} should be borderline`);
  }
});

test("clearly beyond two hours: London, Ottawa, Windsor, and out of province", () => {
  for (const c of ["N6A", "K1A", "N9B", "H2X", "V6B", "B3H"]) {
    assert.equal(band(c), "far", `${c} should be far`);
  }
});

test("the longest matching prefix wins", () => {
  // L4 is Vaughan and Barrie at once; only the three-character rules
  // can tell a 40-minute morning from a two-hour one.
  assert.equal(band("L4K"), "local");
  assert.equal(band("L4N"), "borderline");
});

test("nothing is claimed about a code the table does not know", () => {
  assert.equal(travelFromPostcode("Z9Z"), null);
  assert.equal(travelFromPostcode("M5"), null);
  assert.equal(travelFromPostcode(""), null);
  assert.equal(travelFromPostcode("hello"), null);
});

test("it talks in bands, never in false precision", () => {
  assert.equal(travelWords(travelFromPostcode("M5S")!), "about 15\u201345 minutes");
  assert.equal(travelWords(travelFromPostcode("L4N")!), "over 1½ hours");
  assert.match(travelWords(travelFromPostcode("K1A")!), /^over /);
  // No estimate anywhere reads like a routing result.
  for (const c of ["M1B", "L1J", "N2L", "L0A", "P7B"]) {
    assert.doesNotMatch(travelWords(travelFromPostcode(c)!), /\d{1,2}:\d\d|\b\d{2,3} min\b/);
  }
});
