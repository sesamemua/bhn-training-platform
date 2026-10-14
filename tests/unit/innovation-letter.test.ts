/** Innovation Ignited's confirmation: the seat, where, a withdraw link, and the dietary needs played back. */
import test from "node:test";
import assert from "node:assert/strict";
import { dietarySaid, innovationLetter } from "../../src/lib/training-week/innovation-letter";
import { letterHtml } from "../../src/lib/training-week/letter-html";

const base = {
  name: "Amara Okonkwo", session: "Innovation Ignited",
  start: new Date("2026-10-28T14:00:00Z"), end: new Date("2026-10-28T17:30:00Z"),
  venue: "Rm B250 (basement level 2), Leslie L. Dan Pharmacy Building, 144 College St, Toronto, ON M5S 3M2",
  cantAttendLink: "https://x/pass/t/cant-attend/b",
};

test("what they said about food comes back in one line; none is none", () => {
  assert.equal(dietarySaid({ dietary: ["Gluten-free", "Other — please describe"], dietary_other: "Severe nut allergy" }), "Gluten-free; Severe nut allergy");
  assert.equal(dietarySaid({ dietary: ["No dietary requirements"] }), null);
  assert.equal(dietarySaid({}), null);
});

test("a confirmed seat: name, time, room and address, a withdraw link, the dietary line and the calendar note", () => {
  const l = innovationLetter({ ...base, status: "confirmed", dietary: "Vegan" });
  assert.equal(l.subject, "You're registered: Innovation Ignited, Wednesday 28 October");
  assert.match(l.body, /^Hello Amara,/);
  assert.match(l.body, /Your seat at Innovation Ignited is confirmed:\n  • Innovation Ignited — Wednesday 28 October, 10:00–13:30\n    Rm B250 .*144 College St, Toronto, ON M5S 3M2\n    I can't make it — withdraw: https:\/\/x\/pass\/t\/cant-attend\/b/);
  assert.match(l.body, /told us about: Vegan\. If this is wrong or has changed, reply/);
  assert.match(l.body, /calendar file is attached/);
  const html = letterHtml(l.body, l.buttons);
  assert.match(html, /Innovation Ignited<\/strong><br><span[^>]*>Wednesday 28 October, 10:00–13:30<\/span><br><span[^>]*>Rm B250[^<]*144 College St/, "the room sits in the session's row");
  assert.match(html, /href="https:\/\/x\/pass\/t\/cant-attend\/b"/);
});

test("a full room: the waitlist, no withdraw link, no calendar note", () => {
  const l = innovationLetter({ ...base, status: "waitlist", dietary: null });
  assert.match(l.subject, /^You're on the waitlist/);
  assert.doesNotMatch(l.body, /withdraw|calendar file/);
  assert.match(l.body, /Dietary requirements and allergies: none\. If you have any, reply/);
  assert.deepEqual(l.buttons, []);
});
