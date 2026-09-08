import test from "node:test";
import assert from "node:assert/strict";
import {
  AV26_COMBINED, AV26_DOCS, AV26_ORDER, AV26_VS_SUPERSEDED,
} from "../../src/lib/symposium/av-2026";
import { AV_DOCS, pagesOf } from "../../src/lib/symposium/av";

const round = (n: number) => Math.round(n * 100) / 100;

test("each section's lines add up to the subtotal Livecast printed", () => {
  for (const key of AV26_ORDER) {
    const doc = AV26_DOCS[key];
    for (const section of doc.sections) {
      const sum = round(section.lines.reduce((n, l) => n + l.total, 0));
      assert.equal(sum, section.subtotal, `${doc.ref} — ${section.heading}`);
    }
  }
});

test("each section's stated total is its subtotal, its discount and its tax", () => {
  for (const key of AV26_ORDER) {
    const doc = AV26_DOCS[key];
    for (const section of doc.sections) {
      const computed = round(section.subtotal + (section.discount ?? 0) + section.tax);
      assert.equal(computed, section.total, `${doc.ref} — ${section.heading}`);
    }
  }
});

test("each document's grand total is its own stated arithmetic", () => {
  for (const key of AV26_ORDER) {
    const d = AV26_DOCS[key];
    const computed = round(d.gross + d.discount + d.additionalDiscount + d.tax);
    assert.equal(computed, d.total, d.ref);
  }
});

test("a document's gross is the sum of its sections' subtotals", () => {
  for (const key of AV26_ORDER) {
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
  for (const key of AV26_ORDER) {
    const d = AV26_DOCS[key];
    assert.equal(pagesOf(key).length, d.pages, `${d.ref} page renders`);
  }
});
