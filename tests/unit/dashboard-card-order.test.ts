import test from "node:test";
import assert from "node:assert/strict";
import { CardOrderSchema, DEFAULT_CARD_ORDER, moveDashboardCard } from "../../src/lib/dashboard/card-order";

test("default admin card order puts registration, speaker actions, released seats, and capacity first", () => {
  assert.deepEqual(DEFAULT_CARD_ORDER.slice(0, 4), ["symposium", "speakers", "released", "capacity"]);
});
test("moving a card swaps one neighbour without dropping cards or mutating the input", () => {
  const original = [...DEFAULT_CARD_ORDER];
  const moved = moveDashboardCard(original, "speakers", 1);
  assert.deepEqual(moved.slice(0, 4), ["symposium", "released", "speakers", "capacity"]);
  assert.deepEqual(original, DEFAULT_CARD_ORDER);
  assert.deepEqual(moveDashboardCard(moved, "speakers", -1), original);
  assert.deepEqual(moveDashboardCard(original, "symposium", -1), original);
  assert.deepEqual(moveDashboardCard(original, "marketing", 1), original);
});
test("shared layout requires every known card exactly once", () => {
  assert.equal(CardOrderSchema.safeParse([...DEFAULT_CARD_ORDER].reverse()).success, true);
  for (const order of [[], DEFAULT_CARD_ORDER.slice(1), [...DEFAULT_CARD_ORDER, "other"], DEFAULT_CARD_ORDER.map(() => "symposium")]) {
    assert.equal(CardOrderSchema.safeParse(order).success, false);
  }
});
