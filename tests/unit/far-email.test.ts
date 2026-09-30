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

test("every institution is placed with a band: local, borderline or far", async () => {
  const { institutionOf } = await import("../../src/lib/travel/far-email");
  assert.equal(institutionOf("a@mail.utoronto.ca")?.band, "local");
  assert.equal(institutionOf("a@uwaterloo.ca")?.band, "borderline");
  assert.equal(institutionOf("a@queensu.ca")?.band, "far");
  assert.equal(institutionOf("a@gmail.com"), null);
});
