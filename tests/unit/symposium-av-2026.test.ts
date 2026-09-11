import test from "node:test";
import assert from "node:assert/strict";
import {
  AV26_ALL, AV26_COMBINED, AV26_CURRENT, AV26_DECISION, AV26_DOCS, AV26_ORDER,
  AV26_VS_SUPERSEDED, chargedLine,
} from "../../src/lib/symposium/av-2026";
import { AV_DOCS, pagesOf } from "../../src/lib/symposium/av";

const round = (n: number) => Math.round(n * 100) / 100;

test("each section's lines add up to the subtotal Livecast printed", () => {
  for (const key of AV26_ALL) {
    const doc = AV26_DOCS[key];
    for (const section of doc.sections) {
      const sum = round(section.lines.reduce((n, l) => n + l.total, 0));
      assert.equal(sum, section.subtotal, `${doc.ref} — ${section.heading}`);
    }
  }
});

test("each section's stated total is its subtotal, its discount and its tax", () => {
  for (const key of AV26_ALL) {
    const doc = AV26_DOCS[key];
    for (const section of doc.sections) {
      const computed = round(section.subtotal + (section.discount ?? 0) + section.tax);
      assert.equal(computed, section.total, `${doc.ref} — ${section.heading}`);
    }
  }
});

test("each document's grand total is its own stated arithmetic", () => {
  for (const key of AV26_ALL) {
    const d = AV26_DOCS[key];
    const computed = round(d.gross + d.discount + d.additionalDiscount + d.tax);
    assert.equal(computed, d.total, d.ref);
  }
});

test("a document's gross is the sum of its sections' subtotals", () => {
  for (const key of AV26_ALL) {
    const d = AV26_DOCS[key];
    const sum = round(d.sections.reduce((n, s) => n + s.subtotal, 0));
    assert.equal(sum, d.gross, d.ref);
  }
});

test("the combined figures are the two documents added together", () => {
  const docs = AV26_ORDER.map((k) => AV26_DOCS[k]);
  const add = (pick: (d: (typeof docs)[number]) => number) => round(docs.reduce((n, d) => n + pick(d), 0));
  assert.equal(add((d) => d.gross), AV26_COMBINED.gross);
  assert.equal(add((d) => d.discount), AV26_COMBINED.discount);
  assert.equal(add((d) => d.additionalDiscount), AV26_COMBINED.additionalDiscount);
  assert.equal(add((d) => d.tax), AV26_COMBINED.tax);
  assert.equal(add((d) => d.total), AV26_COMBINED.total);
});

test("the superseded figures repeated here match av.ts, and the gap is the difference", () => {
  // The two modules state the same fact about #231775889. If av.ts is
  // ever corrected, this fails rather than letting the page quote a
  // total nothing else in the codebase agrees with.
  assert.equal(AV26_VS_SUPERSEDED.supersededTotal, AV_DOCS.q2026.total);
  assert.equal(AV26_VS_SUPERSEDED.supersededRef, AV_DOCS.q2026.ref);
  assert.equal(
    round(AV26_COMBINED.total - AV26_VS_SUPERSEDED.supersededTotal),
    AV26_VS_SUPERSEDED.difference,
  );
});

test("labour and delivery are what the difference is made of", () => {
  const labour = (key: (typeof AV26_ORDER)[number]) =>
    AV26_DOCS[key].sections.find((s) => s.heading === "Labour & delivery")?.subtotal ?? 0;
  const after = round(AV26_ORDER.reduce((n, k) => n + labour(k), 0));
  assert.equal(after, AV26_VS_SUPERSEDED.labourAfter);
  // The named reasons account for the whole before/after gap.
  const named = AV26_VS_SUPERSEDED.reasons.reduce((n, r) => n + r.amount, 0);
  assert.equal(named, after - AV26_VS_SUPERSEDED.labourBefore);
});

test("every page each document claims is actually rendered", () => {
  for (const key of AV26_ALL) {
    const d = AV26_DOCS[key];
    assert.equal(pagesOf(key).length, d.pages, `${d.ref} page renders`);
  }
});

// ── Round 3 and the decision it leaves ─────────────────────────────────

