import test from "node:test";
import assert from "node:assert/strict";
import { publicCatalogue, publicItem, WITHHELD_FIELDS } from "../../src/lib/merch/public";
import { MERCH } from "../../src/lib/merch/types";

/**
 * The public merch page is openable by anyone. The internal list it is
 * built from carries supplier pricing and BHN's own lead-tiering, so
 * these tests exist to keep those on the inside — including when
 * somebody adds a field to items.json a year from now.
 */

test("every item survives the trip", () => {
  assert.equal(publicCatalogue().length, MERCH.items.length);
});

test("nothing about what it costs gets out", () => {
  const json = JSON.stringify(publicCatalogue());
  for (const field of ["priceBreaks", "estUnitCostCad", "decorationSetupCad", "unitCad", "minQty"]) {
    assert.ok(!json.includes(field), `${field} reached the public view`);
  }
  // And no bare number that could be a price, from the known values.
  for (const item of MERCH.items) {
    for (const b of item.priceBreaks ?? []) {
      assert.ok(!json.includes(String(b.unitCad)), `the unit price ${b.unitCad} leaked`);
    }
  }
});

test("how BHN ranks who gets what stays inside", () => {
  const json = JSON.stringify(publicCatalogue());
  for (const key of ["tierKey", "qualified-lead", "real-conversation", "walk-up"]) {
    assert.ok(!json.includes(key), `${key} reached the public view`);
  }
});

test("the supplier's item code is not published as a field of its own", () => {
  /*
   * It IS in the product URL — that is how the supplier addresses its
   * own public catalogue, and linking there is the point of the page.
   * What must not happen is shipping the SKU as a queryable field,
   * which is what turns a list of four gifts into a shopping list
   * somebody can re-price wholesale in one pass.
   */
  for (const item of publicCatalogue()) {
    const own = Object.entries(item).filter(([k]) => k !== "productUrl" && k !== "imageUrl");
    for (const [k, v] of own) {
      for (const src of MERCH.items) {
        assert.ok(
          String(v) !== src.supplierItemCode,
          `${k} carries the supplier item code as its whole value`,
        );
      }
    }
    assert.ok(!("supplierItemCode" in item), "the SKU must not be its own field");
  }
});

test("internal buyer notes stay inside", () => {
  /*
   * Both of these are written for whoever is spending the money.
   * `whyItWorks` opens by comparing the tote against an item already
   * rejected on price, and talks about "logo exposure" — true, useful
   * internally, and not something to say out loud to the person being
   * handed the tote. The public page shows `publicBlurb` instead.
   */
  const json = JSON.stringify(publicCatalogue());
  for (const item of MERCH.items) {
    if (item.watchOut) assert.ok(!json.includes(item.watchOut), "a watchOut leaked");
    assert.ok(!json.includes(item.whyItWorks), "the buyer-facing rationale leaked");
  }
});

test("THE ONE THAT MATTERS: a new field is withheld by default", () => {
  /*
   * A whitelist, not a redaction list. If this were the other way
   * round, a field added to items.json next month would be public the
   * moment it was added and nobody would find out.
   */
  const withNewField = { ...MERCH.items[0], internalMargin: 4.11, buyerNote: "haggle" } as never;
  const out = publicItem(withNewField) as unknown as Record<string, unknown>;
  assert.ok(!("internalMargin" in out), "an unlisted field must not pass through");
  assert.ok(!("buyerNote" in out), "an unlisted field must not pass through");
});

test("what it does show is enough to be useful", () => {
  for (const item of publicCatalogue()) {
    assert.ok(item.name.length > 3, "a name");
    assert.ok(item.imageUrl.startsWith("http"), "a picture");
    assert.ok(item.productUrl.startsWith("http"), "somewhere to look at it");
    assert.ok(item.publicBlurb.length > 20, "a description of the thing");
    assert.ok(item.category.length > 0);
  }
});

test("the withheld list names every internal field, so the reason is on the record", () => {
  const shown = new Set(Object.keys(publicItem(MERCH.items[0])));
  const known = new Set(Object.keys(MERCH.items[0]));
  for (const k of known) {
    assert.ok(
      shown.has(k) || (WITHHELD_FIELDS as readonly string[]).includes(k),
      `${k} is neither shown nor listed as withheld — decide which`,
    );
  }
});
