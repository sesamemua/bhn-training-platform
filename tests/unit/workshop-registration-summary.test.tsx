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
    for (const label of ["Approved", "To be decided", "Declined", "Total", "Remaining seats"]) assert.ok(html.includes(`<dt class="text-[13px] font-semibold leading-snug text-muted">${label}</dt>`));
    assert.match(html, /text-\[24px\] font-bold/);
    assert.ok(html.includes(`Remaining seats: ${Math.max(0, capacity - 1)}`));
    assert.match(html, /Trainee seats/);
    assert.doesNotMatch(html, /NaN|Infinity|registration records/);
  }
});
