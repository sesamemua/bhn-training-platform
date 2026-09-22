import test from "node:test";
import assert from "node:assert/strict";
import { lumaTotal, lumaWaiting } from "../../src/lib/events/registrations";

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

test("the host view gives who is awaiting approval and who is waitlisted", () => {
  // The Symposium's host view on 22 Sep: 13 going, 3 pending approval, 1 waitlisted.
  const reply = { guest_status_to_counts: {
    approved: { rsvps: 13, tickets: 13 }, pending_approval: { rsvps: 3, tickets: 3 }, waitlist: { rsvps: 1, tickets: 1 }, declined: { rsvps: 0, tickets: 0 },
  } };
  assert.deepEqual(lumaWaiting(reply), { approval: 3, waitlist: 1 });
  assert.deepEqual(lumaWaiting({ guest_status_to_counts: {} }), { approval: 0, waitlist: 0 });
  // Signed out: Luma answers without the counts.
  assert.equal(lumaWaiting({ message: "Unauthorized" }), null);
  assert.equal(lumaWaiting(null), null);
});
