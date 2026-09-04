import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleAdsSendTo } from "../../src/lib/campaign/google-ads-conversions";

test("buildGoogleAdsSendTo returns a valid conversion destination", () => {
  assert.equal(
    buildGoogleAdsSendTo(" AW-18353525375 ", " engage-label "),
    "AW-18353525375/engage-label",
  );
});

test("buildGoogleAdsSendTo rejects incomplete or invalid configuration", () => {
  assert.equal(buildGoogleAdsSendTo("", "label"), null);
  assert.equal(buildGoogleAdsSendTo("G-123", "label"), null);
  assert.equal(buildGoogleAdsSendTo("AW-18353525375", ""), null);
});
