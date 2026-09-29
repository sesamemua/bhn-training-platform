/** What the door says about a person, and which session is "now". */
import test from "node:test";
import assert from "node:assert/strict";
import { doorVerdict, passQrContent, sessionNow, tokenFromScan } from "../../src/lib/training-week/check-in";

const TOKEN = "Abc123_-xyzABCDEFGH12";
const room = (capacity: number, checkedIn: number) => ({ capacity, checkedIn });

test("approved people are checked in; nobody is recorded twice", () => {
  assert.equal(doorVerdict({ status: "confirmed", checkedInAt: null }, room(20, 5)), "checked_in");
  assert.equal(doorVerdict({ status: "confirmed", checkedInAt: "2026-10-26T13:31:00Z" }, room(20, 5)), "already");
});

test("waitlisted and undecided people get in only while the room has space", () => {
  assert.equal(doorVerdict({ status: "waitlist", checkedInAt: null }, room(20, 19)), "can_let_in");
  assert.equal(doorVerdict({ status: "waitlist", checkedInAt: null }, room(20, 20)), "full");
  assert.equal(doorVerdict({ status: "pending", checkedInAt: null }, room(20, 3)), "can_let_in");
  // No capacity set is not "full".
  assert.equal(doorVerdict({ status: "waitlist", checkedInAt: null }, room(0, 50)), "can_let_in");
});

test("declined, or no seat in this session, is not let in", () => {
  assert.equal(doorVerdict({ status: "cancelled", checkedInAt: null }, room(20, 1)), "declined");
  assert.equal(doorVerdict(null, room(20, 1)), "not_this_session");
});

test("the camera's reading is turned back into a token, and nothing else is", () => {
  assert.equal(tokenFromScan(passQrContent(TOKEN)), TOKEN);
  assert.equal(tokenFromScan(`https://bhn-training-platform.vercel.app/training-week/pass/${TOKEN}`), TOKEN);
  assert.equal(tokenFromScan(`  ${TOKEN}  `), TOKEN);
  assert.equal(tokenFromScan("https://example.com/menu"), null);
  assert.equal(tokenFromScan("BHNTW:short"), null);
  assert.equal(tokenFromScan(""), null);
});

test("the door opens on the session running now, else the next one, else the last", () => {
  const s = [
    { id: "mon-am", start: "2026-10-26T13:30:00Z", end: "2026-10-26T19:30:00Z" },
    { id: "tue-pm", start: "2026-10-27T16:00:00Z", end: "2026-10-27T20:30:00Z" },
  ];
  assert.equal(sessionNow(s, new Date("2026-10-26T15:00:00Z")), "mon-am");
  // 40 minutes before a start counts as its door being open.
  assert.equal(sessionNow(s, new Date("2026-10-27T15:20:00Z")), "tue-pm");
  assert.equal(sessionNow(s, new Date("2026-10-27T08:00:00Z")), "tue-pm");
  assert.equal(sessionNow(s, new Date("2026-11-01T00:00:00Z")), "tue-pm");
  assert.equal(sessionNow([], new Date()), null);
});
