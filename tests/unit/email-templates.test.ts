import test from "node:test";
import assert from "node:assert/strict";
import {
  BODY_MAX, bracedNames, DEFAULT_TEMPLATES, fieldsUsed, isEdit, MERGE_FIELDS,
  needsOneSession, OverrideSchema, parseOverrides, problemsWith, refusesMultiSession,
  render, resolveTemplates, STAGES, SUBJECT_MAX, unfilledGlobals, unknownFields,
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

test("the same field twice is filled BOTH times", () => {
  // The old version passed empty vars, so it asserted only on `missing`
  // and never checked a substitution at all — losing the /g would have
  // shipped a letter with a literal {{reply_by}} in its second half and
  // `missing` empty, so the send-time refusal would never have fired.
  const r = render("Reply by {{reply_by}}; if we hear nothing by {{reply_by}} we give it away.", { reply_by: "19 October" });
  assert.equal(r.text, "Reply by 19 October; if we hear nothing by 19 October we give it away.");
  assert.deepEqual(r.missing, []);
});

test("the same missing field twice is reported once", () => {
  assert.deepEqual(render("{{reply_by}} and {{reply_by}}", {}).missing, ["reply_by"]);
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
  // The body too. Dropping it from the spread left the page showing the
  // edit as saved while every send went out with the shipped wording
  // under the new subject line — and `edited` could not catch it,
  // because it is computed before the spread.
  assert.equal(declined.body, "My words");
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

/* ── the refusals that keep a wrong letter off the wire ──────────── */

test("a session-specific letter is refused to an audience spanning sessions", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "reminder_same_day")!;
  assert.ok(refusesMultiSession(t.subject, t.body, true), "should refuse");
  assert.equal(refusesMultiSession(t.subject, t.body, false), null, "one session is fine");
});

test("a letter naming no session goes to any audience", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "received")!;
  assert.equal(refusesMultiSession(t.subject, t.body, true), null);
});

test("the refusal explains itself, because the tab renders the same string", () => {
  const why = refusesMultiSession("{{session}}", "x", true);
  assert.ok(why && why.length > 40 && /session/i.test(why));
});

test("a sender-supplied field with nothing in it stops the whole send", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "support_invite")!;
  // The failure this replaced: the send took a fifteen-minute lock and
  // wrote an audit row claiming N recipients, then skipped all N.
  assert.deepEqual(
    unfilledGlobals(t.subject, t.body, { event: "e", coordinator: "c", reply_by: "soon" }),
    ["support_form_link"],
  );
  assert.deepEqual(
    unfilledGlobals(t.subject, t.body, { event: "e", coordinator: "c", reply_by: "soon", support_form_link: "https://x" }),
    [],
  );
});

test("per-session gaps are NOT treated as a whole-send failure", () => {
  // They are a per-recipient skip on purpose: one person with no
  // session must not stop the other two hundred.
  assert.deepEqual(unfilledGlobals("{{session}}", "{{session_time}}", {}), []);
});

/* ── typos the strict field syntax cannot see ────────────────────── */

test("a typo with a hyphen, digit or dot is caught, not posted", () => {
  // These are not field names at all, so the strict matcher skipped
  // them entirely: no problem reported, nothing substituted, and the
  // braces delivered to the reader exactly as typed.
  for (const bad of ["{{first-name}}", "{{session2}}", "{{first.name}}", "{{ first name }}"]) {
    const p = problemsWith("Subject", `Hello ${bad}`);
    assert.equal(p.length, 1, `${bad} was not caught`);
    assert.match(p[0], /is not a field/);
  }
});

test("the loose scan does not run away across a paragraph", () => {
  const runaway = `{{ ${"x".repeat(200)} }}`;
  assert.deepEqual(bracedNames(runaway), [], "an over-long brace is not reported as a field name");
});

