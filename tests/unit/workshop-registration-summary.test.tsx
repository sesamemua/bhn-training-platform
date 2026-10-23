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
    assert.match(html, /flex min-h-8 shrink-0 items-center/);
    assert.doesNotMatch(html, /min-h-\[88px\]|py-2\.5/);
    assert.doesNotMatch(html, /NaN|Infinity|registration records/);
  }
});

test("decision counts colour only the numbers, with muted labels and no boxes", () => {
  const cap = sessionCapacity(12, [
    ...Array.from({ length: 12 }, () => ({ status: "confirmed" })),
    { status: "pending" },
    ...Array.from({ length: 4 }, () => ({ status: "cancelled" })),
    ...Array.from({ length: 8 }, () => ({ status: "waitlist" })),
    ...Array.from({ length: 2 }, () => ({ status: "cancelled", withdrawn: true })),
  ]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap }));
  const metrics = html.match(/<div class="flex min-h-8[\s\S]*?<\/div>/g) ?? [];
  assert.equal(metrics.length, 7);
  for (const [index, label, color, value] of [
    [0, "Approved", "emerald", 12], [1, "To be decided", "amber", 1], [2, "Declined", "rose", 4],
    [3, "Waitlisted", "violet", 8], [4, "Can&#x27;t attend", "zinc", 2], [5, "Total", "blue", 27], [6, "Remaining seats", "cyan", 0],
  ] as const) {
    assert.ok(metrics[index].includes(label));
    assert.match(metrics[index], new RegExp(`<dd[^>]*text-${color}-`));
    assert.match(metrics[index], /<dt[^>]*text-muted/);
    assert.doesNotMatch(metrics[index], /\b(?:bg-|border|rounded|opacity-)/);
    assert.doesNotMatch(metrics[index], /dark:text-\w+-100/);
    assert.match(metrics[index], /<svg[^>]*aria-hidden="true"/);
    assert.match(metrics[index], new RegExp(`<dd[^>]*>${value}(?:<|$)`));
  }
  assert.match(html, /flex-nowrap items-center gap-x-5 overflow-x-auto/);
  assert.doesNotMatch(html, /grid-cols-|flex-col/);
  assert.equal(cap.records, 27);
});

test("compact summaries lead with approved, remaining, capacity and pending counts", () => {
  const cap = sessionCapacity(20, [
    { status: "confirmed" }, { status: "pending" }, { status: "cancelled" },
    { status: "waitlist" }, { status: "cancelled", withdrawn: true },
  ]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap, compact: true }));
  assert.equal((html.match(/<dt>/g) ?? []).length, 8);
  assert.match(html, /training-seat-well/);
  const primary = html.slice(html.indexOf('class="training-seat-priority"'), html.indexOf('class="training-seat-secondary"'));
  assert.deepEqual([...primary.matchAll(/<dt>([^<]+)<\/dt>/g)].map(m => m[1]), ["Approved", "Remaining seats", "Total capacity", "To be decided"]);
  assert.match(primary, /<dt>Total capacity<\/dt><dd>20<\/dd>/);
  assert.match(html, /<svg aria-hidden="true" data-dot-matrix="1"/);
  assert.match(html, /<span class="sr-only">1<\/span>/);
  assert.doesNotMatch(html, /min-h-\[56px\]|text-\[26px\]/);
  for (const label of ["Approved", "To be decided", "Declined", "Waitlisted", "Can&#x27;t attend", "Total registrations", "Remaining seats"]) assert.ok(html.includes(label));
  const original = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap }));
  assert.match(original, /text-\[26px\]/);
  assert.match(original, /flex min-h-8 shrink-0 items-center/);
  assert.doesNotMatch(original, /training-seat-|data-dot-matrix/);
});

test("Pandemic Preparedness keeps all seven label-number pairs horizontal without changing counts", () => {
  const cap = sessionCapacity(20, [
    ...Array.from({ length: 20 }, () => ({ status: "confirmed" })),
    ...Array.from({ length: 2 }, () => ({ status: "pending" })),
    ...Array.from({ length: 3 }, () => ({ status: "cancelled" })),
    ...Array.from({ length: 5 }, () => ({ status: "waitlist" })),
    ...Array.from({ length: 4 }, () => ({ status: "cancelled", withdrawn: true })),
  ]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap }));
  assert.equal((html.match(/class="flex min-h-8 shrink-0 items-center gap-1.5"/g) ?? []).length, 7);
  assert.deepEqual([...html.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map((m) => Number(m[1])), [20, 2, 3, 5, 4, 34, 0]);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /overflow-x-auto/);
});

test("inset summaries keep secondary statuses, zeros and large counts accessible", () => {
  for (const count of [0, 1, 19, 100, 1234]) {
    const cap = sessionCapacity(2000, Array.from({ length: count }, () => ({ status: "confirmed" })));
    const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap, compact: true }));
    assert.equal((html.match(/<dt>/g) ?? []).length, 8);
    assert.match(html, /<dt>Waitlisted<\/dt><dd>0<\/dd>/);
    assert.match(html, /<dt>Can&#x27;t attend<\/dt><dd>0<\/dd>/);
    assert.ok(html.includes(`data-dot-matrix="${count}"`));
    assert.ok(html.includes(`<span class="sr-only">${count}</span>`));
    assert.equal((html.match(/<circle /g) ?? []).length, Math.max(2, String(count).length) * 35);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }
});

test("capacity remains separate from total registrations and staff approvals", () => {
  const cap = sessionCapacity(12, [{ status: "confirmed" }, { status: "confirmed", internal: true }, { status: "cancelled" }]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap, compact: true }));
  assert.match(html, /<dt>Remaining seats<\/dt><dd>11<\/dd>/);
  assert.match(html, /<dt>Total capacity<\/dt><dd>12<\/dd>/);
  assert.match(html, /<dt>Total registrations<\/dt><dd>3<\/dd>/);
  assert.match(html, /data-dot-matrix="2"/);
});
