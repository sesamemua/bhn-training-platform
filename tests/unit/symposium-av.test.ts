import test from "node:test";
import assert from "node:assert/strict";
import {
  AV_LINES, AV_DOCS, AV_DELTAS, amountOn, newIn2026, unquotedIn2025,
  discountRate, netOn, netDelta, lineDelta,
  chargedOn, chargedTotal, blanketOf, blanketRate, itemReduction,
} from "../../src/lib/symposium/av";

/**
 * These figures were transcribed by hand from three PDFs, and the page
 * built on them tells somebody what to spend. A typo in one line item
 * would show up as a confident, wrong difference on screen.
 *
 * So: every line is summed and checked against the subtotal, discount and
 * total each document states about itself. Those stated numbers are the
 * independent check — they were computed by Livecast, not by me. If a
 * unit price or quantity is wrong here, the sums stop matching and this
 * fails rather than the page misreporting.
 */

const round = (n: number) => Math.round(n * 100) / 100;

for (const doc of [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026]) {
  test(`${doc.title}: line items sum to the stated pre-discount total`, () => {
    const summed = round(AV_LINES.reduce((n, l) => n + amountOn(l, doc.key), 0));
    assert.equal(summed, doc.gross, `${doc.ref} line items`);
  });

  test(`${doc.title}: gross minus discounts equals the stated subtotal`, () => {
    const after = round(doc.gross + doc.discounts.reduce((n, d) => n + d.amount, 0));
    assert.equal(after, doc.subtotal, `${doc.ref} subtotal`);
  });

  test(`${doc.title}: HST is 13% of the subtotal`, () => {
    /*
     * Within a cent, not to the cent. The 2026 quote states $1,123.80
     * where a single 13% calculation gives $1,123.785 — Livecast taxes
     * each section separately and credits tax back on the additional
     * discount, so the roundings compound. A whole cent of slack is
     * enough to catch a transcription error and not enough to hide one.
     */
    assert.ok(
      Math.abs(round(doc.subtotal * 0.13) - doc.tax) <= 0.02,
      `${doc.ref} tax: stated ${doc.tax}, 13% of subtotal is ${round(doc.subtotal * 0.13)}`,
    );
  });

  test(`${doc.title}: subtotal plus tax equals the stated total`, () => {
    assert.equal(round(doc.subtotal + doc.tax), doc.total, `${doc.ref} total`);
  });

  test(`${doc.title}: every line's qty × unit equals its own total`, () => {
    for (const line of AV_LINES) {
      const e = line[doc.key];
      if (!e) continue;
      assert.equal(round(e.qty * e.unit), e.total, `${line.key} on ${doc.ref}`);
    }
  });
}

test("the 10% discount on both 2025 documents is 10% of their line items", () => {
  // Livecast's own arithmetic, recomputed. If the transcribed line items
  // were wrong this would not land on the stated discount.
  for (const doc of [AV_DOCS.q2025, AV_DOCS.i2025]) {
    const ten = doc.discounts.find((d) => d.label.includes("10%"));
    assert.ok(ten);
    assert.equal(round(doc.gross * -0.1), ten.amount, doc.ref);
  }
});

test("2025 was billed above its own quote", () => {
  assert.equal(round(AV_DELTAS.overrun2025.amount), 818.68);
  assert.ok(AV_DELTAS.overrun2025.pct > 0.12 && AV_DELTAS.overrun2025.pct < 0.13);
});

test("the 2026 quote is above what 2025 actually cost", () => {
  assert.equal(round(AV_DELTAS.quoteVsActual.amount), 2323.86);
  assert.ok(AV_DELTAS.quoteVsActual.pct > 0.31 && AV_DELTAS.quoteVsActual.pct < 0.32);
});

test("quote-to-quote overstates the rise, which is why the page leads with quote-vs-actual", () => {
  // 47% against last year's quote, 31% against what was actually paid.
  // Reporting the first alone would be true and misleading.
  assert.ok(AV_DELTAS.quoteVsQuote.pct > AV_DELTAS.quoteVsActual.pct);
  assert.equal(round(AV_DELTAS.quoteVsQuote.amount), 3142.54);
});

test("the 2025 surprises are the lines that were billed but never quoted", () => {
  const keys = unquotedIn2025().map((l) => l.key).sort();
  assert.deepEqual(keys, ["ac-cables", "aputure", "atem", "encoder-kit", "power-bar"]);
  // $1,200 of the $818.68 overrun, before the discounts that absorbed
  // part of it; the extra 4 hours of labour ($340) is the rest.
  const surprise = unquotedIn2025().reduce((n, l) => n + amountOn(l, "i2025"), 0);
  assert.equal(surprise, 1200);
});

test("what is genuinely new in 2026 is named", () => {
  const keys = newIn2026().map((l) => l.key).sort();
  assert.deepEqual(keys, [
    "cameras", "decimator", "hybrid-package", "risers", "tv-43", "usb-audio-interface",
  ]);
});

test("every line appears on at least one document", () => {
  for (const l of AV_LINES) {
    assert.ok(l.q2025 || l.i2025 || l.q2026, `${l.key} appears nowhere`);
  }
});

test("no duplicate line keys", () => {
  const keys = AV_LINES.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length);
});

