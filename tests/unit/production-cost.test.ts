/** The promo-video budget matches the vendor quotes to the cent. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  COST_GROUPS, LUNCH_GUESTS, buildCostGroups, groupTotal, parseLunchGuests, subtotal, totals,
} from "../../src/lib/video/production-cost";

const group = (key: string, groups = COST_GROUPS) => groups.find((g) => g.key === key)!;

test("2D House quote without the Atlas lens", () => {
  const cam = group("camera");
  // Quote 263434: sub-total $2,270.79, of which the Atlas Mercury is $255.00.
  assert.equal(cam.lines.reduce((s, l) => s + l.amount, 0), 227079, "every quoted line, lens included");
  assert.equal(subtotal(cam), 201579);
  assert.equal(cam.tax, 26205);
  assert.equal(groupTotal(cam), 227784);
});

test("CamArt quote 1237 plus Darek's parking, after tax", () => {
  const sound = group("sound");
  const parking = sound.lines.find((l) => /parking/i.test(l.label))!;
  assert.equal(parking.amount, 2200);
  assert.equal(groupTotal(sound) - parking.amount, 124300, "the quote's balance due, $1,243.00");
  assert.equal(sound.tax, 14300, "HST on the services only, not the parking");
  assert.equal(groupTotal(group("lens")), 57715, "$577.15 all-in");
});

test("mileage at $0.57/km, three days, plus three days' parking", () => {
  const m = group("mileage");
  assert.deepEqual(m.lines.map((l) => l.amount), [4925, 2936, 4925, 6600]);
  assert.equal(groupTotal(m), 19386);
  assert.equal(m.tax, 0);
});

test("insurance is struck out: no premium on U of T rental agreements", () => {
  const ins = group("insurance");
  assert.ok(ins.lines.every((l) => l.removed));
  assert.equal(groupTotal(ins), 0);
});

test("lunch follows the list: each name off is $25 off", () => {
  const full = totals();
  assert.equal(full.total, 461807);
  const nine = buildCostGroups(LUNCH_GUESTS.slice(1));
  assert.equal(full.total - totals(nine).total, 2500);
  assert.deepEqual(group("catering", nine).lines[0].people, LUNCH_GUESTS.slice(1));
  assert.equal(full.pre + full.tax, full.total);
  assert.equal(full.quoted + full.estimated, full.total);
});

test("a saved lunch list reads back safely", () => {
  assert.deepEqual(parseLunchGuests('["Molly","Darius"]'), ["Molly", "Darius"]);
  assert.equal(parseLunchGuests(null), undefined, "nothing saved → the default list");
  assert.equal(parseLunchGuests("not json"), undefined);
  assert.deepEqual(parseLunchGuests('["Molly", 3, null]'), ["Molly"]);
  assert.deepEqual(parseLunchGuests("[]"), [], "an emptied list stays empty");
});
