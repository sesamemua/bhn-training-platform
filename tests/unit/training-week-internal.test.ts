/** Who is internal: staff and listed guests, never a trainee by accident. */
import test from "node:test";
import assert from "node:assert/strict";
import { internalKeys, isInternal, parseInternal } from "../../src/lib/training-week/internal";

const LIST = parseInternal(JSON.stringify([
  { name: "Darius Example", email: "darius.example@utoronto.ca" },
  { name: "Gilbert Example", email: "" },
  { name: "", email: "nobody@x.ca" }, // unreadable: no name
]));
const KEYS = internalKeys(LIST);

test("the list keeps readable people only", () => {
  assert.deepEqual(LIST.map((p) => p.name), ["Darius Example", "Gilbert Example"]);
  assert.deepEqual(parseInternal("not json"), []);
});

test("a listed guest is internal whichever address shape they register with", () => {
  assert.equal(isInternal(["Darius.Example@mail.utoronto.ca"], {}, KEYS), true);
  assert.equal(isInternal([null, "darius.example@utoronto.ca"], {}, KEYS), true);
});

test("any biohubnet.ca address is internal without being listed", () => {
  assert.equal(isInternal(["engage@biohubnet.ca"], {}, KEYS), true);
  assert.equal(isInternal(["Someone@BioHubNet.ca"], {}, KEYS), true);
});

test("a registration an admin made from the list is internal, address or not", () => {
  assert.equal(isInternal([""], { __internal: true }, KEYS), true);
});

test("a trainee is not internal", () => {
  assert.equal(isInternal(["amara.okonkwo@mail.utoronto.ca"], { __internal: "yes" }, KEYS), false);
  assert.equal(isInternal([], null, KEYS), false);
  // Not fooled by a lookalike domain.
  assert.equal(isInternal(["x@notbiohubnet.ca.evil.com"], {}, KEYS), false);
});
