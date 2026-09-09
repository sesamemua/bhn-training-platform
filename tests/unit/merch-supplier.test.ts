import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MERCH } from "../../src/lib/merch/types";
import {
  detailUrlFor, draftCardFrom, listingUrlFor, parsePriceBreaks,
  parseProductPage, parseSetupCandidates, productCodeFromUrl,
} from "../../src/lib/merch/supplier";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/merch", `${name}.html`), "utf8");

/** Each fixture is a real listing; each id is the item already committed. */
const CASES = [
  { file: "quetico-tote", id: "quetico-cotton-jute-fashion-tote" },
  { file: "pop-up-phone-holder", id: "pop-up-phone-holder" },
  { file: "b-safe-key", id: "b-safe-key-touchless-tool" },
  { file: "mouse-pad", id: "accent-dye-sublimated-mouse-pad" },
];

test("a listing yields the price ladder that is already committed for it", () => {
  // The four cards in items.json were entered by hand from these listings.
  // If the parser and the hand-entered data disagree, one of them is
  // wrong — and this is the test that says which.
  for (const c of CASES) {
    const committed = MERCH.items.find((i) => i.id === c.id);
    assert.ok(committed, `${c.id} should be in the catalogue`);
    const parsed = parseProductPage(fixture(c.file));
    assert.ok(parsed, `${c.file} should parse`);
    assert.deepEqual(
      parsed.priceBreaks,
      committed.priceBreaks,
      `${c.id}: parsed ladder must match the committed one`,
    );
    assert.equal(parsed.itemCode, committed.supplierItemCode);
    assert.equal(parsed.name, committed.supplierProductName);
  }
});

test("the photo is asked for at the size the cards use", () => {
  const parsed = parseProductPage(fixture("pop-up-phone-holder"));
  assert.ok(parsed);
  // Their JSON-LD asks for 1800px; a card wants the 400 the catalogue uses.
  assert.match(parsed.imageUrl, /PX=400/);
  assert.doesNotMatch(parsed.imageUrl, /PX=1800/);
  assert.match(parsed.imageUrl, /^https:\/\/products\.thebiznessedge\.com\//);
});

test("empty trailing rows in the quantity table are not price breaks", () => {
  // The table carries blank rows reading "Pcs. Per Unit: 0". Picking one
  // up would put a $0 break on the card and make the order look free.
  for (const c of CASES) {
    const breaks = parsePriceBreaks(fixture(c.file));
    assert.ok(breaks.length > 0);
    for (const b of breaks) {
      assert.ok(b.minQty > 0, "a break with no quantity is not a break");
      assert.ok(b.unitCad > 0, "a break at $0 is a parsing failure, not a bargain");
    }
    // Ascending, so unitPriceAt can walk them.
    const qtys = breaks.map((b) => b.minQty);
    assert.deepEqual(qtys, [...qtys].sort((a, b) => a - b));
  }
});

test("every setup charge the listing mentions is offered, not just the first", () => {
  // The tote shows a $65 transfer setup AND a separate $75 "Setup Charge"
  // with nothing saying which method the second belongs to — its own
  // watch-out says so. Guessing one would bake the ambiguity into a card.
  const candidates = parseSetupCandidates(fixture("quetico-tote"));
  assert.ok(candidates.length >= 2, "the tote listing shows more than one setup charge");
  assert.deepEqual(candidates, [...candidates].sort((a, b) => a - b));
});

test("item codes are read from any shape of listing link, and only from theirs", () => {
  assert.equal(
    productCodeFromUrl("https://products.thebiznessedge.com/p/DQTKC-LWSRD/pop-up-phone-holder"),
    "DQTKC-LWSRD",
  );
  assert.equal(productCodeFromUrl("products.thebiznessedge.com/p/dqtkc-lwsrd/x"), "DQTKC-LWSRD");
  assert.equal(
    productCodeFromUrl("https://products.thebiznessedge.com/ws/ws.dll/PrDtl?siteID=26204&SPC=dqtkc-lwsrd"),
    "DQTKC-LWSRD",
  );
  // Anything else is refused, so the lookup route cannot be pointed
  // somewhere else by pasting a different address.
  for (const bad of [
    "https://evil.example.com/p/DQTKC-LWSRD/x",
    "https://products.thebiznessedge.com.evil.example/p/DQTKC-LWSRD/x",
    "http://localhost:3000/p/DQTKC-LWSRD/x",
    "not a url",
    "",
  ]) {
    assert.equal(productCodeFromUrl(bad), null, `${bad} must not resolve`);
  }
});

test("the URLs built for a code point at the supplier's own pages", () => {
  assert.equal(
    detailUrlFor("DQTKC-LWSRD"),
    "https://products.thebiznessedge.com/ws/ws.dll/PrDtl?siteID=26204&SPC=dqtkc-lwsrd&",
  );
  assert.equal(
    listingUrlFor("DQTKC-LWSRD", "Pop up Phone Holder"),
    "https://products.thebiznessedge.com/p/DQTKC-LWSRD/pop-up-phone-holder",
  );
});

test("a draft leaves the editorial fields for a person to write", () => {
  const parsed = parseProductPage(fixture("pop-up-phone-holder"));
  assert.ok(parsed);
  const draft = draftCardFrom(parsed);
  assert.equal(draft.supplierItemCode, "DQTKC-LWSRD");
  assert.deepEqual(draft.priceBreaks, parsed.priceBreaks);
  assert.equal(draft.estUnitLowCad, Math.min(...parsed.priceBreaks.map((b) => b.unitCad)));
  assert.equal(draft.estUnitHighCad, Math.max(...parsed.priceBreaks.map((b) => b.unitCad)));
  // The supplier's own words seed "why it works"; the rest is ours to
  // write, because /merch publishes it.
  assert.equal(draft.whyItWorks, parsed.description);
  assert.equal(draft.decoration, "");
});

test("a page that is not a product yields nothing rather than a blank card", () => {
  assert.equal(parseProductPage("<html><body>You cannot load this content from here.</body></html>"), null);
  assert.equal(parseProductPage(""), null);
  assert.equal(
    parseProductPage('<script type="application/ld+json">{"@type":"Product"}</script>'),
    null,
    "no name and no sku is not a product",
  );
});
