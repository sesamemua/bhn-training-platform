/** A far-away university address is spotted; lookalikes and nearby schools are not. */
import test from "node:test";
import assert from "node:assert/strict";
import { farSchoolOf } from "../../src/lib/travel/far-email";

test("far universities, subdomains included", () => {
  assert.equal(farSchoolOf("19vn@queensu.ca")?.city, "Kingston");
  assert.equal(farSchoolOf("Julia.Manalil@MAIL.MCGILL.CA")?.school, "McGill University");
  assert.equal(farSchoolOf("x@cmail.carleton.ca")?.city, "Ottawa");
});

test("nearby schools, lookalikes and junk are not flagged", () => {
  assert.equal(farSchoolOf("a@mail.utoronto.ca"), null);
  assert.equal(farSchoolOf("a@yorku.ca"), null);
  assert.equal(farSchoolOf("a@notqueensu.ca"), null);
  assert.equal(farSchoolOf("queensu.ca"), null);
  assert.equal(farSchoolOf(""), null);
});
