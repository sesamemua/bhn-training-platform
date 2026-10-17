import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkshopRegistrationSummary } from "../../src/components/training-week/WorkshopRegistrationSummary";
import { sessionCapacity } from "../../src/lib/training-week/capacity";

test("remaining trainee seats use actual approvals, not guests or recommended approvals", () => {
  const cap = sessionCapacity(10, [
    { status: "confirmed" }, { status: "confirmed" },
    { status: "confirmed", internal: true }, { status: "confirmed", withdrawn: true },
    { status: "pending", suggestion: "approve" }, { status: "waitlist", suggestion: "approve" },
  ]);
  assert.equal(cap.remaining, 8);
  assert.equal(cap.projectedApproved, 4);
  assert.equal(cap.decisions.approved, 3);
  assert.equal(sessionCapacity(1, [{ status: "confirmed" }, { status: "confirmed" }]).remaining, 0);
});

test("every workshop gets the same large, labelled summary including remaining seats", () => {
  for (const capacity of [0, 12, 20, 30, 100]) {
    const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap: sessionCapacity(capacity, [{ status: "confirmed" }, { status: "pending" }, { status: "cancelled" }]) }));
    for (const label of ["Approved", "To be decided", "Declined", "Total", "Remaining seats"]) assert.ok(html.includes(`<span>${label}</span>`));
    assert.match(html, /text-\[26px\] font-bold/);
    assert.ok(html.includes(`Remaining seats: ${Math.max(0, capacity - 1)}`));
    assert.match(html, /Trainee capacity minus actual approved trainee seats/);
    assert.match(html, /min-h-\[56px\]/);
    assert.doesNotMatch(html, /min-h-\[88px\]|py-2\.5/);
    assert.doesNotMatch(html, /NaN|Infinity|registration records/);
  }
});

test("decision counts have distinct backgrounds, icons and labels without changing their values", () => {
  const cap = sessionCapacity(12, [
    ...Array.from({ length: 12 }, () => ({ status: "confirmed" })),
    { status: "pending" },
    ...Array.from({ length: 4 }, () => ({ status: "cancelled" })),
    ...Array.from({ length: 8 }, () => ({ status: "waitlist" })),
    ...Array.from({ length: 2 }, () => ({ status: "cancelled", withdrawn: true })),
  ]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap }));
  const metrics = html.match(/<div class="min-h-\[56px\][\s\S]*?<\/div>/g) ?? [];
  assert.equal(metrics.length, 7);
  for (const [index, label, color, value] of [
    [0, "Approved", "emerald", 12], [1, "To be decided", "amber", 1], [2, "Declined", "rose", 4],
    [3, "Waitlisted", "violet", 8], [4, "Can&#x27;t attend", "zinc", 2], [5, "Total", "blue", 27], [6, "Remaining seats", "cyan", 0],
  ] as const) {
    assert.ok(metrics[index].includes(label));
    assert.ok(metrics[index].includes(`bg-${color}-`));
    assert.ok(metrics[index].includes("text-fg"));
    assert.doesNotMatch(metrics[index], /(?:dark:)?text-(?:emerald|amber|rose|violet|zinc|blue|cyan)-\d+/);
    assert.match(metrics[index], /<svg[^>]*aria-hidden="true"/);
    assert.match(metrics[index], new RegExp(`<dd[^>]*>${value}(?:<|$)`));
  }
  assert.match(html, /repeat\(auto-fit,minmax\(min\(100%,136px\),1fr\)\)/);
  assert.equal(cap.records, 27);
});
