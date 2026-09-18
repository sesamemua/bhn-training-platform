/** The promo-video budget matches the vendor quotes to the cent. */
import test from "node:test";
import assert from "node:assert/strict";
import { COST_GROUPS, groupTotal, subtotal, totals } from "../../src/lib/video/production-cost";

const group = (key: string) => COST_GROUPS.find((g) => g.key === key)!;

test("2D House quote without the Atlas lens", () => {
  const cam = group("camera");
  // Quote 263434: sub-total $2,270.79, of which the Atlas Mercury is $255.00.
  assert.equal(cam.lines.reduce((s, l) => s + l.amount, 0), 227079, "every quoted line, lens included");
  assert.equal(subtotal(cam), 201579);
  assert.equal(cam.tax, 26205);
  assert.equal(groupTotal(cam), 227784);
});

test("CamArt quote 1237 and the William White lens", () => {
  assert.equal(groupTotal(group("sound")), 124300, "quote balance due $1,243.00");
  assert.equal(groupTotal(group("lens")), 57715, "$577.15 all-in");
});

test("grand total", () => {
  const t = totals();
  assert.equal(t.total, 494301);
  assert.equal(t.pre + t.tax, t.total);
  assert.equal(t.quoted + t.estimated, t.total);
});
