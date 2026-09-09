import assert from "node:assert/strict";
import test from "node:test";
import { MERCH } from "../../src/lib/merch/types";
import {
  groupBoard, itemFromCard, mergeBoard, readPriceBreaks, slugForAddition,
  tallyPicks, type CardRow, type PickRow,
} from "../../src/lib/merch/board";

const catalogue = MERCH.items;
const first = catalogue[0];

const card = (over: Partial<CardRow> & { itemId: string }): CardRow => ({
  source: "catalogue", status: "shortlist",
  name: null, tier: null, tierKey: null, category: null, pocketFlat: null,
  priceBreaks: null, decorationSetupCad: null, estUnitLowCad: null, estUnitHighCad: null,
  supplierProductName: null, supplierItemCode: null, productUrl: null, imageUrl: null,
  whyItWorks: null, decoration: null, watchOut: null, addedBy: null,
  ...over,
});

test("a board nobody has touched is the catalogue, all of it shortlisted", () => {
  const items = mergeBoard(catalogue, []);
  assert.equal(items.length, catalogue.length);
  assert.ok(items.every((i) => i.status === "shortlist" && i.source === "catalogue"));
  // No rows exist until somebody moves something, so the empty state
  // must not depend on one.
  const groups = groupBoard(items, new Map());
  assert.equal(groups.shortlist.length, catalogue.length);
  assert.equal(groups.notSelected.length, 0);
  assert.equal(groups.favourites.length, 0);
});

test("a row for a catalogue item says where it sits, never what it is", () => {
  // The JSON stays the truth for the items in it: a row carrying a
  // different name must not be able to rewrite the published card.
  const items = mergeBoard(catalogue, [
    card({ itemId: first.id, status: "not_selected", name: "Renamed by a row" }),
  ]);
  const moved = items.find((i) => i.id === first.id);
  assert.ok(moved);
  assert.equal(moved.status, "not_selected");
  assert.equal(moved.name, first.name, "the catalogue name wins");
  assert.equal(moved.source, "catalogue");
});

test("a pasted product joins the board as a full card", () => {
  const items = mergeBoard(catalogue, [
    card({
      itemId: "new-thing-abcde-fghij", source: "added", name: "New thing",
      tier: 1, tierKey: "walk-up", category: "Desk", pocketFlat: true,
      priceBreaks: [{ minQty: 250, unitCad: 3.5 }, { minQty: 100, unitCad: 4 }],
      decorationSetupCad: 60, supplierProductName: "New Thing", supplierItemCode: "ABCDE-FGHIJ",
      productUrl: "https://products.thebiznessedge.com/p/ABCDE-FGHIJ/new-thing",
      imageUrl: "https://products.thebiznessedge.com/img", whyItWorks: "Because.",
      addedBy: { name: "Ruilin Yuan" },
    }),
  ]);
  assert.equal(items.length, catalogue.length + 1);
  const added = items.find((i) => i.id === "new-thing-abcde-fghij");
  assert.ok(added);
  assert.equal(added.source, "added");
  assert.equal(added.addedByName, "Ruilin Yuan");
  // Breaks are sorted on the way in so unitPriceAt can walk them.
  assert.deepEqual(added.priceBreaks, [{ minQty: 100, unitCad: 4 }, { minQty: 250, unitCad: 3.5 }]);
  assert.deepEqual(added.estUnitCostCad, { low: 3.5, high: 4 });
});

test("a row with no payload is not an item on its own", () => {
  assert.equal(itemFromCard(card({ itemId: "ghost" })), null);
});

test("price breaks off a JSON column survive anything that is not one", () => {
  assert.deepEqual(readPriceBreaks(null), []);
  assert.deepEqual(readPriceBreaks("nope"), []);
  assert.deepEqual(readPriceBreaks([{ minQty: "100", unitCad: 4 }, { minQty: 100, unitCad: 4 }]),
    [{ minQty: 100, unitCad: 4 }]);
});

test("a star is one per person per item, and the tally names who", () => {
  const picks: PickRow[] = [
    { itemId: first.id, userId: "u1", user: { name: "Ada" } },
    { itemId: first.id, userId: "u2", user: { name: "Grace" } },
    { itemId: catalogue[1].id, userId: "u2", user: { name: "Grace" } },
    { itemId: catalogue[1].id, userId: "u3", user: { name: null } },
  ];
  const tally = tallyPicks(picks, "u2");
  assert.equal(tally.get(first.id)?.count, 2);
  assert.deepEqual(tally.get(first.id)?.names, ["Ada", "Grace"]);
  assert.equal(tally.get(first.id)?.mine, true, "u2 starred it");
  assert.equal(tally.get(catalogue[1].id)?.names[1], "Someone", "a nameless account still reads as somebody");

  // Nobody looking means nothing is "mine", but the counts still stand.
  const anon = tallyPicks(picks);
  assert.equal(anon.get(first.id)?.count, 2);
  assert.equal(anon.get(first.id)?.mine, false);
});

test("favourites are the starred shortlist, most stars first — not a fourth shelf", () => {
  const [a, b, c] = catalogue;
  const items = mergeBoard(catalogue, [card({ itemId: c.id, status: "not_selected" })]);
  const tally = tallyPicks([
    { itemId: a.id, userId: "u1" },
    { itemId: b.id, userId: "u1" },
    { itemId: b.id, userId: "u2" },
    { itemId: c.id, userId: "u1" },
  ]);
  const groups = groupBoard(items, tally);

  assert.deepEqual(groups.favourites.map((i) => i.id), [b.id, a.id], "two stars outrank one");
  // Starred items stay in their tier as well — favourites is a view.
  assert.ok(groups.shortlist.some((i) => i.id === b.id));
  // Something set aside is not a favourite even if it was starred first.
  assert.ok(!groups.favourites.some((i) => i.id === c.id));
  assert.deepEqual(groups.notSelected.map((i) => i.id), [c.id]);
});

test("a slug for an addition is readable, bounded, and unique per item code", () => {
  assert.equal(slugForAddition("Pop up Phone Holder", "DQTKC-LWSRD"), "pop-up-phone-holder-dqtkc-lwsrd");
  assert.notEqual(
    slugForAddition("Tote", "AAAAA-BBBBB"),
    slugForAddition("Tote", "CCCCC-DDDDD"),
    "same name, different product, different card",
  );
  assert.ok(slugForAddition("x".repeat(300), "AAAAA-BBBBB").length <= 90);
  assert.equal(slugForAddition("!!!", "AAAAA-BBBBB"), "aaaaa-bbbbb");
});
