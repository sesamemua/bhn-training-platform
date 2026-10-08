/** The capacity monitor reads suggested occupancy, not raw demand. */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapacityMonitor } from "../../src/components/training-week/CapacityMonitor";
import { sessionCapacity } from "../../src/lib/training-week/capacity";
import { RegistrationCounts } from "../../src/components/dashboards/RegistrationCounts";
import { WorkshopRegistrationControl } from "../../src/components/training-week/WorkshopRegistrationControl";
import { TrainingWeekCapacity } from "../../src/components/training-week/TrainingWeekCapacity";

const seats = (n: number, status = "pending", internal = false) => Array.from({ length: n }, () => ({ status, internal }));

test("separate request and seat-plan tracks use the same capacity scale, including overflow", () => {
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
    assert.ok(html.includes(`style="left:${pct(Math.min(1, capacity))};width:${pct(Math.min(4, Math.max(0, capacity - 1)))};background-image:repeating-linear-gradient`));
    assert.ok(html.includes(`style="width:${pct(Math.min(1, capacity))}" title="1 actual approved"`));
    assert.ok(html.includes(`style="left:${pct(capacity)}" title="${capacity} capacity"`));
    assert.match(html, />10<\/strong> requested/);
    assert.match(html, />4<\/strong> recommended approval/);
    assert.match(html, />1<\/strong> actual approved/);
    assert.ok(html.includes(`>5/${capacity}</strong> planned / capacity`));
    assert.match(html, /aria-label="5 projected approvals: 1 actual approved \+ 4 recommended approval/);
    assert.ok(html.indexOf("Requests:") < html.indexOf("Seat plan:"));
    assert.doesNotMatch(html, /grid-cols-4|bg-card\/95/);
    for (const colour of ["bg-sky-500", "bg-lime-200", "bg-teal-700"]) assert.ok(html.includes(colour));
    assert.ok(html.includes(`>10/${capacity}</strong> requested / capacity`));
    if (capacity < 10) {
      assert.ok(html.includes(`left:${pct(capacity)};width:${pct(10 - capacity)};background-image:repeating-linear-gradient`));
      assert.ok(html.includes(`title="${10 - capacity} requests over capacity"`));
    } else {
      assert.doesNotMatch(html, /title="\d+ requests over capacity"/);
    }
  }
});

test("Microbix seat plan ends at 12 capacity with no grey track behind the 15 excess requests", () => {
  const cap = sessionCapacity(12, [
    ...seats(1, "confirmed"),
    ...seats(11).map((s) => ({ ...s, suggestion: "approve" as const })),
    ...seats(15),
  ]);
  const html = renderToStaticMarkup(createElement(CapacityMonitor, { sessions: [
    { id: "microbix", slug: "microbix", title: "Microbix", start: "2026-10-26T10:00:00Z", cap },
  ] }));
  const plan = html.slice(html.indexOf("Seat plan:"), html.indexOf("</li>"));
  assert.ok(plan.includes(`class="absolute inset-y-0 left-0 bg-line" style="width:${12 / 27 * 100}%"`));
  assert.doesNotMatch(plan, /inset-x-0 bottom-0 h-2 bg-line/);
  assert.ok(plan.includes(`left:${1 / 27 * 100}%;width:${11 / 27 * 100}%`));
  assert.match(plan, />12\/12<\/strong> planned \/ capacity/);
  assert.match(html, /15 over capacity/);
});

test("legacy Full highlights Pause without changing saved state or submitting a mutation", () => {
  for (const initial of ["open", "paused", "full", "closed"] as const) {
    let calls = 0;
    const html = renderToStaticMarkup(createElement(WorkshopRegistrationControl, {
      slug: "microbix", title: "Microbix", initial, save: async () => { calls++; return { ok: true }; },
    }));
    const selected = initial === "open" ? "Open" : initial === "closed" ? "Close" : "Pause";
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    assert.equal(buttons.filter((b) => b.includes('aria-pressed="true"')).length, 1);
    assert.ok(buttons.find((b) => b.includes('aria-pressed="true"'))?.endsWith(`${selected}</button>`));
    if (initial === "full") assert.match(html, /Capacity reached/);
    assert.equal(calls, 0);
  }
});

test("empty and over-approved workshops keep finite track dimensions and explicit warnings", () => {
  for (const cap of [sessionCapacity(0, []), sessionCapacity(2, seats(5, "confirmed"))]) {
    const html = renderToStaticMarkup(createElement(CapacityMonitor, { sessions: [
      { id: "w", slug: "w", title: "Workshop", start: "2026-10-26T10:00:00Z", cap },
    ] }));
    assert.doesNotMatch(html, /NaN|Infinity/);
    if (cap.over) assert.match(html, /3 over capacity/);
  }
});

test("symposium precedes capacity; total people and per-session controls stay separate from seat counts", () => {
  const session = { id: "one", slug: "one", title: "Workshop", start: "2026-10-26T10:00:00Z", cap: sessionCapacity(20, seats(5)), registration: { state: "open" as const, message: "" } };
  const save = async () => ({ ok: true });
  const html = renderToStaticMarkup(createElement(RegistrationCounts, { sessions: [session], saveWorkshopState: save, saveCapacity: save }));
  assert.ok(html.indexOf("Annual Symposium registration") < html.indexOf("Training Week capacity"));
  assert.match(html, /people registered/);
  assert.match(html, /Registration for Workshop/);
  assert.match(html, /aria-label="Edit capacity" aria-expanded="false"/);
  assert.doesNotMatch(html, /type="number"/);
  const shared = renderToStaticMarkup(createElement(TrainingWeekCapacity, { sessions: [session], registered: 49, saveWorkshopState: save, saveCapacity: save }));
  assert.match(shared, /aria-label="Edit capacity" aria-expanded="false"/);
  assert.doesNotMatch(shared, /type="number"/);
  assert.match(shared, /Registration for Workshop/);
  assert.match(shared, /people registered/);
  const identicalPanel = renderToStaticMarkup(createElement(TrainingWeekCapacity, { sessions: [session], registered: null, saveWorkshopState: save, saveCapacity: save }));
  assert.ok(html.includes(identicalPanel), "Home embeds the identical shared panel without custom controls");
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
