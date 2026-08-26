import test from "node:test";
import assert from "node:assert/strict";
import {
  speakerLinkEmail,
  speakerFormUrl,
  speakerAdminUrl,
  resolveRecipients,
  splitAddresses,
  isEmail,
  MAX_NOTE_CHARS,
  MAX_RECIPIENTS,
} from "../../src/lib/events/speaker-link-email";

/**
 * The "tell a colleague" email exists to carry three things a colleague
 * cannot guess: what the thing is, the link they hand to a speaker, and
 * the page where what the speaker sends lands. If either link goes
 * missing the email is worse than not sending one, so both are pinned
 * here in both the HTML and the plain-text part.
 */

const mail = () =>
  speakerLinkEmail({
    eventTitle: "BioHubNet Industry Insights 2026",
    slug: "2026-industry-insights",
    intakeOpen: true,
    senderName: "Ruilin Yuan",
    note: "Please forward to anyone you have invited.",
  });

test("it carries the public speaker link", () => {
  const m = mail();
  assert.match(m.formUrl, /\/events\/2026-industry-insights\/speaker$/);
  assert.ok(m.html.includes(m.formUrl), "missing from the HTML part");
  assert.ok(m.text.includes(m.formUrl), "missing from the plain-text part");
});

test("it carries the admin page", () => {
  const m = mail();
  assert.match(m.adminUrl, /\/admin\/events\/2026-industry-insights\/speakers$/);
  assert.ok(m.html.includes(m.adminUrl), "missing from the HTML part");
  assert.ok(m.text.includes(m.adminUrl), "missing from the plain-text part");
});

test("the two links are not the same link", () => {
  const m = mail();
  assert.notEqual(m.formUrl, m.adminUrl);
});

test("the admin link is the per-event route, not the symposium shortcut", () => {
  // /admin/workspace/symposium-2026/speakers is correct for exactly one
  // event; this email is sent for any of them.
  assert.ok(!speakerAdminUrl("some-other-event").includes("workspace"));
  assert.match(speakerAdminUrl("some-other-event"), /\/admin\/events\/some-other-event\/speakers$/);
});

test("a slug with odd characters cannot break out of the URL", () => {
  assert.ok(!speakerFormUrl("a b/../admin").includes(" "));
  assert.ok(!speakerFormUrl("a b/../admin").includes("/../"));
});

test("the sender's name and note reach the reader", () => {
  const m = mail();
  assert.ok(m.html.includes("Ruilin Yuan"));
  assert.ok(m.text.includes("Please forward to anyone you have invited."));
  assert.ok(m.html.includes("Please forward to anyone you have invited."));
});

test("a note cannot inject markup into the HTML part", () => {
  const m = speakerLinkEmail({
    eventTitle: "E",
    slug: "s",
    intakeOpen: true,
    senderName: "A",
    note: '<script>alert(1)</script>',
  });
  assert.ok(!m.html.includes("<script>"), "the note was not escaped");
  assert.ok(m.html.includes("&lt;script&gt;"));
});

test("an event title cannot inject markup either", () => {
  const m = speakerLinkEmail({
    eventTitle: '"><img src=x onerror=alert(1)>',
    slug: "s",
    intakeOpen: true,
    senderName: "A",
  });
  assert.ok(!m.html.includes("<img src=x"));
});

test("a closed intake is said out loud, in both parts", () => {
  const m = speakerLinkEmail({ eventTitle: "E", slug: "s", intakeOpen: false, senderName: "A" });
  assert.match(m.text, /CLOSED/);
  assert.match(m.html, /currently closed/);
  // ...and not claimed when it is open.
  assert.ok(!mail().html.includes("currently closed"));
});

test("an over-long note is cut, not sent whole", () => {
  const m = speakerLinkEmail({
    eventTitle: "E", slug: "s", intakeOpen: true, senderName: "A",
    note: "x".repeat(MAX_NOTE_CHARS * 3),
  });
  assert.ok(!m.html.includes("x".repeat(MAX_NOTE_CHARS + 1)));
});

/* ── Who it goes to ──────────────────────────────────────────────── */

test("addresses split on whatever separator was used", () => {
  assert.deepEqual(splitAddresses("a@x.com, b@x.com;c@x.com\nd@x.com e@x.com"),
    ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]);
  assert.deepEqual(splitAddresses("   "), []);
});

test("obvious non-addresses are rejected", () => {
  assert.ok(isEmail("a@x.com"));
  assert.ok(!isEmail("a@x"));
  assert.ok(!isEmail("not an email"));
  assert.ok(!isEmail("@x.com"));
});

test("the same colleague twice is one email, not two", () => {
  const { ok } = resolveRecipients(["a@x.com", "A@X.com", " a@x.com "]);
  assert.deepEqual(ok, ["a@x.com"], "case-different duplicates should collapse");
});

test("a duplicate is dropped but the address is sent as typed", () => {
  const { ok } = resolveRecipients(["Jane.Doe@Example.com"]);
  assert.deepEqual(ok, ["Jane.Doe@Example.com"], "the local part is case-sensitive");
});

test("good and bad are separated, not all-or-nothing", () => {
  const { ok, bad } = resolveRecipients(["a@x.com", "oops", "b@x.com"]);
  assert.deepEqual(ok, ["a@x.com", "b@x.com"]);
  assert.deepEqual(bad, ["oops"]);
});

test("the recipient cap is a team, not a mailing list", () => {
  assert.ok(MAX_RECIPIENTS >= 5 && MAX_RECIPIENTS <= 50);
});
