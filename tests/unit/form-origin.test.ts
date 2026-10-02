/** Where a registration came from, from Vercel's headers; and the postcode rule. */
import test from "node:test";
import assert from "node:assert/strict";
import { originFrom, placeOf, postcodePrefix } from "../../src/lib/formbuilder/origin";

test("reads the first forwarded IP and Vercel's area, decoding the city", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-vercel-ip-city": "S%C3%A3o%20Paulo", "x-vercel-ip-country-region": "SP", "x-vercel-ip-country": "BR" });
  const o = originFrom(h);
  assert.equal(o.ip, "203.0.113.7");
  assert.equal(placeOf(o), "São Paulo, SP, BR");
  assert.equal(placeOf(originFrom(new Headers())), null);
});

test("a postcode is a letter, a digit, a letter — kept as those three", () => {
  assert.equal(postcodePrefix("m5v 3l9"), "M5V");
  assert.equal(postcodePrefix(" K7L "), "K7L");
  assert.equal(postcodePrefix("12345"), null);
  assert.equal(postcodePrefix(""), null);
});
