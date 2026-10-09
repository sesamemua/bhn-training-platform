/** Saving a travel letter as a template puts the person's details back as merge fields. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseTravelTemplates, toTemplate } from "../../src/lib/travel/letter-templates";
import { render } from "../../src/lib/allocation/email-templates";

test("a letter to one person becomes a letter for anybody, and fills in again", () => {
  const vars = { first_name: "Al", name: "Al Green", postcode: "M5V", travel_time: "about 15–45 minutes" };
  const written = "Hello Al,\n\nAl Green — your postal code M5V is about 15–45 minutes away. We also need your route.";
  const tpl = toTemplate(written, vars);
  assert.equal(tpl, "Hello {{first_name}},\n\n{{name}} — your postal code {{postcode}} is {{travel_time}} away. We also need your route.");
  assert.match(tpl, /We also need/, "a short name does not rewrite other words");
  const next = render(tpl, { first_name: "Bea", name: "Bea Li", postcode: "K7L", travel_time: "about 2½ hours" });
  assert.equal(next.text, "Hello Bea,\n\nBea Li — your postal code K7L is about 2½ hours away. We also need your route.");
  assert.deepEqual(next.missing, []);
});

test("a field already in the text is left alone, and nothing saved is an empty list", () => {
  assert.equal(toTemplate("Hello {{first_name}}, Amara here.", { first_name: "Amara" }), "Hello {{first_name}}, {{first_name}} here.");
  assert.deepEqual(parseTravelTemplates("not json"), []);
  assert.deepEqual(parseTravelTemplates(null), []);
});