/**
 * The discount is not decoration. It deepens across the three documents
 * — 12.7%, 21.8%, 27.5% — so a line-by-line comparison of list amounts
 * overstates the increase by ten percentage points. These tests keep the
 * two views honest and keep the apportionment from drifting away from
 * the documents' own stated subtotals.
 */

test("the discount deepens across the three documents", () => {
  const rates = [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026].map(discountRate);
  assert.ok(rates[0] < rates[1] && rates[1] < rates[2], `not increasing: ${rates}`);
  assert.equal(Math.round(rates[0] * 1000) / 10, 12.7);
  assert.equal(Math.round(rates[1] * 1000) / 10, 21.8);
  assert.equal(Math.round(rates[2] * 1000) / 10, 27.5);
});

test("THE POINT: list amounts rise faster than what is actually payable", () => {
  // Reading the table's list column alone says +41.6%. The bill is +31.2%.
  // A ten-point gap, entirely explained by the deeper discount.
  assert.equal(Math.round(AV_DELTAS.listRise * 1000) / 10, 41.6);
  assert.equal(Math.round(AV_DELTAS.payableRise * 1000) / 10, 31.2);
  assert.ok(AV_DELTAS.listRise - AV_DELTAS.payableRise > 0.1);
});

for (const doc of [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026]) {
  test(`${doc.title}: apportioned lines add back up to the stated subtotal`, () => {
    /*
     * The per-line net figures are an apportionment, so they carry
     * rounding. What must hold is that they still sum to the number the
     * document itself states — otherwise the table's totals row would
     * disagree with the document card directly above it.
     */
    const summed = AV_LINES.reduce((n, l) => n + netOn(l, doc.key), 0);
    assert.ok(
      Math.abs(summed - doc.subtotal) < 0.5,
      `${doc.ref}: apportioned ${summed.toFixed(2)} vs stated ${doc.subtotal}`,
    );
  });
}

test("a line absent from a document nets to zero, not to a discount", () => {
  const streaming = AV_LINES.find((l) => l.key === "hybrid-package")!;
  assert.equal(netOn(streaming, "i2025"), 0);
  assert.ok(netOn(streaming, "q2026") > 0);
});

test("the five struck 2026 lines sum to exactly the stated $2,320 discount", () => {
  /*
   * This is the check that caught the mistake. Text extraction shows both
   * the list and the charged price with no clue which survives, and the
   * projectors were first read as a $650 increase when they are flat.
   * The strikethroughs are only legible in the rendered page — and if
   * they were read wrong, these five would not add up to the number
   * Livecast prints on the bottom of its own quote.
   */
  const reduced = AV_LINES.filter((l) => itemReduction(l, "q2026") > 0);
  assert.deepEqual(
    reduced.map((l) => l.key).sort(),
    ["aputure", "cameras", "projectors", "risers", "uplights"],
  );
  const sum = reduced.reduce((n, l) => n + itemReduction(l, "q2026"), 0);
  assert.equal(sum, 2320);
  assert.equal(sum, -AV_DOCS.q2026.discounts.find((d) => d.label === "Discount")!.amount);
});

test("the projectors are flat, not the biggest increase", () => {
  // $1,950 listed, $1,300 charged — $650/unit, exactly the 2025 NEC price.
  const p = AV_LINES.find((l) => l.key === "projectors")!;
  assert.equal(chargedOn(p, "i2025"), 1300);
  assert.equal(chargedOn(p, "q2026"), 1300);
  assert.equal(p.q2026!.total, 1950);
});

test("what is left after the item reductions is a flat 10% on the 2026 quote", () => {
  assert.equal(Math.round(blanketRate(AV_DOCS.q2026) * 10000) / 100, 10);
  assert.equal(blanketOf(AV_DOCS.q2026), 960.5);
});

test("charged totals reconcile to each stated subtotal after the blanket cut", () => {
  for (const doc of [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026]) {
    const after = Math.round(chargedTotal(doc) * (1 - blanketRate(doc)) * 100) / 100;
    assert.ok(Math.abs(after - doc.subtotal) < 0.02, `${doc.ref}: ${after} vs ${doc.subtotal}`);
  }
});

test("THE FINDING: equipment is up 14%, the bill is up 31%, the gap is last year's goodwill", () => {
  assert.equal(Math.round(AV_DELTAS.chargedRise * 1000) / 10, 14.1);
  assert.equal(Math.round(AV_DELTAS.payableRise * 1000) / 10, 31.2);
  // 2025 took $990 off beyond its 10% that 2026 does not repeat.
  assert.equal(AV_DELTAS.lostGoodwill, 990);
});

test("the blanket cut is a document fact, not a per-line one", () => {
  /*
   * Why the table compares CHARGED amounts and not all-in ones.
   *
   * 2025's blanket cut was 21.8% and 2026's is 10%, so spreading each
   * across its own lines makes almost every row look worse than it is:
   * the wireless mics are $30 dearer, and an apportioned view puts them
   * $76 dearer. That difference is not about microphones — it is last
   * year's one-off goodwill, and it belongs in one sentence about the
   * document rather than smeared across twenty-three rows.
   */
  assert.ok(blanketRate(AV_DOCS.i2025) > blanketRate(AV_DOCS.q2026));
  const mics = AV_LINES.find((l) => l.key === "wireless-mics")!;
  assert.equal(chargedOn(mics, "q2026") - chargedOn(mics, "i2025"), 30);
  assert.ok(Math.abs(netDelta(mics)) > 30, "apportioning exaggerates this row");
});
