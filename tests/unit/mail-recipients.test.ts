import test from "node:test";
import assert from "node:assert/strict";
import { normaliseMailRecipients } from "../../src/lib/mail";

test("mail recipient lists trim addresses and drop empty entries", () => {
  assert.deepEqual(
    normaliseMailRecipients([" info@biohubnet.ca ", "", " engage@biohubnet.ca "]),
    ["info@biohubnet.ca", "engage@biohubnet.ca"],
  );
  assert.deepEqual(normaliseMailRecipients(" applicant@example.org "), ["applicant@example.org"]);
  assert.deepEqual(normaliseMailRecipients(), []);
});
