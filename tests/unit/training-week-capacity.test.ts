/** The capacity monitor reads suggested occupancy, not raw demand. */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapacityMonitor } from "../../src/components/training-week/CapacityMonitor";
import { sessionCapacity } from "../../src/lib/training-week/capacity";
import { RegistrationCounts } from "../../src/components/dashboards/RegistrationCounts";
import { WorkshopRegistrationControl } from "../../src/components/training-week/WorkshopRegistrationControl";

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
    assert.ok(html.includes(`style="left:${pct(1)};width:${pct(4)}" title="4 recommended approval"`));
    assert.ok(html.includes(`style="width:${pct(1)}" title="1 actual approved"`));
    assert.ok(html.includes(`style="left:${pct(capacity)}" title="${capacity} capacity"`));
    assert.match(html, />10<\/strong> requested/);
    assert.match(html, />\+4<\/strong> recommended approval/);
    assert.match(html, />1<\/strong> actual approved/);
    assert.ok(html.includes(`>${capacity}</strong> capacity`));
    assert.match(html, /aria-label="5 projected approvals: 1 actual approved \+ 4 recommended approval/);
    const bar = html.slice(html.indexOf('role="img"'), html.indexOf('</li>'));
    for (const label of ["requested", "recommended approval", "actual approved", "capacity"]) assert.ok(bar.includes(`</strong> ${label}`));
    for (const colour of ["bg-sky-200", "bg-lime-200", "bg-teal-700"]) assert.ok(bar.includes(colour));
    assert.ok(html.includes(`title="10 requested / ${capacity} capacity">10/${capacity}</span>`));
    if (capacity < 10) {
      assert.ok(html.includes(`left:${pct(capacity)};width:${pct(10 - capacity)};background-image:repeating-linear-gradient`));
      assert.ok(html.includes(`title="${10 - capacity} requests over capacity"`));
    } else {
      assert.doesNotMatch(html, /repeating-linear-gradient/);
    }
  }
});

test("symposium precedes capacity; total people and per-session controls stay separate from seat counts", () => {
  const session = { id: "one", slug: "one", title: "Workshop", start: "2026-10-26T10:00:00Z", cap: sessionCapacity(20, seats(5)), registration: { state: "open" as const, message: "" } };
  const save = async () => ({ ok: true });
  const html = renderToStaticMarkup(createElement(RegistrationCounts, { sessions: [session], saveWorkshopState: save }));
  assert.ok(html.indexOf("Annual Symposium registration") < html.indexOf("Training Week capacity"));
  assert.match(html, /people registered/);
  assert.match(html, /Registration for Workshop/);
  for (const label of ["Open", "Pause", "Close"]) assert.ok(html.includes(`${label}</button>`));
  const paused = renderToStaticMarkup(createElement(WorkshopRegistrationControl, { slug: "one", title: "Workshop", initial: "paused", save }));
  assert.match(paused, /<strong class="text-fg">Paused<\/strong>/);
  assert.match(paused, /aria-pressed="true"/);
  assert.match(paused, /bg-teal-700 text-white/);
  assert.doesNotMatch(paused, /text-bg/);
  const counted = renderToStaticMarkup(createElement(CapacityMonitor, { sessions: [session], registered: 49 }));
  assert.match(counted, />49<\/strong> people registered/);
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
