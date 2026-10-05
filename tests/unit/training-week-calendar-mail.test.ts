import test from "node:test";
import assert from "node:assert/strict";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { buildIcs } from "../../src/lib/events/ics";
import { trainingWeekMessages } from "../../src/lib/training-week/calendar-mail";

const letter = {
  to: "trainee@example.org", subject: "Your Training Week places",
  text: "Your places and pass: https://example.org/pass/test",
  html: '<p>Your places</p><img src="cid:pass-qr">',
  attachments: [{ filename: "pass.png", content: Buffer.from("QR fixture"), contentType: "image/png", cid: "pass-qr" }],
};
const calendar = (id: string, cancel = false) => ({
  title: `Session ${id}`, filename: `session-${id}.ics`,
  method: cancel ? "CANCEL" as const : "REQUEST" as const,
  content: buildIcs({
    uid: `seat-${id}@biohubnet.ca`, title: `Session ${id}`,
    start: new Date("2026-10-26T15:00:00Z"), end: new Date("2026-10-26T17:30:00Z"),
    organizerEmail: "info@biohubnet.ca", attendeeEmail: letter.to,
    attendeeName: "Family, Given", cancel, sequence: cancel ? 2 : 1,
  }),
});

test("multiple session invites and the pass QR are delivered in separate messages", () => {
  const messages = trainingWeekMessages(letter, [calendar("a"), calendar("b"), calendar("c", true)]);
  assert.equal(messages.length, 4);
  assert.deepEqual(messages[0].attachments, letter.attachments);
  assert.equal(messages[0].icalEvent, undefined);
  assert.match(messages[0].text, /separate emails/);
  assert.match(messages[0].html!, /cid:pass-qr/);
  for (const message of messages.slice(1)) {
    assert.equal(message.attachments, undefined);
    assert.equal(message.html, undefined);
    assert.equal(message.to, letter.to);
    assert.equal(message.signature, false);
    assert.ok(message.icalEvent);
    assert.ok(message.text.includes("https://example.org/pass/test"));
  }
  assert.equal(messages[1].icalEvent?.method, "REQUEST");
  assert.equal(messages[3].icalEvent?.method, "CANCEL");
  assert.match(messages[3].subject, /^Calendar cancellation:/);
});

test("waitlist-only letters do not produce a calendar invitation", () => {
  assert.deepEqual(trainingWeekMessages(letter, []), [letter]);
});

test("a single session still keeps its QR out of the invite and resends retain identity", () => {
  const first = trainingWeekMessages(letter, [calendar("a")]);
  const retry = trainingWeekMessages(letter, [calendar("a")]);
  assert.equal(first.length, 2);
  const uid = (content: string | Buffer) => content.toString().match(/^UID:.*$/m)?.[0];
  assert.equal(uid(first[1].icalEvent!.content), uid(retry[1].icalEvent!.content));
  assert.match(first[1].icalEvent!.content.toString(), /DTSTART:20261026T150000Z/);
});

test("real Nodemailer output has one calendar alternative and an importable attachment", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  for (const cancel of [false, true]) {
    const invite = trainingWeekMessages(letter, [calendar("a", cancel)])[1];
    const result = await transport.sendMail({ from: "BioHubNet <info@biohubnet.ca>", ...invite });
    const mime = result.message.toString();
    assert.equal((mime.match(/Content-Type: text\/calendar/g) ?? []).length, 1);
    assert.match(mime, new RegExp(`text/calendar; charset=utf-8; method=${cancel ? "CANCEL" : "REQUEST"}`, "i"));
    assert.match(mime, /Content-Type: application\/ics/i);
    assert.match(mime, /Content-Disposition: attachment; filename=session-a\.ics/i);
    assert.doesNotMatch(mime, /image\/png|cid:pass-qr/);
    assert.match(mime, /multipart\/alternative/);
  }
});

test("the production mail wrapper forwards native invites without altering ordinary attachments", async (t) => {
  const env = { SMTP_HOST: "smtp.example.org", SMTP_USER: "info@biohubnet.ca", SMTP_PASS: "test-only", SMTP_FROM: "BioHubNet <info@biohubnet.ca>" };
  const before = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const sent: SendMailOptions[] = [];
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (opts: SendMailOptions) => { sent.push(opts); } }));
  const { sendMail, mailSenderAddress } = await import("../../src/lib/mail");
  assert.equal(mailSenderAddress(), "info@biohubnet.ca");
  const invite = trainingWeekMessages(letter, [calendar("a")])[1];
  await sendMail(invite);
  await sendMail({ ...letter, signature: false });
  assert.deepEqual(sent[0].icalEvent, invite.icalEvent);
  assert.equal(sent[0].attachments, undefined);
  assert.equal(sent[1].icalEvent, undefined);
  assert.deepEqual(sent[1].attachments, letter.attachments);
  assert.equal(sent[1].text, letter.text);
  assert.equal(sent[1].html, letter.html);
});
