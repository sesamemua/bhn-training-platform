import test from "node:test";
import assert from "node:assert/strict";
import { receiptLine, type Receipt } from "../../src/lib/formbuilder/receipt";

const mail = { to: "amara@example.org", subject: "s", body: "b" };

test("every outcome says something a person can act on", () => {
  const all: Receipt[] = [
    { state: "sent", preview: mail },
    { state: "sent-to-you", preview: mail },
    { state: "not-configured", preview: mail },
    { state: "failed", why: "connection refused", preview: mail },
    { state: "no-address" },
    { state: "no-template" },
    { state: "unfilled", missing: ["first_name"] },
  ];
  for (const r of all) {
    const line = receiptLine(r);
    assert.ok(line.length > 20, `${r.state} says almost nothing: "${line}"`);
  }
});

test("a failure says the registration is still safe", () => {
  // Somebody told the email failed will assume the whole thing did, and
  // register again.
  assert.match(receiptLine({ state: "failed", why: "timeout", preview: mail }), /safely recorded/i);
});

test("a test says the letter went to the tester, not to the form's address", () => {
  const line = receiptLine({ state: "sent-to-you", preview: mail });
  assert.match(line, /test/i);
  assert.match(line, /rather than to the address on the form/i);
});

test("a real send names where it went", () => {
  assert.match(receiptLine({ state: "sent", preview: mail }), /amara@example\.org/);
});

test("nothing at all is one empty line, not a crash", () => {
  assert.equal(receiptLine(undefined), "");
});
