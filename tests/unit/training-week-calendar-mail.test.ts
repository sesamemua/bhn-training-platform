/** One email per person: a single session as a native invitation, several as attached .ics files. */
import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { buildIcs } from "../../src/lib/events/ics";
import { trainingWeekMessages } from "../../src/lib/training-week/calendar-mail";

const letter = { to: "trainee@example.org", subject: "Your Training Week places", text: "Your places.", html: "<p>Your places</p>" };
const calendar = (id: string, cancel = false) => ({
  title: `Session ${id}`, filename: `session-${id}.ics`,
  method: cancel ? "CANCEL" as const : "REQUEST" as const,
  content: buildIcs({
    uid: `seat-${id}@biohubnet.ca`, title: `Session ${id}`,
    start: new Date("2026-10-26T15:00:00Z"), end: new Date("2026-10-26T17:30:00Z"),
    organizerEmail: "info@biohubnet.ca", attendeeEmail: letter.to, cancel, sequence: cancel ? 2 : 1,
  }),
});

test("several sessions still make one email, each session an attached .ics", () => {
  const messages = trainingWeekMessages(letter, [calendar("a"), calendar("b"), calendar("c", true)]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].icalEvent, undefined);
  assert.deepEqual(messages[0].attachments?.map((a) => a.filename), ["session-a.ics", "session-b.ics", "session-c.ics"]);
  assert.match(String(messages[0].attachments?.[2].contentType), /method=CANCEL/);
  assert.match(messages[0].text, /attached calendar files/);
});

test("no sessions, no calendar: the letter goes as it is", () => {
  assert.deepEqual(trainingWeekMessages(letter, []), [letter]);
});

test("one session rides in the same email as a native invitation", async () => {
  const [only, ...rest] = trainingWeekMessages(letter, [calendar("a")]);
  assert.equal(rest.length, 0);
  assert.equal(only.icalEvent?.method, "REQUEST");
  assert.equal(only.text, letter.text);
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const mime = (await transport.sendMail({ from: "BioHubNet <info@biohubnet.ca>", ...only })).message.toString();
  assert.match(mime, /text\/calendar; charset=utf-8; method=REQUEST/i);
  assert.match(mime, /DTSTART:20261026T150000Z/);
});
