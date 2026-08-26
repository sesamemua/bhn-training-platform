import test from "node:test";
import assert from "node:assert/strict";
import { notifyFeature, allNotifyFeatures } from "../../src/lib/notify/features";
import { notifyEmail, absolute } from "../../src/lib/notify/email";
import {
  resolveRecipients, splitAddresses, isEmail, greetingName,
  MAX_RECIPIENTS, MAX_NOTE_CHARS, MAX_ADDRESS_CHARS, PER_SENDER_PER_HOUR,
} from "../../src/lib/notify/recipients";

/**
 * The notification system is meant to be reused: a new admin feature
 * becomes notifiable by adding one entry to the register, and nothing
 * else changes. These tests pin the contract that makes that safe —
 * every feature's links resolve, the email reads as a message to one
 * person, and nothing a user types reaches the HTML unescaped.
 */

const F = () => notifyFeature("speaker-intake")!;

const mail = (over: Partial<Parameters<typeof notifyEmail>[0]> = {}) =>
  notifyEmail({
    feature: F(),
    context: "2026-industry-insights",
    recipientName: "Dr Amara Okonkwo",
    senderName: "Ruilin Yuan",
    senderEmail: "ruilin@example.com",
    ...over,
  });

/* ── The register ────────────────────────────────────────────────── */

test("every registered feature has usable links", () => {
  for (const f of allNotifyFeatures()) {
    const links = f.links("some-context");
    assert.ok(links.length > 0, `${f.id} has no links`);
    for (const l of links) {
      assert.ok(l.path.startsWith("/"), `${f.id}: ${l.path} is not a path`);
      assert.ok(l.label.trim().length > 0, `${f.id} has an unlabelled link`);
      assert.ok(l.note.trim().length > 0, `${f.id}: ${l.label} has no explanation`);
    }
    assert.equal(links.filter((l) => l.primary).length, 1, `${f.id} needs exactly one primary link`);
  }
});

test("every feature introduces itself in a couple of sentences", () => {
  for (const f of allNotifyFeatures()) {
    assert.ok(f.intro.length > 40, `${f.id}'s intro is too thin to be useful`);
    assert.ok(f.intro.length < 700, `${f.id}'s intro is a memo, not an introduction`);
    assert.ok(f.name.trim().length > 0);
  }
});

test("an unknown feature id is null, not a guess", () => {
  assert.equal(notifyFeature("no-such-feature"), null);
  assert.equal(notifyFeature(""), null);
});

test("a context with odd characters cannot break out of the URL", () => {
  const links = F().links("a b/../admin");
  for (const l of links) {
    assert.ok(!l.path.includes(" "), l.path);
    assert.ok(!l.path.includes("/../"), l.path);
  }
});

/* ── The email ───────────────────────────────────────────────────── */

test("it opens as a message to one person, by first name", () => {
  const m = mail();
  assert.ok(m.text.startsWith("Hi Amara,"), m.text.slice(0, 40));
  assert.ok(m.html.includes("Hi Amara,"));
  // Not the full name, and not the title.
  assert.ok(!m.text.includes("Hi Dr Amara Okonkwo,"));
});

test("an unknown name gets a greeting, not an empty one", () => {
  const m = mail({ recipientName: "" });
  assert.ok(m.text.startsWith("Hi there,"));
  assert.ok(!m.text.includes("Hi ,"));
});

test("an address in the name slot does not become the greeting", () => {
  assert.equal(greetingName("info@example.com"), "");
  assert.equal(greetingName("Dr Amara Okonkwo"), "Amara");
  assert.equal(greetingName("  professor  jane   doe "), "jane");
  assert.equal(greetingName(null), "");
});

test("stacked titles are all stripped, not just the first", () => {
  // A single strip leaves "Hi Dr," — the greeting is the one line that
  // has to sound like a person wrote it.
  assert.equal(greetingName("Prof. Dr. Amara Okonkwo"), "Amara");
  assert.equal(greetingName("Dr Dr Jane Doe"), "Jane");
  assert.equal(greetingName("Sir Ian Wallace"), "Ian");
});

test("a hyphenated or apostrophed name survives", () => {
  assert.equal(greetingName("Jean-Luc Picard"), "Jean-Luc");
  assert.equal(greetingName("Siobhan O'Brien"), "Siobhan");
});

test("both the links reach both parts of the email", () => {
  const m = mail();
  for (const l of F().links("2026-industry-insights")) {
    const url = absolute(l.path);
    assert.ok(m.text.includes(url), `${url} missing from the text part`);
    assert.ok(m.html.includes(url), `${url} missing from the HTML part`);
  }
});

