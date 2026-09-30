/** Tent cards label the food: diets by name, allergies as "Contains …" in red. */
import test from "node:test";
import assert from "node:assert/strict";
import { cardsFor, tentCards, tentCardsHtml } from "../../src/lib/allocation/tent-cards";
import type { Entry } from "../../src/lib/allocation/catering";

const e = (workshop: string, dietary: string[], dietaryOther = ""): Entry => ({
  workshopId: workshop, workshop, start: "2026-10-26T13:00:00Z", personKey: `${workshop}${dietary}${dietaryOther}`, name: "X", dietary, dietaryOther, accessibility: "",
});

test("each requirement becomes the card for the platter", () => {
  assert.deepEqual(cardsFor("Halal"), [{ label: "Halal", contains: false }]);
  assert.deepEqual(cardsFor("Vegetarian"), [{ label: "Vegetarian", contains: false }]);
  assert.deepEqual(cardsFor("Allergic to kiwi"), [{ label: "Kiwi", contains: true }]);
  assert.deepEqual(cardsFor("Lactose intolerant"), [{ label: "Lactose", contains: true }]);
  assert.deepEqual(cardsFor("Dairy-free / lactose intolerant"), [{ label: "Lactose", contains: true }]);
  assert.deepEqual(cardsFor("Nut allergy"), [{ label: "Nuts", contains: true }]);
  assert.deepEqual(cardsFor("Gluten-free / coeliac"), [{ label: "Gluten", contains: true }]);
  assert.deepEqual(cardsFor("strawberry allergy"), [{ label: "Strawberry", contains: true }]);
  assert.deepEqual(cardsFor("No pork please"), []);
});

test("one card per platter label, warnings first; unreadable Other text is kept for by hand", () => {
  const { cards, byHand } = tentCards([
    e("Pandemic Preparedness", ["Halal"]),
    e("Company tour", ["Halal"], "Allergic to kiwi"),
    e("Company tour", [], "Vegetarian"),
    e("Company tour", [], "No pork please"),
  ]);
  assert.deepEqual(cards.map((c) => [c.label, c.contains]), [["Kiwi", true], ["Halal", false], ["Vegetarian", false]]);
  assert.deepEqual(cards.find((c) => c.label === "Halal")!.workshops, ["Pandemic Preparedness", "Company tour"]);
  assert.deepEqual(byHand, [{ text: "No pork please", workshop: "Company tour" }]);
});

test("the page says Contains on warnings, and escapes what people typed", () => {
  const html = tentCardsHtml(tentCards([e("W", [], "Allergic to kiwi"), e("W", [], "<b>no pork</b>")]), "Cards");
  assert.ok(html.includes(">Contains<"));
  assert.ok(html.includes("&lt;b&gt;no pork&lt;/b&gt;"));
  assert.ok(!html.includes("<b>no pork</b>"));
});