test("every section's discount is fully explained by the lines it struck", () => {
  // Pins what chargedLine() reads: list total minus the amount charged,
  // summed over a section, is that section's printed discount. If the
  // encoding were misread, a free line would render as full price.
  for (const key of AV26_ALL) {
    const doc = AV26_DOCS[key];
    for (const section of doc.sections) {
      const struck = round(section.lines.reduce((n, l) => n + (l.total - chargedLine(l)), 0));
      assert.equal(struck, -(section.discount ?? 0) || 0, `${doc.ref} — ${section.heading}`);
    }
  }
});

test("round 3's room sections are the v1 AV-only quote, line for line", () => {
  // This is what makes the AV-only total the price of round 3 without
  // the stream — not an estimate, a document.
  const c = AV26_DOCS[AV26_CURRENT];
  const a = AV26_DOCS.a2026;
  for (const heading of ["Rental items", "Labour & delivery"]) {
    const mine = c.sections.find((s) => s.heading === heading);
    const theirs = a.sections.find((s) => s.heading === heading);
    assert.ok(mine && theirs, heading);
    assert.deepEqual(mine, theirs, heading);
  }
  assert.deepEqual(
    c.sections.map((s) => s.heading),
    ["Rental items", "Streaming and video", "Labour & delivery"],
  );
});

test("the additional discount is a flat 10% on every 2026 quote", () => {
  for (const key of AV26_ALL) {
    const d = AV26_DOCS[key];
    assert.equal(round((d.gross + d.discount) * 0.1), -d.additionalDiscount, d.ref);
  }
});

test("each decision figure is a printed total, or the difference of two", () => {
  const c = AV26_DOCS[AV26_CURRENT];
  const a = AV26_DOCS.a2026;
  const beforeTax = (d: typeof c) => round(d.gross + d.discount + d.additionalDiscount);
  assert.equal(AV26_DECISION.roomOnly.total, a.total, "room only = v1 AV-only, printed");
  assert.equal(AV26_DECISION.roomOnly.beforeTax, beforeTax(a));
  assert.equal(AV26_DECISION.withStream.total, c.total, "with stream = round 3, printed");
  assert.equal(AV26_DECISION.withStream.beforeTax, beforeTax(c));
  assert.equal(AV26_DECISION.streaming.total, round(c.total - a.total));
  assert.equal(AV26_DECISION.streaming.beforeTax, round(beforeTax(c) - beforeTax(a)));
});

test("apportioning the discount to the stream alone lands on the same figure", () => {
  // An independent route to the streaming price: the section's own
  // subtotal, less its line discount, less the flat 10%, plus 13% HST.
  //
  // Worked in whole cents, deliberately. The apportioned stream comes to
  // exactly $1,906.875 — a half-cent tie, which currency rounds up to
  // $1,906.88 and which matches the printed totals. In floating point
  // 1687.5 * 1.13 is 1906.8749999…, which would round DOWN to .87 and fail
  // for a reason that has nothing to do with the quote.
  const stream = AV26_DOCS[AV26_CURRENT].sections.find((s) => s.heading === "Streaming and video")!;
  const netCents = Math.round((stream.subtotal + (stream.discount ?? 0)) * 100); // 187,500
  const beforeTaxCents = (netCents * 9) / 10;                                     // 168,750, exact
  assert.equal(beforeTaxCents / 100, AV26_DECISION.streaming.beforeTax);
  assert.equal(Math.round((beforeTaxCents * 113) / 100) / 100, AV26_DECISION.streaming.total);
});

test("round 3 is back on the 1 September price, and bundling saves what splitting cost", () => {
  assert.equal(AV26_DOCS[AV26_CURRENT].total, AV_DOCS.q2026.total);
  assert.equal(AV26_DECISION.streamingAsOwnQuote, AV26_DOCS.s2026.total);
  assert.equal(
    round(AV26_DECISION.streamingAsOwnQuote - AV26_DECISION.streaming.total),
    AV26_DECISION.bundlingSaves,
  );
  assert.equal(AV26_DECISION.bundlingSaves, AV26_VS_SUPERSEDED.difference);
});

test("each multi-unit line's 'qty × each' breakdown multiplies out to its list total", () => {
  // The card prints "2 × $350 each" under the name and the line total in
  // the price column. That only reads honestly if the per-unit list price
  // times the quantity is the list total the section adds up from.
  for (const key of AV26_ALL) {
    for (const section of AV26_DOCS[key].sections) {
      for (const line of section.lines) {
        if (line.qty <= 1) continue;
        assert.equal(round((line.wasUnit ?? line.unit) * line.qty), line.total, `${AV26_DOCS[key].ref} — ${line.name}`);
      }
    }
  }
});
