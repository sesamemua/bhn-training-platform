import test from "node:test";
import assert from "node:assert/strict";
import { registrantName } from "../../src/lib/allocation/registrant-name";

test("full name first, then v1 first/last, then trainee_name; empty when none", () => {
  assert.equal(registrantName({ full_name: "Ana Diaz", first_name: "X" }), "Ana Diaz");
  assert.equal(registrantName({ first_name: "Ana", last_name: "Diaz" }), "Ana Diaz");
  assert.equal(registrantName({ trainee_name: "Ana" }), "Ana");
  assert.equal(registrantName({ full_name: "   " }), "");
  assert.equal(registrantName(null), "");
});
