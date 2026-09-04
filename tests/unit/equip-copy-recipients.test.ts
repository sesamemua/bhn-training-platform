import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmailList, DEFAULT_COPY_RECIPIENTS } from "../../src/lib/equip/emails";

// sanitizeEmailList is the validation the admin-editable "internal copy
// recipients" setting leans on (getEquipCopyRecipients /
// saveEquipCopyRecipients, lib/equip/emails.ts) — those two are DB-backed
// and not unit-testable here, but the pure validation is.

test("keeps only well-formed, lowercased, deduplicated addresses", () => {
  assert.deepEqual(
    sanitizeEmailList(["Info@BioHubNet.ca", " equip@biohubnet.ca ", "info@biohubnet.ca"]),
    ["info@biohubnet.ca", "equip@biohubnet.ca"],
  );
});

test("drops malformed entries and non-strings instead of throwing", () => {
  assert.deepEqual(
    sanitizeEmailList(["not-an-email", "", "  ", 42, null, "ok@biohubnet.ca"]),
    ["ok@biohubnet.ca"],
  );
});

test("non-array input yields an empty list", () => {
  assert.deepEqual(sanitizeEmailList(undefined), []);
  assert.deepEqual(sanitizeEmailList("info@biohubnet.ca"), []);
});

test("caps the list rather than accepting an unbounded number of addresses", () => {
  const many = Array.from({ length: 20 }, (_, i) => `person${i}@biohubnet.ca`);
  assert.equal(sanitizeEmailList(many, 3).length, 3);
});

test("shipped defaults match the historically hardcoded addresses", () => {
  assert.deepEqual(DEFAULT_COPY_RECIPIENTS, {
    venture_connect: ["info@biohubnet.ca", "equip@biohubnet.ca"],
    innovation_fellowship: ["info@biohubnet.ca", "engage@biohubnet.ca"],
  });
});
