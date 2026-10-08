/** The capacity monitor reads suggested occupancy, not raw demand. */
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCapacity } from "../../src/lib/training-week/capacity";

const seats = (n: number, status = "pending", internal = false) => Array.from({ length: n }, () => ({ status, internal }));

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
