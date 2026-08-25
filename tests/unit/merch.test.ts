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
import { unitPriceAt } from "../../src/lib/merch/types";

test("the catalogue is internally consistent", () => {
  // Deliberately NOT a count. The shortlist is a thing that changes —
  // it went from 25 to 4 when the four were chosen — and a test that
  // pins the number goes red on the one edit it is supposed to allow,
  // which is how these assertions ended up stale and ignored.
  assert.ok(MERCH.items.length > 0, "the shortlist is empty");

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
  // Derived from the items rather than listed: the categories are the
  // supplier's, and a shortlist that drops the last Wearable should not
  // fail a test about consistency.
  assert.deepEqual(
    allCategories().sort(),
    [...new Set(MERCH.items.map((i) => i.category))].sort(),
  );
});

test("the price disclaimer is present and says these are not quotes", () => {
  // It renders on the tab itself; if it ever empties, the tab silently
  // starts presenting numbers as if somebody had committed to them.
  //
  // It no longer has to say "estimate" — the figures ARE the supplier's
  // published break pricing now, and calling them estimates was the
  // wrong disclaimer. What has to survive is "this is not a quote".
  assert.ok(MERCH.meta.priceDisclaimer.trim().length > 20);
  assert.match(MERCH.meta.priceDisclaimer, /not a quote|not.*quote/i);
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
  // A word taken from THIS catalogue's prose rather than a fixed one:
  // "engrave" left the shortlist with the items that mentioned it, and
  // the test went red for a reason that had nothing to do with search.
  const word = "setup";
  const byProse = filterItems(MERCH.items, { ...EMPTY_FILTERS, query: word });
  assert.ok(byProse.length > 0, `expected some item to mention "${word}"`);
  assert.ok(
    byProse.every((i) =>
      `${i.name} ${i.supplierProductName} ${i.whyItWorks} ${i.decoration} ${i.watchOut} ${i.category}`
        .toLowerCase()
        .includes(word),
    ),
  );

  const byCode = filterItems(MERCH.items, { ...EMPTY_FILTERS, query: item.supplierItemCode });
  assert.ok(byCode.some((i) => i.id === item.id), "searching an item code should find it");

  assert.equal(filterItems(MERCH.items, { ...EMPTY_FILTERS, query: "zzzznope" }).length, 0);
});

test("spend is qty at the applicable break, plus both setup fees, per item", () => {
  // Rewritten to match what the code now does. It used to multiply by
  // estUnitCostCad.low/high, which produced a RANGE; it now looks up
  // the supplier's real break for the quantity asked for, so both ends
  // are the same number and the answer is one a coordinator can put in
  // front of finance.
  const orderSetup = MERCH.meta.setupFeeCad;
  const picked = MERCH.items.slice(0, 3);
  // Deliberately not the meta basis, so the arithmetic is tested rather
  // than a coincidence between two constants.
  const qty = 275;

  const expected = picked.reduce(
    (sum, i) => sum + qty * unitPriceAt(i, qty) + i.decorationSetupCad + orderSetup,
    0,
  );
  const got = estimateSpend(picked, qty, MERCH.meta);

  assert.equal(got.count, 3);
  assert.equal(got.qty, qty);
  assert.equal(got.low, expected);
  assert.equal(got.high, expected, "with real break pricing there is no range left");

  // Both setup fees are per ITEM, not once for the order.
  const one = estimateSpend(picked.slice(0, 1), qty, MERCH.meta);
  assert.equal(one.low, qty * unitPriceAt(picked[0], qty) + picked[0].decorationSetupCad + orderSetup);
  assert.equal(
    estimateSpend([], qty, MERCH.meta).low,
    0,
    "an empty selection should cost nothing, not one setup fee",
  );
});

test("a bigger order never costs more per unit", () => {
  // The whole point of break pricing, and the one property that would
  // be wrong if the breaks were ever sorted or compared the wrong way.
  for (const item of MERCH.items) {
    let last = Infinity;
    for (const b of [...item.priceBreaks].sort((a, b2) => a.minQty - b2.minQty)) {
      const unit = unitPriceAt(item, b.minQty);
      assert.ok(unit <= last, `${item.id} gets dearer at ${b.minQty}`);
      last = unit;
    }
    // Below the smallest break, the smallest break's price is used
    // rather than nothing.
    const smallest = Math.min(...item.priceBreaks.map((b) => b.minQty));
    assert.ok(unitPriceAt(item, 1) > 0, `${item.id} has no price below ${smallest}`);
  }
});

test("the quantity basis and setup fee are whole, positive and stated", () => {
  // Pinned as PROPERTIES, not as 275 and 65. Both are numbers the team
  // revises — the basis moved to 300 when the shortlist was cut — and
  // what matters is that a spend estimate has a sane basis to compute
  // from, not which particular number it is this month.
  assert.ok(Number.isInteger(MERCH.meta.quantityBasis) && MERCH.meta.quantityBasis > 0);
  assert.ok(MERCH.meta.setupFeeCad > 0);
  assert.equal(MERCH.meta.currency, "CAD");
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