test("every field in every shipped letter is a real one under the loose scan", () => {
  for (const t of DEFAULT_TEMPLATES) {
    for (const n of bracedNames(all(t))) {
      assert.ok(MERGE_FIELDS.some((f) => f.key === n), `${t.id} uses {{${n}}}`);
    }
  }
});

/* ── limits ──────────────────────────────────────────────────────── */

test("an over-long subject or body is refused at SAVE, not silently dropped at read", () => {
  // The old asymmetry: the write path checked emptiness only, the read
  // path enforced the length — so an over-long save reported success,
  // vanished on the next read, and took the previous good wording with
  // it, because the save had already replaced it.
  assert.ok(problemsWith("s".repeat(SUBJECT_MAX + 1), "body").some((p) => /subject is/i.test(p)));
  assert.ok(problemsWith("subject", "b".repeat(BODY_MAX + 1)).some((p) => /message is/i.test(p)));
  assert.deepEqual(problemsWith("s".repeat(SUBJECT_MAX), "b".repeat(BODY_MAX)), []);
});

test("the save check and the storage schema agree on the limits", () => {
  // If they drift, one of them lets through what the other drops.
  assert.equal(OverrideSchema.safeParse({ id: "x", subject: "s".repeat(SUBJECT_MAX), body: "" }).success, true);
  assert.equal(OverrideSchema.safeParse({ id: "x", subject: "s".repeat(SUBJECT_MAX + 1), body: "" }).success, false);
});

/* ── an override that is not really an edit ──────────────────────── */

test("wording identical to the shipped letter is not an edit", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "approved")!;
  assert.equal(isEdit(t, { subject: t.subject, body: t.body }), false);
  // Trimmed on the way in, so a trailing space is not a difference —
  // it used to create a row that won silently and could not be cleared,
  // because the reset button is hidden when nothing looks edited.
  assert.equal(isEdit(t, { subject: `${t.subject} `, body: t.body }), false);
  assert.equal(isEdit(t, { subject: t.subject, body: `${t.body} ` }), true);
});

test("an override equal to the default is ignored, so a code change still reaches people", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "approved")!;
  const r = resolveTemplates([{ id: "approved", subject: t.subject, body: t.body }]);
  assert.equal(r.find((x) => x.id === "approved")!.edited, false, "the reset button must stay reachable");
});

/* ── the whole set, filled in ────────────────────────────────────── */

test("every shipped letter renders with nothing left over", () => {
  const sample = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample || "https://example.org/form"]));
  for (const t of DEFAULT_TEMPLATES) {
    const b = render(t.body, sample);
    const s = render(t.subject, sample);
    assert.deepEqual(b.missing, [], `${t.id} body`);
    assert.deepEqual(s.missing, [], `${t.id} subject`);
    assert.ok(!b.text.includes("{{"), `${t.id} left a brace in the body`);
    assert.ok(!s.text.includes("{{"), `${t.id} left a brace in the subject`);
  }
});

test("a stored edit survives the round trip through storage", () => {
  const written = JSON.stringify([{ id: "declined", subject: "Ours", body: "Our words" }]);
  const back = resolveTemplates(parseOverrides(written)).find((t) => t.id === "declined")!;
  assert.equal(back.subject, "Ours");
  assert.equal(back.body, "Our words");
  assert.equal(back.edited, true);
});

test("the whole-event decline and the one-session decline are different letters", () => {
  // Partial approval is a designed outcome — approveFromClash is 1 — so
  // telling somebody who holds a confirmed seat "we cannot offer you a
  // place at Training Week" is simply false.
  const whole = DEFAULT_TEMPLATES.find((t) => t.id === "declined")!;
  const one = DEFAULT_TEMPLATES.find((t) => t.id === "session_declined")!;
  assert.ok(!needsOneSession(all(whole)), "the whole-event decline names no session");
  assert.ok(needsOneSession(all(one)), "the one-session decline names one, so the guard covers it");
  assert.match(one.body, /unaffected/i, "it has to say the other places still stand");
});
