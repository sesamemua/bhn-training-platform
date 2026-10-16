import assert from "node:assert/strict";
import test from "node:test";
import { EmailHistoryAddresses, recordedEmailRecipients } from "../../src/lib/allocation/email-history";

const audit = (email: string, state: string) => ({ detail: JSON.stringify({ email, state }) });

test("any recorded send counts, normalized by actual recipient across registrations", () => {
  const sent = recordedEmailRecipients(
    [" PERSON@example.ca ", "legacy@example.ca", "no-mail@example.ca", ""],
    [{ to: "person@EXAMPLE.ca" }, { to: "person@example.ca" }, { to: "unrelated@example.ca" }, { to: "" }],
    [audit(" Legacy@EXAMPLE.ca ", "sent")],
  );
  assert.deepEqual([...sent], ["person@example.ca", "legacy@example.ca"]);
});

test("queued, failed, held, unconfigured and redirected test messages are not recipient sends", () => {
  const states = ["failed", "not-configured", "sent-to-you", "no-address", "queued", "held"];
  const addresses = states.map((_, i) => `person${i}@example.ca`);
  assert.equal(recordedEmailRecipients(addresses, [], states.map((state, i) => audit(addresses[i], state))).size, 0);
  assert.deepEqual([...recordedEmailRecipients(["admin@example.ca", "intended@example.ca"], [{ to: "admin@example.ca" }], [audit("intended@example.ca", "sent-to-you")])], ["admin@example.ca"]);
});

test("malformed historical audit records do not invent a communication or fail the list", () => {
  const audits = [null, "bad JSON", "null", "[]", JSON.stringify({ email: 1, state: "sent" }), JSON.stringify({ email: "person@example.ca" })].map((detail) => ({ detail }));
  assert.equal(recordedEmailRecipients(["person@example.ca"], [], audits).size, 0);
  assert.deepEqual([...recordedEmailRecipients(["person@example.ca"], [], [...audits, audit("person@example.ca", "sent")])], ["person@example.ca"]);
});

test("server lookup input is bounded and rejects unexpected structures", () => {
  assert.deepEqual(EmailHistoryAddresses.parse([" PERSON@example.ca ", ""]), ["person@example.ca", ""]);
  for (const value of [null, { to: "person@example.ca" }, [123], ["x".repeat(321)], Array(5001).fill("p@example.ca")]) {
    assert.equal(EmailHistoryAddresses.safeParse(value).success, false);
  }
});
