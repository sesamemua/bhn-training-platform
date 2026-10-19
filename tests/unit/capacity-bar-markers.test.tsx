import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapacityBarMarkers } from "../../src/components/training-week/CapacityBarMarkers";
import { CapacityMonitor } from "../../src/components/training-week/CapacityMonitor";
import { sessionCapacity } from "../../src/lib/training-week/capacity";

test("ticks and labels share exact values on the chart scale, including overflow", () => {
  const html = renderToStaticMarkup(createElement(CapacityBarMarkers, { scale: 27, markers: [
    { value: 12, label: "12 capacity" }, { value: 27, label: "27 requested" },
  ] }));
  assert.match(html, new RegExp(`left:${12 / 27 * 100}%`));
  assert.match(html, /left:100%/);
  assert.equal((html.match(/class="capacity-bar-tick"/g) ?? []).length, 2);
  assert.match(html, /12 capacity/);
  assert.match(html, /27 requested/);
  assert.match(html, /data-align="end" data-lane="0">27 requested/);
  assert.doesNotMatch(html, /capacity-bar-markers-staggered/);
});

test("nearby values stagger labels; coincident values share a tick; zero capacity stays finite", () => {
  const close = renderToStaticMarkup(createElement(CapacityBarMarkers, { scale: 23, markers: [
    { value: 18, label: "18 approved" }, { value: 20, label: "20 plan (+2 recommended)" },
  ] }));
  assert.match(close, /capacity-bar-markers-staggered/);
  assert.match(close, /data-lane="1"/);
  const equal = renderToStaticMarkup(createElement(CapacityBarMarkers, { scale: 0, markers: [
    { value: 0, label: "0 capacity" }, { value: 0, label: "0 requested" },
  ] }));
  assert.equal((equal.match(/class="capacity-bar-tick"/g) ?? []).length, 1);
  assert.match(equal, /0 capacity \/ 0 requested/);
  assert.doesNotMatch(equal, /NaN|Infinity/);
});

test("shared dashboard marks actual approvals and cumulative plan without exceeding seat capacity", () => {
  for (const approved of [18, 24]) {
    const cap = sessionCapacity(20, [
      ...Array.from({ length: approved }, () => ({ status: "confirmed" })),
      ...Array.from({ length: 2 }, () => ({ status: "pending", suggestion: "approve" as const })),
    ]);
    const html = renderToStaticMarkup(createElement(CapacityMonitor, { sessions: [
      { id: "w", slug: "w", title: "Workshop", start: "2026-10-26T13:00:00Z", cap },
    ] }));
    assert.match(html, /20 capacity/);
    assert.match(html, approved === 18 ? /20 plan \(\+2 recommended\)/ : /20 shown \(24 approved\)/);
    assert.match(html, /training-workshop-title/);
  }
});
