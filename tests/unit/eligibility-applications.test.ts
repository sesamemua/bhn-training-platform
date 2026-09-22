import test from "node:test";
import assert from "node:assert/strict";
import { applicationKeys, PLATFORM_SOURCE_ID } from "../../src/lib/eligibility/check";
import { eligibilitySource } from "../../src/lib/eligibility/sources";

test("an application is reachable at its own address or its account's", () => {
  // A public VentureConnect application carries applicantEmail and no
  // account; one made while signed in is the other way round.
  const keys = applicationKeys([
    { applicantEmail: "Alexa.Chew@alumni.utoronto.ca", user: null },
    { applicantEmail: null, user: { email: "s.mirzaie@utoronto.ca" } },
    { applicantEmail: "draft@example.com", user: { email: "account@example.com" } },
  ]);
  assert.deepEqual([...keys].sort(), [
    "account@example.com", "alexa.chew@alumni.utoronto.ca", "draft@example.com", "s.mirzaie@utoronto.ca",
  ]);
});

test("the same person applying twice is one mailbox, normalised like the roster", () => {
  const keys = applicationKeys([
    { applicantEmail: "zhengyanyan.li@mail.utoronto.ca", user: null },
    { applicantEmail: "Zhengyanyan.Li@utoronto.ca", user: null },
    { applicantEmail: "someone+equip@gmail.com", user: null },
    { applicantEmail: "some.one@gmail.com", user: null },
    { applicantEmail: "not an address", user: null },
    { applicantEmail: null, user: null },
  ]);
  assert.deepEqual([...keys].sort(), ["someone@gmail.com", "zhengyanyan.li@utoronto.ca"]);
});

test("the live list is a source like any other, granting EQUIP", () => {
  const source = eligibilitySource(PLATFORM_SOURCE_ID);
  assert.ok(source, "the platform list is missing from the sources");
  assert.deepEqual(source.programmes, ["EQUIP"]);
  assert.equal(source.access, "platform");
});
