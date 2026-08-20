import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEMPLATES, fieldsUsed, MERGE_FIELDS, needsOneSession, parseOverrides,
  problemsWith, render, resolveTemplates, STAGES, unknownFields,
} from "../../src/lib/allocation/email-templates";

const all = (t: { subject: string; body: string }) => `${t.subject}\n${t.body}`;

/* ── the letters themselves ──────────────────────────────────────── */

test("every stage the coordinator asked for has a letter", () => {
  const ids = DEFAULT_TEMPLATES.map((t) => t.id);
  for (const wanted of [
    "received", "approved", "declined",
    "support_invite", "support_declined",
    "reminder_3day", "reminder_same_day",
  ]) {
    assert.ok(ids.includes(wanted), `no template for ${wanted}`);
  }
});

test("the acknowledgement states the two-to-three week timeline", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "received")!;
  assert.match(t.body, /two to three weeks/i, "the whole point of this letter is the wait");
  assert.match(t.body, /either way/i, "it has to promise an answer, not just a decision");
});

test("the support decline says their place is not affected", () => {
  // The failure this guards: somebody reads "we cannot fund your
  // travel" as "you are not coming" and quietly does not turn up.
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "support_declined")!;
  assert.match(t.body, /place at the session is not affected/i);
});

test("the support invitation actually carries the form link", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "support_invite")!;
  assert.ok(fieldsUsed(all(t)).includes("support_form_link"));
});

test("no template names a field that does not exist", () => {
  for (const t of DEFAULT_TEMPLATES) {
    assert.deepEqual(unknownFields(all(t)), [], `${t.id} uses an unknown field`);
  }
});

test("every template has a subject, a body and a stage that exists", () => {
  for (const t of DEFAULT_TEMPLATES) {
    assert.ok(t.subject.trim(), `${t.id} has no subject`);
    assert.ok(t.body.trim(), `${t.id} has no body`);
    assert.ok(STAGES.includes(t.stage), `${t.id} is in stage "${t.stage}"`);
    assert.ok(t.when.trim(), `${t.id} does not say when to use it`);
  }
});

test("template ids are unique — they key the stored edits", () => {
  assert.equal(new Set(DEFAULT_TEMPLATES.map((t) => t.id)).size, DEFAULT_TEMPLATES.length);
});

test("letters about one session are the ones that name a session", () => {
  // Not a style question: a per-session letter may only go to one
  // workshop's list, and this is the predicate that decides.
  assert.ok(needsOneSession(all(DEFAULT_TEMPLATES.find((t) => t.id === "reminder_same_day")!)));
  assert.ok(!needsOneSession(all(DEFAULT_TEMPLATES.find((t) => t.id === "received")!)),
    "the acknowledgement goes out before anybody has a session");
  assert.ok(!needsOneSession(all(DEFAULT_TEMPLATES.find((t) => t.id === "declined")!)),
    "a decline has no session to name");
});

test("every letter addresses the person", () => {
  for (const t of DEFAULT_TEMPLATES) {
    assert.ok(fieldsUsed(t.body).some((f) => f === "first_name" || f === "name"), `${t.id} opens without a name`);
  }
});

/* ── filling one in ──────────────────────────────────────────────── */

test("a field with a value is replaced", () => {
  const r = render("Hello {{first_name}}, {{session}} is today.", { first_name: "Amara", session: "CL3 workshop" });
  assert.equal(r.text, "Hello Amara, CL3 workshop is today.");
  assert.deepEqual(r.missing, []);
});

test("a field with nothing to put in it is left visible and reported", () => {
  // Silently emptying it produces "your session is at " — a sentence
  // that looks deliberate and is worse than an obviously broken one.
  const r = render("Reply by {{reply_by}} please.", {});
  assert.match(r.text, /\{\{reply_by\}\}/);
  assert.deepEqual(r.missing, ["reply_by"]);
});

test("an empty string counts as nothing, not as an answer", () => {
  assert.deepEqual(render("{{support_form_link}}", { support_form_link: "" }).missing, ["support_form_link"]);
});

test("spacing inside the braces does not matter", () => {
  assert.equal(render("{{ first_name }}", { first_name: "Amara" }).text, "Amara");
});

test("the same field twice is filled both times and reported once", () => {
  const r = render("{{reply_by}} and {{reply_by}}", {});
  assert.deepEqual(r.missing, ["reply_by"]);
});

test("text with no fields comes back untouched", () => {
  assert.equal(render("Nothing to fill in here.", {}).text, "Nothing to fill in here.");
});

test("every field in the catalogue has a sample, so the preview is never blank", () => {
  for (const f of MERGE_FIELDS) {
    assert.ok(f.sample.trim() || f.key === "support_form_link", `${f.key} has no sample`);
    assert.ok(f.means.trim(), `${f.key} does not say what it means`);
  }
});

/* ── refusing bad wording ────────────────────────────────────────── */

test("a typo in a field name is refused, not saved", () => {
  const p = problemsWith("Hi", "Hello {{frist_name}}");
  assert.equal(p.length, 1);
  assert.match(p[0], /frist_name/);
});

test("an empty subject or body is refused", () => {
  assert.ok(problemsWith("", "body").some((x) => /subject/i.test(x)));
  assert.ok(problemsWith("subject", "   ").some((x) => /message/i.test(x)));
});

test("the shipped wording passes its own check", () => {
  for (const t of DEFAULT_TEMPLATES) {
    assert.deepEqual(problemsWith(t.subject, t.body), [], `${t.id} would be refused`);
  }
});

/* ── edits ───────────────────────────────────────────────────────── */

test("an edit replaces the wording and is marked as edited", () => {
  const r = resolveTemplates([{ id: "declined", subject: "Mine", body: "My words" }]);
  const declined = r.find((t) => t.id === "declined")!;
  assert.equal(declined.subject, "Mine");
  assert.equal(declined.edited, true);
  assert.equal(r.find((t) => t.id === "approved")!.edited, false);
});

test("an edit identical to the original is not called an edit", () => {
  const original = DEFAULT_TEMPLATES.find((t) => t.id === "approved")!;
  const r = resolveTemplates([{ id: "approved", subject: original.subject, body: original.body }]);
  assert.equal(r.find((t) => t.id === "approved")!.edited, false);
});

test("a stored edit for a template that no longer exists is ignored", () => {
  const r = resolveTemplates([{ id: "gone", subject: "x", body: "y" }]);
  assert.equal(r.length, DEFAULT_TEMPLATES.length);
  assert.ok(!r.some((t) => t.id === "gone"));
});

test("a new template added in code appears without a migration", () => {
  // The reason defaults live in code and only edits live in the
  // database: adding one here must not need the row to be rewritten.
  const r = resolveTemplates([{ id: "declined", subject: "Mine", body: "My words" }]);
  assert.equal(r.length, DEFAULT_TEMPLATES.length);
});

test("unreadable stored edits fall back to the shipped wording", () => {
  // Better a coordinator sees the originals than an admin page that
  // will not open.
  assert.deepEqual(parseOverrides("not json"), []);
  assert.deepEqual(parseOverrides(null), []);
  assert.deepEqual(parseOverrides('{"not":"an array"}'), []);
});

test("one broken edit does not take the good ones with it", () => {
  const raw = JSON.stringify([
    { id: "declined", subject: "Mine", body: "My words" },
    { id: 42, subject: null },
  ]);
  const kept = parseOverrides(raw);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "declined");
});

test("an over-long body is dropped rather than stored", () => {
  const raw = JSON.stringify([{ id: "declined", subject: "x", body: "y".repeat(20001) }]);
  assert.deepEqual(parseOverrides(raw), []);
});
