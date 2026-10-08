/** The capacity monitor reads suggested occupancy, not raw demand. */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapacityMonitor } from "../../src/components/training-week/CapacityMonitor";
import { sessionCapacity } from "../../src/lib/training-week/capacity";

const seats = (n: number, status = "pending", internal = false) => Array.from({ length: n }, () => ({ status, internal }));

test("one bar shows demand, recommended additions, approvals and capacity on the same scale", () => {
  for (const capacity of [0, 6, 10, 20]) {
    const cap = sessionCapacity(capacity, [
      ...seats(1, "confirmed"),
      ...seats(4).map((s) => ({ ...s, suggestion: "approve" as const })),
      ...seats(5),
    ]);
    const html = renderToStaticMarkup(createElement(CapacityMonitor, { sessions: [
      { id: "w", slug: "w", title: "Workshop", start: "2026-10-26T10:00:00Z", cap },
    ] }));
    const pct = (n: number) => `${n / Math.max(capacity, 10) * 100}%`;
    assert.ok(html.includes(`style="width:${pct(10)}" title="10 requested"`));
    assert.ok(html.includes(`style="left:${pct(1)};width:${pct(4)}" title="4 recommended additions"`));
    assert.ok(html.includes(`style="width:${pct(1)}" title="1 approved"`));
    assert.ok(html.includes(`style="left:${pct(capacity)}" title="${capacity} capacity"`));
    assert.match(html, />10<\/strong> requested/);
    assert.match(html, />\+4<\/strong> recommended/);
    assert.match(html, />1<\/strong> approved/);
    assert.ok(html.includes(`>${capacity}</strong> capacity`));
    assert.match(html, /aria-label="5 projected approvals: 1 approved \+ 4 suggested/);
  }
});

test("oversubscribed requests do not become approvals; excluded seats and promotions are counted correctly", () => {
  const c = sessionCapacity(20, [
    ...seats(18).map((s) => ({ ...s, suggestion: "approve" as const })),
    ...seats(3).map((s) => ({ ...s, suggestion: "waitlist" as const })),
    ...seats(1, "confirmed"), ...seats(3, "cancelled"), ...seats(2, "confirmed", true),
    { status: "waitlist", suggestion: "approve" },
    { status: "confirmed", withdrawn: true },
  ]);
  assert.equal(c.requested, 23);
  assert.equal(c.confirmed, 1);
  assert.equal(c.suggested, 19);
  assert.equal(c.projectedApproved, 20);
  assert.equal(c.projectedWaitlisted, 3);
  assert.equal(c.over, 0);
  assert.equal(c.level, "full");
});

test("levels: open, filling at 80%, full at capacity", () => {
  assert.equal(sessionCapacity(20, seats(25)).level, "open");
  assert.equal(sessionCapacity(20, seats(15, "confirmed")).level, "open");
  assert.equal(sessionCapacity(20, seats(16, "confirmed")).level, "filling");
  assert.equal(sessionCapacity(20, seats(20, "confirmed")).level, "full");
  assert.equal(sessionCapacity(0, []).level, "open");
  assert.equal(sessionCapacity(0, seats(1, "confirmed")).level, "over");
});
