/** Tent cards: one per requirement, allergies first and in red, workshops named. */
import test from "node:test";
import assert from "node:assert/strict";
import { isAllergy, tentCards, tentCardsHtml } from "../../src/lib/allocation/tent-cards";
import type { Entry } from "../../src/lib/allocation/catering";

const e = (workshop: string, start: string, dietary: string[], dietaryOther = ""): Entry => ({
  workshopId: workshop, workshop, start, personKey: `${workshop}${dietary}`, name: "X", dietary, dietaryOther, accessibility: "",
});

test("one card per requirement, listing each workshop once, allergies first", () => {
  const cards = tentCards([
    e("Pandemic Preparedness", "2026-10-26T13:00:00Z", ["Halal"]),
    e("Company tour", "2026-10-26T16:00:00Z", ["Halal", "Nut allergy"]),
    e("Pandemic Preparedness", "2026-10-26T13:00:00Z", ["Halal"], "Sesame — carries an EpiPen"),
  ]);
  assert.deepEqual(cards.map((c) => [c.label, c.allergy]), [["Nut allergy", true], ["Sesame — carries an EpiPen", true], ["Halal", false]]);
  assert.deepEqual(cards.find((c) => c.label === "Halal")!.workshops, ["Pandemic Preparedness", "Company tour"]);
});

test("coeliac is an allergy card; vegetarian and lactose are not", () => {
  assert.equal(isAllergy("Gluten-free / coeliac"), true);
  assert.equal(isAllergy("Vegetarian"), false);
  assert.equal(isAllergy("Dairy-free / lactose intolerant"), false);
});

test("the page escapes what people typed", () => {
  const html = tentCardsHtml(tentCards([e("W", "2026-10-26T13:00:00Z", [], "<b>no pork</b>")]), "Cards");
  assert.ok(html.includes("&lt;b&gt;no pork&lt;/b&gt;"));
  assert.ok(!html.includes("<b>no pork</b>"));
});
