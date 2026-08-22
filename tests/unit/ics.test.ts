import test from "node:test";
import assert from "node:assert/strict";
import { buildIcs } from "../../src/lib/events/ics";

const base = {
  uid: "seat-abc@biohubnet.ca",
  title: "CCRM tour + Lunch & Learn",
  start: new Date("2026-10-26T15:00:00.000Z"),
  end: new Date("2026-10-26T17:30:00.000Z"),
  organizerEmail: "info@biohubnet.ca",
  organizerName: "BioHubNet",
};
const lines = (ics: string) => ics.split("\r\n");
const has = (ics: string, line: string) => lines(ics).includes(line);

test("an approval is an invitation a calendar will add", () => {
  const ics = buildIcs(base);
  assert.ok(has(ics, "METHOD:REQUEST"));
  assert.ok(has(ics, "STATUS:CONFIRMED"));
  assert.ok(has(ics, "BEGIN:VEVENT"));
  assert.ok(has(ics, "END:VCALENDAR"));
});

test("a reversal withdraws the entry instead of adding a second one", () => {
  // A seat approved and later declined leaves the session in somebody's
  // calendar for ever, and they turn up.
  const ics = buildIcs({ ...base, cancel: true, sequence: 3 });
  assert.ok(has(ics, "METHOD:CANCEL"));
  assert.ok(has(ics, "STATUS:CANCELLED"));
  // Same UID and a higher SEQUENCE is what makes it a withdrawal
  // rather than a different event.
  assert.ok(has(ics, `UID:${base.uid}`));
  assert.ok(has(ics, "SEQUENCE:3"));
});

test("times are written in UTC, whatever the server's clock is set to", () => {
  const ics = buildIcs(base);
  assert.ok(has(ics, "DTSTART:20261026T150000Z"));
  assert.ok(has(ics, "DTEND:20261026T173000Z"));
});

test("commas and semicolons in a title do not break the file", () => {
  // Unescaped, a comma ends the value and the rest of the title becomes
  // a parameter nothing understands.
  const ics = buildIcs({ ...base, title: "Lunch, Learn; and a tour", location: "MaRS, Toronto" });
  // Written with String.raw so the backslashes are the ones that end up
  // in the file, not ones the test source ate.
  assert.ok(ics.includes(String.raw`SUMMARY:Lunch\, Learn\; and a tour`), "the title is not escaped");
  assert.ok(ics.includes(String.raw`LOCATION:MaRS\, Toronto`), "the location is not escaped");
  // And a bare comma is never left in a value.
  for (const l of ics.split("\r\n")) {
    if (!l.startsWith("SUMMARY:") && !l.startsWith("LOCATION:")) continue;
    assert.ok(!/[^\\],/.test(l), `unescaped comma in: ${l}`);
  }
});

test("a long line is folded, and folds with a leading space", () => {
  const ics = buildIcs({ ...base, description: "x".repeat(400) });
  const long = lines(ics).filter((l) => l.length > 75);
  assert.deepEqual(long, [], "a line went over the 75-octet limit");
  assert.ok(lines(ics).some((l) => l.startsWith(" ")), "nothing was folded");
});

test("every line ends CRLF, which is what the spec requires", () => {
  const ics = buildIcs(base);
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "a bare newline slipped in");
});

test("naming the attendee makes it an invitation to them", () => {
  const ics = buildIcs({ ...base, attendeeEmail: "amara@example.org", attendeeName: "Amara Okonkwo" });
  assert.match(ics, /ATTENDEE;CN=Amara Okonkwo/);
  assert.match(ics, /mailto:amara@example\.org/);
});

test("the same seat keeps the same UID, so a re-send updates rather than duplicates", () => {
  const a = buildIcs({ ...base, sequence: 0 });
  const b = buildIcs({ ...base, sequence: 1, location: "Somewhere else" });
  const uid = (s: string) => lines(s).find((l) => l.startsWith("UID:"));
  assert.equal(uid(a), uid(b));
});
