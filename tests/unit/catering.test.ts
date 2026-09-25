/** Catering copy: upcoming approved seats only, and a clean "what changed". */
import test from "node:test";
import assert from "node:assert/strict";
import { changesSince, currentEntries, fullText, updateText, type Snapshot } from "../../src/lib/allocation/catering";
import type { RegistrantRow } from "../../src/lib/allocation/registrant-views";

const NOW = new Date("2026-10-26T20:00:00Z"); // Monday evening: Monday's session is over
const row = (o: Partial<RegistrantRow>): RegistrantRow => ({
  bookingId: "b", personKey: "p", name: "N", email: "n@x.ca", workshopId: "tue", workshop: "RA 101", day: "2026-10-27",
  dayLabel: "Tue 27 Oct", status: "confirmed", letter: "sent", travel: "near", postcode: "", dietary: [], programmes: [], formSlug: null, dietaryOther: "",
  accessibility: "", preference: 1, appliedAt: "2026-09-20T10:00:00Z",
  workshopStart: "2026-10-27T16:00:00Z", workshopEnd: "2026-10-27T19:00:00Z", ...o,
});
const rows = [
  row({ bookingId: "1", personKey: "ana", name: "Ana Diaz", dietary: ["Vegan", "Other — please describe"], dietaryOther: "no snail", accessibility: "floating chair" }),
  row({ bookingId: "2", personKey: "ben", name: "Ben Ho", dietary: ["No dietary requirements"], accessibility: "none" }),
  row({ bookingId: "3", personKey: "cy", name: "Cy Park", status: "waitlist", dietary: ["Halal"] }),
  row({ bookingId: "4", personKey: "ana", name: "Ana Diaz", workshopId: "mon", workshop: "GMP", workshopStart: "2026-10-26T13:00:00Z", workshopEnd: "2026-10-26T16:00:00Z", dietary: ["Vegan"] }),
];

test("only approved seats in sessions that are not over", () => {
  const e = currentEntries(rows, NOW);
  assert.deepEqual(e.map((x) => `${x.workshop}:${x.name}`), ["RA 101:Ana Diaz", "RA 101:Ben Ho"]);
  assert.deepEqual(e[0].dietary, ["Vegan"], "the 'Other…' tick and 'No dietary requirements' are not needs");
  assert.equal(e[1].accessibility, "", "'none' is not a need");
});

test("the full copy reads like something to paste to a caterer", () => {
  const t = fullText(currentEntries(rows, NOW), NOW.toISOString());
  assert.match(t, /RA 101\n  Attendees: 2\n  Vegan: 1 \(Ana Diaz\)\n  Other — Ana Diaz: no snail\n  Accessibility — Ana Diaz: floating chair/);
  assert.doesNotMatch(t, /GMP/, "Monday's session is over");
  assert.doesNotMatch(t, /Cy Park/, "waitlisted is not attending");
});

test("changes since the last copy — and nothing about sessions already over", () => {
  const prev: Snapshot = { at: "2026-10-20T12:00:00Z", by: "Ruilin", entries: currentEntries(rows, new Date("2026-10-20T12:00:00Z")) };
  assert.equal(prev.entries.length, 3, "Monday was still ahead last time");
  const later = [
    { ...rows[0], dietary: ["Vegan", "Gluten-free"] },           // Ana changed
    // Ben no longer approved:
    { ...rows[1], status: "cancelled" },
    { ...rows[2], status: "confirmed" },                          // Cy now approved
    rows[3],
  ];
  const cur = currentEntries(later, NOW);
  const ch = changesSince(prev, cur, NOW);
  assert.deepEqual(ch.map((c) => `${c.kind}:${(c.now ?? c.was)!.name}`).sort(), ["added:Cy Park", "changed:Ana Diaz", "removed:Ben Ho"]);
  const t = updateText(ch, cur, prev.at, NOW.toISOString());
  assert.match(t, /\+ Added: Cy Park — Halal/);
  assert.match(t, /− No longer attending: Ben Ho/);
  assert.match(t, /~ Changed: Ana Diaz — now Vegan, Gluten-free, Other: no snail, accessibility: floating chair \(was Vegan, Other: no snail, accessibility: floating chair\)/);
  assert.match(t, /New total: 2 attendees/);
  assert.doesNotMatch(t, /GMP/, "Monday's GMP seat is not reported as removed — the session is over");
});

test("first copy ever: everything counts as new", () => {
  assert.equal(changesSince(null, currentEntries(rows, NOW), NOW).length, 2);
});
