/** One letter per person: every owed seat in it, nothing already told, the right wording for each. */
import test from "node:test";
import assert from "node:assert/strict";
import { letterSummary, personLetter, type LetterSeat } from "../../src/lib/allocation/person-letter";
import { letterHtml } from "../../src/lib/training-week/letter-html";
import { icsName } from "../../src/lib/training-week/calendar-mail";

const seat = (session: string, status: string, told: string | null, h = 13): LetterSeat => ({
  bookingId: session, session, status, told, note: null, venue: "Room 1",
  start: new Date(`2026-10-26T${h}:00:00Z`), end: new Date(`2026-10-26T${h + 2}:00:00Z`),
});

test("three decisions, one letter: approved, waitlisted, declined — and no pass", () => {
  const l = personLetter({
    name: "Amara Okonkwo", passLink: "https://x/pass/abc",
    seats: [seat("A", "confirmed", null), seat("B", "waitlist", null, 16), seat("C", "cancelled", null, 18)],
  })!;
  assert.equal(l.seats.length, 3);
  assert.match(l.body, /^Hello Amara,/);
  assert.match(l.body, /Your seat in this session has been confirmed:\n  • A — /);
  assert.doesNotMatch(l.body, /https:\/\/x\/pass\/abc|attendance is confirmed/, "no pass link, and no promise about attendance");
  assert.doesNotMatch(l.body, /Room 1|QR/, "no room and no QR in the letter");
  assert.match(l.body, /Location information will be provided in future communications\./);
  assert.match(l.body, /on the waitlist:\n  • B/);
  assert.match(l.body, /not able to offer you a place at:\n  • C/);
  assert.match(l.body, /either full, or overlaps with a session you have been approved for\. Where your choices overlap, we can only approve one, based on your ranking\./);
  assert.match(l.body, /This decision is final\. Your other sessions are unaffected/);
  assert.equal(l.subject, "Your sessions at BioHubNet Training Week 2026", "a first letter is not an update");
  assert.deepEqual(l.calendar.map((c) => `${c.action}:${c.seat.session}`), ["add:A"]);
});

test("only seats that owe a letter; nothing owed, no letter", () => {
  const told = seat("A", "confirmed", "confirmed");
  assert.equal(personLetter({ name: "X", seats: [told] }), null);
  const l = personLetter({ name: "X", seats: [told, seat("B", "cancelled", null)] })!;
  assert.deepEqual(l.seats.map((s) => s.session), ["B"]);
  assert.match(l.body, /Your other sessions are unaffected/, "they still hold A");
});

test("a place taken back is released, and they are asked to remove it from their calendar", () => {
  const l = personLetter({ name: "X", seats: [seat("A", "cancelled", "confirmed")] })!;
  assert.match(l.body, /been released/);
  assert.match(l.body, /please remove it/, "said in words: a file cannot take an entry out");
  assert.deepEqual(l.calendar, [], "no calendar file for a removal");
  assert.match(l.subject, /^Update: /, "they have heard from us before");
  assert.deepEqual(letterSummary([seat("A", "cancelled", "confirmed"), seat("B", "confirmed", null)]).map((g) => g.label), ["Approved", "Released"]);
});

test("declined from everything gets the fuller explanation", () => {
  const l = personLetter({ name: "X", seats: [seat("A", "cancelled", null), seat("B", "cancelled", null, 16)] })!;
  assert.match(l.body, /priority went to current BioHubNet trainees/);
  assert.match(l.body, /This decision is final\./);
});

test("every place gets its own cancel link, drawn as a button, and the workshop's note", () => {
  const a = { ...seat("A", "confirmed", null), cantAttendLink: "https://x/pass/abc/cant-attend/a", workshopNote: "Bring photo ID." };
  const b = { ...seat("B", "confirmed", null, 16), cantAttendLink: "https://x/pass/abc/cant-attend/b" };
  const l = personLetter({ name: "X", seats: [a, b, seat("C", "waitlist", null, 18)] })!;
  assert.deepEqual(l.buttons, [
    { url: a.cantAttendLink, label: "I can't attend A" },
    { url: b.cantAttendLink, label: "I can't attend B" },
  ]);
  assert.match(l.body, /• A — [^\n]+\n    I can't attend A: https:\/\/x\/pass\/abc\/cant-attend\/a\n  • B — /, "each cancel link sits under its own session");
  assert.match(l.body, /A: Bring photo ID\./);
  const html = letterHtml(l.body, l.buttons);
  assert.equal((html.match(/font-size:13px;color:#475569/g) ?? []).length, 2, "two small, quiet buttons");
  assert.match(html, /href="https:\/\/x\/pass\/abc\/cant-attend\/b"[^>]*>I can't attend B</);
  assert.match(html, /<strong[^>]*>A<\/strong><br><span[^>]*>Monday 26 October/, "each session is its own row");
  assert.match(html, /border-left:4px solid #059669[^>]*><div[^>]*>Your seat in these sessions has been confirmed:/, "confirmed seats sit in a green box");
  assert.match(html, /border-left:4px solid #d97706/, "the waitlist in an amber one");
  assert.match(html, /<strong[^>]*>A<\/strong><br><span[^>]*>[^<]+<\/span><div[^>]*><a href="https:\/\/x\/pass\/abc\/cant-attend\/a"/, "the button is inside its session's row, in the green box");
  assert.match(html, /BioHubNet Training Week 2026/);
  assert.match(letterHtml("  • Discovery to Delivery — CCRM — Monday 26 October, 11:00–13:30"), /<strong[^>]*>Discovery to Delivery — CCRM<\/strong><br><span[^>]*>Monday 26 October/);
  assert.doesNotMatch(html, /<img/);
});

test("a calendar file is named after its workshop", () => {
  assert.equal(icsName("Microbix tour + Lunch & Learn"), "Microbix tour - Lunch - Learn.ics");
  assert.equal(icsName("Discovery to Delivery — CCRM"), "Discovery to Delivery - CCRM.ics");
  assert.equal(icsName("///"), "Training Week session.ics");
});
