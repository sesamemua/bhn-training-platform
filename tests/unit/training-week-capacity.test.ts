/** The capacity monitor reads demand, and never counts staff against a room. */
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCapacity } from "../../src/lib/training-week/capacity";

const seats = (n: number, status = "pending", internal = false) => Array.from({ length: n }, () => ({ status, internal }));

test("pending requests count as demand; cancelled and internal do not", () => {
  const c = sessionCapacity(20, [...seats(21), ...seats(1, "confirmed"), ...seats(3, "cancelled"), ...seats(2, "confirmed", true)]);
  assert.equal(c.requested, 22);
  assert.equal(c.confirmed, 1);
  assert.equal(c.over, 2);
  assert.equal(c.level, "over");
});

test("levels: open, filling at 80%, full at capacity", () => {
  assert.equal(sessionCapacity(20, seats(15)).level, "open");
  assert.equal(sessionCapacity(20, seats(16)).level, "filling");
  assert.equal(sessionCapacity(20, seats(20)).level, "full");
  assert.equal(sessionCapacity(0, []).level, "open");
  assert.equal(sessionCapacity(0, seats(1)).level, "over");
});
