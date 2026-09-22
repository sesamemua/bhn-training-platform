import test from "node:test";
import assert from "node:assert/strict";
import { lumaTotal } from "../../src/lib/events/registrations";

test("a hidden guest list is totalled from the ticket types", () => {
  // The Symposium's reply: guest_count 0 because the list is hidden, tickets still counted.
  assert.equal(lumaTotal({ guest_count: 0, ticket_types: [{ num_guests: 8 }, { num_guests: 5 }] }), 13);
});

test("a public event agrees either way, and a reply without counts reads as unknown", () => {
  assert.equal(lumaTotal({ guest_count: 157, ticket_types: [{ num_guests: 157 }] }), 157);
  assert.equal(lumaTotal({ guest_count: 42 }), 42);
  assert.equal(lumaTotal({}), null);
  assert.equal(lumaTotal(null), null);
});