test("the subject names the specific event when there is one", () => {
  // Two events running at once must not produce two identical subjects.
  const withCtx = mail({ contextName: "Industry Insights 2026" });
  assert.ok(withCtx.subject.includes("Industry Insights 2026"), withCtx.subject);
  const without = mail({ contextName: null });
  assert.ok(!without.subject.includes("Industry Insights"), without.subject);
  assert.ok(without.subject.includes("Speaker details"));
});

test("every feature that needs a context can resolve its own caveat", () => {
  // The caveat used to be a string the browser posted, which meant a
  // stale tab could report a closed form as open.
  for (const f of allNotifyFeatures()) {
    if (!f.needsContext) continue;
    assert.equal(typeof f.caveat, "function", `${f.id} cannot resolve a caveat`);
  }
});

test("it says who it is from, and signs off", () => {
  const m = mail();
  assert.ok(m.subject.includes("Ruilin Yuan"));
  assert.ok(m.text.includes("— Ruilin Yuan"));
  assert.ok(m.html.includes("Ruilin Yuan"));
  assert.ok(m.html.includes("ruilin@example.com"));
});

test("a note cannot inject markup", () => {
  const m = mail({ note: "<script>alert(1)</script>" });
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;"));
});

test("a caveat cannot inject markup either, and appears in both parts", () => {
  const m = mail({ caveat: '<img src=x onerror=alert(1)> the form is closed' });
  assert.ok(!m.html.includes("<img src=x"));
  assert.ok(m.text.includes("the form is closed"));
  assert.ok(m.html.includes("the form is closed"));
});

test("a sender name cannot inject markup", () => {
  const m = mail({ senderName: '"><b>x</b>' });
  assert.ok(!m.html.includes("<b>x</b>"));
});

test("an over-long note is cut before it is sent", () => {
  const m = mail({ note: "x".repeat(MAX_NOTE_CHARS * 3) });
  assert.ok(!m.html.includes("x".repeat(MAX_NOTE_CHARS + 1)));
  assert.ok(!m.text.includes("x".repeat(MAX_NOTE_CHARS + 1)));
});

test("no caveat means no warning block invented", () => {
  assert.ok(!mail().html.includes("#fef3c7"));
  assert.ok(mail({ caveat: "closed" }).html.includes("#fef3c7"));
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

test("an absurdly long address is refused without scanning it", () => {
  assert.ok(!isEmail(`${"a".repeat(MAX_ADDRESS_CHARS)}@x.com`));
});

test("the same colleague twice is one email, not two", () => {
  assert.deepEqual(resolveRecipients(["a@x.com", "A@X.com", " a@x.com "]).ok, ["a@x.com"]);
});

test("the address is sent as typed, since the local part is case-sensitive", () => {
  assert.deepEqual(resolveRecipients(["Jane.Doe@Example.com"]).ok, ["Jane.Doe@Example.com"]);
});

test("good and bad are separated, not all-or-nothing", () => {
  const { ok, bad } = resolveRecipients(["a@x.com", "oops", "b@x.com"]);
  assert.deepEqual(ok, ["a@x.com", "b@x.com"]);
  assert.deepEqual(bad, ["oops"]);
});

test("the recipient cap is a team, not a mailing list", () => {
  assert.ok(MAX_RECIPIENTS >= 5 && MAX_RECIPIENTS <= 50);
});

/* ── The HTML has to survive being an attribute ──────────────────── */

test("no style attribute is terminated early by a quoted font name", () => {
  // '"Segoe UI"' inside style="…" closes the attribute there, and the
  // browser throws the rest of the declaration away — every one of
  // these emails rendered in the serif default. Still valid enough to
  // render, which is why only looking at one found it.
  const m = mail({ note: 'a "quoted" word', caveat: 'another "quote"' });
  for (const attr of m.html.matchAll(/style="([^"]*)"/g)) {
    assert.ok(!attr[1].includes(";;"), `mangled declaration: ${attr[1]}`);
  }
  assert.ok(m.html.includes("'Segoe UI'"), "the font stack must use single quotes inside");
  assert.ok(!m.html.includes('"Segoe UI"'), "a double-quoted family name breaks the attribute");
});

test("a stray double quote in user text cannot open a new attribute", () => {
  const m = mail({ note: '" onmouseover="alert(1)' });
  // The text may well appear — as TEXT. What must not appear is an
  // attribute: a real quote character followed by a handler.
  assert.ok(!/onmouseover\s*=\s*"/.test(m.html), "the note escaped its container");
  assert.ok(m.html.includes("&quot; onmouseover=&quot;alert(1)"), "quotes should be escaped");
});

test("the hourly ceiling is above real use and below a relay", () => {
  // Telling forty colleagues about a launch is a Tuesday. Two hundred
  // an hour from one account is not.
  assert.ok(PER_SENDER_PER_HOUR > 40);
  assert.ok(PER_SENDER_PER_HOUR <= 500);
  assert.ok(PER_SENDER_PER_HOUR > MAX_RECIPIENTS, "one send must not exhaust the hour");
});
