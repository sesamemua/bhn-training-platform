import assert from "node:assert/strict";
import test from "node:test";
import { MERCH, allCategories, orderedTiers } from "../../src/lib/merch/types";
import {
  EMPTY_FILTERS,
  buildQuoteEmail,
  estimateSpend,
  filterItems,
  formatCad,
} from "../../src/lib/merch/filter";

test("the catalogue is internally consistent", () => {
  assert.equal(MERCH.items.length, 25);

  const ids = MERCH.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "item ids must be unique");

  for (const i of MERCH.items) {
    const tier = MERCH.tiers[String(i.tier)];
    assert.ok(tier, `item ${i.id} has tier ${i.tier} with no matching tier entry`);
    assert.equal(i.tierKey, tier.key, `item ${i.id} tierKey disagrees with its tier`);
    assert.ok(i.estUnitCostCad.low <= i.estUnitCostCad.high, `${i.id} has low > high`);
    assert.match(i.productUrl, /^https:\/\//, `${i.id} productUrl is not absolute`);
    // Prose is rendered as authored, so it must actually be there.
    for (const field of ["whyItWorks", "decoration", "watchOut"] as const) {
      assert.ok(i[field].trim().length > 0, `${i.id} is missing ${field}`);
    }
  }

  assert.deepEqual(orderedTiers().map((t) => t.tier), [1, 2, 3]);
  assert.deepEqual(
    allCategories().sort(),
    ["Carry", "Consumable", "Desk", "Tech", "Wearable"],
  );
});

test("the price disclaimer is present and says these are not quotes", () => {
  // It renders on the tab itself; if it ever empties, the tab silently
  // starts presenting estimates as supplier pricing.
  assert.ok(MERCH.meta.priceDisclaimer.trim().length > 20);
  assert.match(MERCH.meta.priceDisclaimer, /estimate/i);
  assert.match(MERCH.meta.priceDisclaimer, /not.*quote/i);
});

test("no filters returns everything", () => {
  assert.equal(filterItems(MERCH.items, EMPTY_FILTERS).length, MERCH.items.length);
});

test("filters combine rather than replace each other", () => {
  const tierOnly = filterItems(MERCH.items, { ...EMPTY_FILTERS, tiers: [1] });
  assert.ok(tierOnly.length > 0);
  assert.ok(tierOnly.every((i) => i.tier === 1));

  const both = filterItems(MERCH.items, {
    ...EMPTY_FILTERS,
    tiers: [1],
    categories: ["Tech"],
  });
  assert.ok(both.every((i) => i.tier === 1 && i.category === "Tech"));
  assert.ok(both.length <= tierOnly.length, "adding a filter must never widen the result");

  const flat = filterItems(MERCH.items, { ...EMPTY_FILTERS, pocketFlatOnly: true });
  assert.ok(flat.every((i) => i.pocketFlat));
  assert.ok(flat.length < MERCH.items.length, "fixture should contain some non-flat items");
});

test("search reaches the prose, not just the names", () => {
  const item = MERCH.items[0];
  // A distinctive word from the reasoning, not from any name.
  const byProse = filterItems(MERCH.items, { ...EMPTY_FILTERS, query: "engrave" });
  assert.ok(byProse.length > 0, "expected some item to mention engraving");
  assert.ok(
    byProse.every((i) =>
      `${i.name} ${i.supplierProductName} ${i.whyItWorks} ${i.decoration} ${i.watchOut} ${i.category}`
        .toLowerCase()
        .includes("engrave"),
    ),
  );

  const byCode = filterItems(MERCH.items, { ...EMPTY_FILTERS, query: item.supplierItemCode });
  assert.ok(byCode.some((i) => i.id === item.id), "searching an item code should find it");

  assert.equal(filterItems(MERCH.items, { ...EMPTY_FILTERS, query: "zzzznope" }).length, 0);
});

test("spend is qty x unit cost plus one setup fee per item", () => {
  const setup = MERCH.meta.setupFeeCad;
  const picked = MERCH.items.slice(0, 3);
  const qty = 275;

  const got = estimateSpend(picked, qty, MERCH.meta);
  const expectLow = picked.reduce((s, i) => s + qty * i.estUnitCostCad.low + setup, 0);
  const expectHigh = picked.reduce((s, i) => s + qty * i.estUnitCostCad.high + setup, 0);

  assert.equal(got.count, 3);
  assert.equal(got.qty, qty);
  assert.equal(got.low, expectLow);
  assert.equal(got.high, expectHigh);
  assert.ok(got.low <= got.high);

  // Setup is charged per item, not once for the order.
  const one = estimateSpend(picked.slice(0, 1), qty, MERCH.meta);
  assert.equal(
    estimateSpend([], qty, MERCH.meta).low,
    0,
    "an empty selection should cost nothing, not one setup fee",
  );
  assert.equal(one.low, qty * picked[0].estUnitCostCad.low + setup);
});

test("the default quantity basis is the documented 275", () => {
  assert.equal(MERCH.meta.quantityBasis, 275);
  assert.equal(MERCH.meta.setupFeeCad, 65);
});

test("money renders as whole dollars", () => {
  assert.equal(formatCad(1234.4), "$1,234");
  assert.equal(formatCad(0), "$0");
});

test("the quote email carries what the supplier can actually look up", () => {
  const picked = MERCH.items.slice(0, 2);
  const email = buildQuoteEmail(picked, 275, MERCH.meta);

  for (const i of picked) {
    assert.ok(email.includes(i.supplierProductName), "supplier product name must appear");
    assert.ok(email.includes(i.supplierItemCode), "item code must appear");
    assert.ok(email.includes(i.productUrl), "listing URL must appear");
    assert.ok(email.includes(i.name), "our own reference should appear too");
  }
  assert.match(email, /275 units each/);
  assert.match(email, /2 items/);

  // One item shouldn't read "1 items".
  assert.match(buildQuoteEmail(picked.slice(0, 1), 100, MERCH.meta), /1 item at 100 units each/);
});
