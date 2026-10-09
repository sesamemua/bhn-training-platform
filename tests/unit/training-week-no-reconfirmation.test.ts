import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_TEMPLATES, resolveTemplates, templateById } from "../../src/lib/allocation/email-templates";
import { personLetter, type LetterSeat } from "../../src/lib/allocation/person-letter";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import { countsOf, type AdminWorkshop } from "../../src/lib/allocation/admin-types";

const obsolete = /a reply.*holds|no reply releases|everyone with a seat.*confirm|reply by.*whether you can come|can you still make it|cut-off/i;

test("no attendance reconfirmation template survives, including a saved override", () => {
  assert.equal(templateById("confirm_attendance"), undefined);
  assert.ok(!resolveTemplates([{ id: "confirm_attendance", subject: "Old", body: "Please confirm again" }]).some((t) => t.id === "confirm_attendance"));
  for (const template of DEFAULT_TEMPLATES) assert.doesNotMatch(template.body + template.when, obsolete, template.id);
});

test("approval and waitlist promotion are final but voluntary cancellation remains", () => {
  for (const id of ["approved", "waitlist_promoted"]) {
    const template = templateById(id)!;
    assert.match(template.body, /You don't need to reply/);
    assert.match(template.body, /\{\{cant_attend_link\}\}/);
    assert.doesNotMatch(template.body, /\{\{pass_link\}\}/, "the pass is no longer part of the letters");
    assert.doesNotMatch(template.body, /\{\{reply_by\}\}/);
  }
});

test("combined letters do not condition seats on another reply", () => {
  const seat: LetterSeat = { bookingId: "one", session: "Workshop", start: new Date("2026-10-26T14:00:00Z"), end: new Date("2026-10-26T15:00:00Z"), venue: null, status: "confirmed", told: null, note: null, cantAttendLink: "https://example.org/cant-attend" };
  const letter = personLetter({ name: "Test", seats: [seat, { ...seat, bookingId: "two", status: "waitlist" }] })!;
  assert.match(letter.body, /You don't need to reply/);
  assert.match(letter.body, /https:\/\/example.org\/cant-attend/);
  assert.doesNotMatch(letter.body, obsolete);
  assert.deepEqual(letter.calendar.map((c) => c.action), ["add"]);
});

test("form and chart approval go directly to attendance without dangling references", () => {
  assert.equal(TRAINING_WEEK_FORM.steps.find((s) => s.id === "w_seat")?.next, "w_attends");
  const ids = new Set(TRAINING_WEEK_FORM.steps.map((s) => s.id));
  for (const step of TRAINING_WEEK_FORM.steps) for (const id of [step.next, step.otherwise]) if (id) assert.ok(ids.has(id));
  assert.ok(!TRAINING_WEEK_FLOW.nodes.some((n) => n.field?.key === "confirmed"));
  assert.ok(TRAINING_WEEK_FLOW.edges.some((e) => e.from === "n13" && e.to === "n16" && !e.when));
  const nodeIds = new Set(TRAINING_WEEK_FLOW.nodes.map((n) => n.id));
  for (const edge of TRAINING_WEEK_FLOW.edges) assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to));
});

test("dashboard counts approved seats without a reconfirmation deadline", () => {
  const counts = countsOf({ capacity: 20, bookings: [
    { status: "confirmed", approvedAt: "2026-10-26T09:00:00Z" },
    { status: "waitlist", approvedAt: "2026-10-01T09:00:00Z" },
    { status: "cancelled", approvedAt: "2026-10-01T09:00:00Z" },
  ] } as AdminWorkshop);
  assert.equal(counts.approved, 1);
  assert.equal(counts.waitlisted, 1);
  assert.ok(!("byCutOff" in counts));
});

test("calendar copy confirms the seat and the ICS never requests an RSVP", () => {
  const copy = readFileSync(new URL("../../src/lib/formbuilder/acknowledge.ts", import.meta.url), "utf8");
  assert.match(copy, /Your seat in this session is confirmed/);
  assert.doesNotMatch(copy, obsolete);
  const ics = readFileSync(new URL("../../src/lib/events/ics.ts", import.meta.url), "utf8");
  assert.match(ics, /PARTSTAT=ACCEPTED;RSVP=FALSE/);
});
