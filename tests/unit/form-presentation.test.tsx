import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Confirmation, FormFillView, gapPrompt, Progress, progressToSubmit, Question, refusalPlacement,
} from "../../src/components/workspace/FormFillView";
import { SessionCalendar } from "../../src/components/workspace/SessionCalendar";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import {
  buildTrainingWeekV2, V2_ACCEPTED, V2_DIET_OTHER, V2_SYMPOSIUM_REGISTERED,
} from "../../src/lib/formbuilder/training-week-v2";
import { missing, visibleFields, type Answers } from "../../src/lib/formbuilder/logic";
import { BLOCKED_MESSAGE } from "../../src/lib/eligibility/messages";
import { parseForm, type BuiltForm, type FormField, type Presentation } from "../../src/lib/formbuilder/types";

/**
 * A second version of a live form, and the first version not moving.
 *
 * Every presentation flag is tested both ways round: the words it takes
 * away are there without it and gone with it. The "without" half is the
 * one people have registered on, so it is also checked whole — a form
 * with no presentation renders exactly what it rendered before.
 *
 * Built on the LIVE v1 document, not on TRAINING_WEEK_FORM: v2 is copied
 * from the row people actually registered on, and the code constant has
 * drifted from it.
 */
const V1: BuiltForm = parseForm(
  JSON.parse(readFileSync(join(process.cwd(), "tests/unit/fixtures/training-week-v1-live.json"), "utf8")).fields,
);

type FillProps = Partial<ComponentProps<typeof FormFillView>>;
const noop = () => {};
const submit = async () => ({ ok: true });
const MODES: FillProps[] = [{}, { mode: "test", liveHref: "/apply/x", submit }, { mode: "live", submit }];

const look = (doc: BuiltForm, presentation: Presentation): BuiltForm => ({ ...doc, presentation });
const field = (doc: BuiltForm, key: string) => doc.fields.find((f) => f.key === key)!;
/** Just these questions, in document order, with nothing hiding them. */
const only = (doc: BuiltForm, keys: string[]): BuiltForm => ({
  ...doc,
  fields: doc.fields.filter((f) => keys.includes(f.key)).map((f) => ({ ...f, showWhen: [] })),
});
const withHelp = (doc: BuiltForm, key: string, help: string): BuiltForm => ({
  ...doc,
  fields: doc.fields.map((f) => (f.key === key ? { ...f, help } : f)),
});
const paint = (doc: BuiltForm, extra: FillProps = {}) =>
  renderToStaticMarkup(<FormFillView {...extra} doc={doc} title="Training Week 2026 registration" />);

const SESSIONS = field(V1, "sessions");
const TUESDAY = SESSIONS.slots.filter((s) => s.day === "2026-10-27").map((s) => s.option);
// CCRM on Monday and the showcase on Wednesday: two picks that do not clash.
const APART = [SESSIONS.options[0], SESSIONS.options[5]];
const ACCEPTED = field(V1, "bhn_status").options[0];
const PLAN_TO = field(V1, "symposium_signup").options.find((o) => /plan to/i.test(o))!;
const LUMA = "[BioHubNet 2026 Annual Symposium · Luma](https://luma.com/wh30nh1n)";

/* ── nothing moves for a form without a presentation ─────────────── */

test("no presentation renders exactly what it rendered before, in every mode", () => {
  for (const [name, doc] of [["TRAINING_WEEK_FORM", TRAINING_WEEK_FORM], ["live v1", V1]] as const) {
    const unset: BuiltForm = { ...doc, presentation: undefined };
    const stored = parseForm(JSON.parse(JSON.stringify(unset)));
    assert.equal("presentation" in stored, false, `${name}: parseForm invented a presentation`);
    // An empty object is "as every other form does it", not a half skin.
    const empty = parseForm(JSON.parse(JSON.stringify({ ...doc, presentation: {} })));

    for (const extra of MODES) {
      assert.equal(paint(unset, extra), paint(stored, extra), `${name} ${extra.mode ?? "preview"} moved`);
      assert.equal(paint(empty, extra), paint(stored, extra), `${name} ${extra.mode ?? "preview"} moved on {}`);
    }

    const f = field(doc, "sessions");
    const tuesday = f.slots.filter((s) => s.day === "2026-10-27").map((s) => s.option);
    const answers = {
      bhn_status: field(doc, "bhn_status").options[0],
      sessions: tuesday,
      symposium_signup: field(doc, "symposium_signup").options.find((o) => /plan to/i.test(o))!,
    };
    for (const mode of ["preview", "test", "live"] as const) {
      assert.equal(
        renderToStaticMarkup(<Confirmation title="T" doc={unset} answers={answers} receipt={undefined} mode={mode} />),
        renderToStaticMarkup(<Confirmation title="T" doc={stored} answers={answers} receipt={undefined} mode={mode} />),
        `${name} receipt (${mode}) moved`,
      );
    }
    assert.equal(
      renderToStaticMarkup(<Question doc={unset} field={f} index={3} answers={answers} set={noop} flagged={false} />),
      renderToStaticMarkup(<Question doc={stored} field={field(stored, "sessions")} index={3} answers={answers} set={noop} flagged={false} />),
      `${name} session question moved`,
    );
  }
});

/* ── theme ────────────────────────────────────────────────────────── */

test("theme “site” puts the site skin on the form and on the receipt, and nothing else does", () => {
  assert.doesNotMatch(paint(V1), /bhn-site/);
  const site = look(V1, { theme: "site" });
  for (const extra of MODES) {
    assert.match(paint(site, extra), /^<div class="mx-auto w-full max-w-\[760px\] mt-5 pb-24 bhn-site">/);
  }
  const receipt = (doc: BuiltForm) =>
    renderToStaticMarkup(<Confirmation title="T" doc={doc} answers={{ bhn_status: ACCEPTED }} receipt={undefined} mode="live" />);
  assert.match(receipt(site), /^<div class="mx-auto w-full max-w-\[760px\] mt-5 pb-16 bhn-site">/);
  assert.doesNotMatch(receipt(V1), /bhn-site/);
});

/* ── C2: the refusal sits by the address ─────────────────────────── */

const EMAIL = field(V1, "trainee_email");
const emailQuestion = (doc: BuiltForm, gateBlocked?: boolean) =>
  renderToStaticMarkup(
    <Question
      doc={doc} field={EMAIL} index={2} answers={{ trainee_email: "someone@example.ca" }}
      set={noop} flagged={false} gateBlocked={gateBlocked}
    />,
  );

test("gateInline: “we can't place you” is drawn inside the email question, under the field", () => {
  const html = emailQuestion(look(V1, { gateInline: true }), true);
  // Question renders one element, the question's own block — so anything
  // in this string is inside it.
  assert.match(html, /^<div data-q="trainee_email"/);
  assert.ok(html.indexOf('role="alert"') > html.indexOf("<input"), "the message comes after the field it is about");
  assert.match(html, /<div id="eligibility-refusal" role="alert"/);
  assert.match(html, /<input[^>]*aria-describedby="eligibility-refusal"/, "the field names the message as its description");
  assert.match(html, /We can(?:&#x27;|')t place you on this list/);
  assert.match(html, /Correct the address above/);
});

test("gateInline: nothing is said, or pointed at, until the roster refuses — and first paint does not move", () => {
  const html = emailQuestion(look(V1, { gateInline: true }), false);
  assert.doesNotMatch(html, /role="alert"|aria-describedby|place you on this list/);
  // The refusal is state set by the server's answer, so first paint is
  // the same form with or without the flag. (The box above the list is
  // the other half of the switch; it only exists after a real refusal.)
  for (const extra of MODES) assert.equal(paint(look(V1, { gateInline: true }), extra), paint(V1, extra));
});

/* ── rich text ────────────────────────────────────────────────────── */

test("richText: question help keeps its paragraphs and a link with its own words", () => {
  const help = `Please note that the Annual Symposium requires a separate registration.\n${LUMA}`;
  const doc = withHelp(only(V1, ["symposium_signup"]), "symposium_signup", help);

  const plain = paint(doc);
  assert.doesNotMatch(plain, /<a href="https:\/\/luma\.com/, "plain help is plain text");
  assert.ok(plain.includes(LUMA), "without the flag the markup is shown as typed");

  const rich = paint(look(doc, { richText: true }));
  assert.match(
    rich,
    /<label class="block">[\s\S]*<a href="https:\/\/luma\.com\/wh30nh1n" target="_blank" rel="noopener noreferrer"[^>]*>BioHubNet 2026 Annual Symposium · Luma<\/a>[\s\S]*<\/label>/,
  );
  assert.match(rich, /<span class="block"><span>Please note/, "first paragraph");
  assert.match(rich, /<span class="block mt-1\.5"><a href="https:\/\/luma\.com/, "second paragraph");
  assert.ok(!rich.includes("](https://"), "no markup left showing");
});

test("richText: consent help, note help and the submit note read it too", () => {
  const consent: FormField = { ...EMAIL, key: "terms", type: "consent", label: "I agree", help: "Read **the terms** on [our site](https://biohubnet.ca/terms)." };
  const consentHtml = (doc: BuiltForm) =>
    renderToStaticMarkup(<Question doc={doc} field={consent} index={1} answers={{}} set={noop} flagged={false} />);
  assert.match(consentHtml(V1), /\*\*the terms\*\*/);
  assert.match(consentHtml(look(V1, { richText: true })), /<strong class="font-semibold text-fg">the terms<\/strong>/);
  assert.match(consentHtml(look(V1, { richText: true })), /<a href="https:\/\/biohubnet\.ca\/terms"[^>]*>our site<\/a>/);

  const note = withHelp(
    only(V1, ["need_account_note"]),
    "need_account_note",
    "Create an account on [the training platform](https://bhn-training-platform.vercel.app).\nReturn to this form once you are accepted into a program.",
  );
  assert.match(paint(note), /\[the training platform\]\(/, "Linked shows the brackets as typed");
  const richNote = paint(look(note, { richText: true }));
  assert.match(richNote, /<a href="https:\/\/bhn-training-platform\.vercel\.app"[^>]*>the training platform<\/a>/);
  assert.match(richNote, /<span class="block mt-1\.5"><span>Return to this form/);

  const noted: BuiltForm = { ...only(V1, ["dietary"]), submitNote: "**PLEASE NOTE:** Photography, audio and video recording may occur throughout this event." };
  assert.match(paint(noted), /\*\*PLEASE NOTE:\*\*/);
  assert.match(paint(look(noted, { richText: true })), /<strong class="font-semibold text-fg">PLEASE NOTE:<\/strong>/);
});

test("richText: a note carried onto the receipt keeps its labelled link", () => {
  const doc = withHelp(V1, "symposium_link_note", `Register whenever you are ready: ${LUMA}`);
  const receipt = (d: BuiltForm) =>
    renderToStaticMarkup(
      <Confirmation title="T" doc={d} answers={{ bhn_status: ACCEPTED, symposium_signup: PLAN_TO }} receipt={undefined} mode="live" />,
    );
  assert.match(receipt(look(doc, { richText: true })), /<section[^>]*>[\s\S]*<a href="https:\/\/luma\.com\/wh30nh1n"[^>]*>BioHubNet 2026 Annual Symposium · Luma<\/a>/);
  // Without the flag it is still carried (the address is still an
  // address) but reads as the raw link.
  assert.match(receipt(doc), /<a href="https:\/\/luma\.com\/wh30nh1n\)?"/);
  assert.doesNotMatch(receipt(doc), />BioHubNet 2026 Annual Symposium · Luma<\/a>/);
});

/* ── C13: the calendar hint ──────────────────────────────────────── */

test("hideCalendarHint: no reading lesson under the week — but a cap is still said", () => {
  const plain = renderToStaticMarkup(<SessionCalendar field={SESSIONS} chosen={[]} onToggle={noop} />);
  assert.match(plain, /Height is how long a session runs/);
  assert.match(plain, /Choose as many as you like/);

  const hidden = renderToStaticMarkup(<SessionCalendar field={SESSIONS} chosen={[]} onToggle={noop} hideHint />);
  assert.doesNotMatch(hidden, /Height is how long|order of preference|Choose as many/);

  const capped = { ...SESSIONS, maxChoices: 3 };
  const cap = renderToStaticMarkup(<SessionCalendar field={capped} chosen={[APART[0]]} onToggle={noop} hideHint />);
  assert.doesNotMatch(cap, /Height is how long/);
  assert.match(cap, /You can choose up to 3 — 2 left\./);

  // Through the form, from the document.
  const sessionsOnly = only(V1, ["sessions"]);
  assert.match(paint(sessionsOnly), /Height is how long a session runs/);
  assert.doesNotMatch(paint(look(sessionsOnly, { hideCalendarHint: true })), /Height is how long/);
});

/* ── C14: the rank note ──────────────────────────────────────────── */

const sessionsQuestion = (doc: BuiltForm, chosen: string[]) =>
  renderToStaticMarkup(
    <Question doc={doc} field={field(doc, "sessions")} index={3} answers={{ sessions: chosen }} set={noop} flagged={false} />,
  );

// The sentence, not the word: v1's own question help also says
// "oversubscribed", and that is copy the v2 document replaces, not this flag.
const RANK_NOTE = /This is the order we go by when a room is oversubscribed/;

test("hideRankNote: the picker's ranking stops explaining oversubscription and keeps everything else", () => {
  assert.match(sessionsQuestion(V1, APART), RANK_NOTE);

  const hidden = look(V1, { hideRankNote: true });
  const html = sessionsQuestion(hidden, APART);
  assert.doesNotMatch(html, RANK_NOTE);
  assert.match(html, /Your ranking/, "the ranking itself stays");
  assert.doesNotMatch(html, /<p class="mt-2 text-\[12px\] leading-snug text-muted">/, "and no empty note under it");

  assert.match(sessionsQuestion(hidden, [APART[0]]), /Pick another and it becomes your 2nd choice\./);
  assert.match(sessionsQuestion(hidden, TUESDAY), /cannot both be attended/, "the red conflict panel stays");
  const capped: BuiltForm = { ...hidden, fields: hidden.fields.map((f) => (f.key === "sessions" ? { ...f, maxChoices: 3 } : f)) };
  assert.match(sessionsQuestion(capped, APART), /You can choose 1 more\./, "a cap is still news");
});

test("hideRankNote: the receipt still says why two picks are red, without the sentence before it", () => {
  const receipt = (doc: BuiltForm, sessions: string[]) =>
    renderToStaticMarkup(
      <Confirmation title="T" doc={doc} answers={{ bhn_status: ACCEPTED, sessions }} receipt={undefined} mode="live" />,
    );
  assert.match(receipt(V1, TUESDAY), /oversubscribed\. <span class="font-semibold text-red-600">/);
  assert.match(receipt(V1, APART), RANK_NOTE);

  const hidden = look(V1, { hideRankNote: true });
  const clash = receipt(hidden, TUESDAY);
  assert.doesNotMatch(clash, RANK_NOTE);
  assert.match(clash, /<p class="mt-2 text-\[12px\] leading-snug text-muted"><span class="font-semibold text-red-600">Two of these cannot both be attended/);
  assert.doesNotMatch(receipt(hidden, APART), RANK_NOTE);
});

/* ── C15: a progress tracker ─────────────────────────────────────── */

test("progress bar: a tracker instead of the counts, labelled with real numbers", () => {
  // Both optional, so this is Continue with nothing to wait for.
  const two = only(V1, ["travel_over_2h", "postcode"]);
  const plain = paint(two);
  assert.match(plain, /2 questions/);
  assert.match(plain, /1 more question after this/);
  assert.doesNotMatch(plain, /role="progressbar"/);

  for (const extra of MODES) {
    const html = paint(look(two, { progress: "bar" }), extra);
    assert.match(html, /<div role="progressbar" aria-labelledby="form-progress" aria-valuemin="0" aria-valuemax="2" aria-valuenow="0"/);
    assert.match(html, /<span id="form-progress"[^>]*>0 of 2 done<\/span>/);
    assert.match(html, /bg-elevated[^"]*"><div class="[^"]*bg-brand-500[^"]*" style="width:0%"/);
    assert.doesNotMatch(html, /more question|questions marked|2 questions/);
    assert.match(html, />Continue</, "the tracker replaces a line, not the button");
    assert.doesNotMatch(html, /continue-hint/, "nothing points at a hint that is not there");
  }
});

test("progress bar: nothing to track until there is a second question, and never out of range", () => {
  // The real form opens on question one alone. "0 of 1" would be broken
  // by the very next click, which reveals eight more.
  for (const extra of MODES) {
    const html = paint(look(V1, { progress: "bar" }), extra);
    assert.doesNotMatch(html, /role="progressbar"|NaN|questions marked/);
  }
  assert.doesNotMatch(paint(look(V1, { progress: "bar" }), { mode: "live", submit }), /<header/, "no empty box above question one");
  assert.match(paint(V1, { mode: "live", submit }), /<header/, "the counter is still there without the flag");

  // Every neighbouring pair of registration questions: whatever is drawn
  // stays inside its own ends.
  const reg = V1.fields.filter((f) => (f.stage ?? "registration") === "registration");
  let drawn = 0;
  for (let i = 0; i + 1 < reg.length; i++) {
    const html = paint(look(only(V1, [reg[i].key, reg[i + 1].key]), { progress: "bar" }));
    assert.doesNotMatch(html, /NaN|Infinity/);
    for (const m of html.matchAll(/aria-valuemax="(\d+)" aria-valuenow="(\d+)"[\s\S]*?width:(\d+)%/g)) {
      drawn += 1;
      const [max, now, width] = [Number(m[1]), Number(m[2]), Number(m[3])];
      assert.ok(max >= 2 && now >= 0 && now <= max && width <= 100, `${reg[i].key}+${reg[i + 1].key}: ${now}/${max} at ${width}%`);
    }
  }
  assert.ok(drawn > 0, "the loop above checked nothing");
});

/* ── C19: the waiting hint ───────────────────────────────────────── */

test("hideWaitingHint: no “Answer this one to carry on.”, and Continue still waits", () => {
  // The email is required and blank, so Continue is disabled beside it.
  const waiting = only(V1, ["trainee_email", "travel_over_2h"]);
  const plain = paint(waiting);
  assert.match(plain, /Answer this one to carry on\./);
  assert.match(plain, /aria-describedby="continue-hint"/);

  const html = paint(look(waiting, { hideWaitingHint: true }));
  assert.doesNotMatch(html, /Answer this one to carry on|continue-hint/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Continue<\/button>/);

  // "1 more question after this" is not the waiting hint; only the bar replaces it.
  assert.match(paint(look(only(V1, ["travel_over_2h", "postcode"]), { hideWaitingHint: true })), /1 more question after this/);
});

test("hideWaitingHint: the one-question prompt goes too", () => {
  assert.match(paint(V1), /Answer “Where do you stand with BioHubNet\?” to carry on\./);
  const html = paint(look(V1, { hideWaitingHint: true }));
  assert.doesNotMatch(html, /to carry on/);
  assert.doesNotMatch(html, /role="status"/, "and no empty status box in its place");
  // "N questions still need an answer" is kept for several gaps; a first
  // paint cannot show it (only the last open question can be unanswered),
  // so that half is held by the condition in FormFillView, not here.
});

/* ── C10: capacity on the cell ───────────────────────────────────── */

test("capacity: said on the cell when the slot has one, only in the picker, and it moves no box", () => {
  const rooms: FormField = {
    ...SESSIONS,
    slots: SESSIONS.slots.map((s) => (s.day === "2026-10-27" ? { ...s, capacity: 30 } : s)),
  };
  const picker = renderToStaticMarkup(<SessionCalendar field={rooms} chosen={[]} onToggle={noop} />);
  const cellOf = (html: string, name: string) => html.split("<button").find((t) => t.includes(`title="${name} ·`))!;

  assert.equal(picker.match(/Up to 30 people/g)?.length, 2);
  for (const option of TUESDAY) {
    const name = option.split(" · ").pop()!;
    // The time line's own scale, so it reads as detail rather than a second name.
    assert.match(cellOf(picker, name), /<span class="mt-0\.5 block text-\[9\.5px\] leading-tight text-subtle">Up to 30 people<\/span>/, name);
  }
  assert.doesNotMatch(cellOf(picker, "CL3 workshop"), /Up to/, "a slot without a capacity says nothing");

  const receipt = renderToStaticMarkup(<SessionCalendar readOnly field={rooms} chosen={TUESDAY} />);
  assert.doesNotMatch(receipt, /Up to/, "not on the receipt");

  const before = renderToStaticMarkup(<SessionCalendar field={SESSIONS} chosen={[]} onToggle={noop} />);
  assert.doesNotMatch(before, /Up to/);
  const styleOf = (html: string, name: string) => /style="([^"]*)"/.exec(cellOf(html, name))![1];
  for (const option of TUESDAY) {
    const name = option.split(" · ").pop()!;
    assert.equal(styleOf(picker, name), styleOf(before, name), `${name} was redrawn`);
  }
});

/* ── the one-gap line, after first paint ─────────────────────────── */

// v2 as scripts/create-training-week-v2.ts builds it, from the live v1 row.
const V2: BuiltForm = buildTrainingWeekV2(
  JSON.parse(readFileSync(join(process.cwd(), "tests/unit/fixtures/training-week-v1-live.json"), "utf8")),
).doc;

const answeredIn = (answers: Answers) => (f: FormField) => {
  const v = answers[f.key];
  return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
};

/**
 * The end of the form as FormFillView works it out, with `open` fields
 * open — every one by default, which is where "Show all" puts the form
 * and where Continue leaves a finished one. A static render never gets
 * past first paint, so these states are reached through the same pieces
 * the component calls.
 */
const endOf = (doc: BuiltForm, answers: Answers, open?: number) => {
  const shown = visibleFields(doc, answers);
  const at = open ?? shown.length;
  const gaps = missing(doc, answers);
  const more = shown.length - at;
  const ended = more === 0 && gaps.length === 0;
  return {
    shown, more, gaps, ended,
    prompt: gapPrompt({
      more, gaps, stopped: false, hideWaitingHint: doc.presentation?.hideWaitingHint === true, lastKey: shown[at - 1]?.key,
    }),
    progress: progressToSubmit({ shown, open: at, answered: answeredIn(answers), ended }),
  };
};

const V2_FINISHED: Answers = {
  bhn_status: V2_ACCEPTED,
  trainee_email: "someone@utoronto.ca",
  travel_over_2h: "No",
  sessions: [field(V2, "sessions").options[0]],
  symposium_signup: V2_SYMPOSIUM_REGISTERED,
  dietary: ["Vegan"],
};

test("v2 is the form these cases are about: the hint is off, and a finished registration can be submitted", () => {
  assert.equal(V2.presentation?.hideWaitingHint, true);
  assert.equal(V2.presentation?.progress, "bar");
  assert.equal(endOf(V2, V2_FINISHED).ended, true);
  assert.equal(endOf(V2, V2_FINISHED).prompt, null);
});

test("hideWaitingHint: “Other — please describe” on a finished form still says what is missing", () => {
  const other = { ...V2_FINISHED, dietary: ["Vegan", V2_DIET_OTHER] };
  // Ticked: a question opens below dietary and Continue appears — that is not a dead end.
  assert.equal(endOf(V2, other, visibleFields(V2, V2_FINISHED).length).more, 1);
  assert.equal(endOf(V2, other, visibleFields(V2, V2_FINISHED).length).prompt, null);

  // Continue pressed with it blank: nothing to open, no Submit, and the
  // empty box is not the last question on screen.
  const stuck = endOf(V2, other);
  assert.deepEqual(stuck.gaps.map((f) => f.key), ["dietary_other"]);
  assert.equal(stuck.more, 0);
  assert.equal(stuck.ended, false, "no Submit");
  assert.notEqual(stuck.shown.at(-1)?.key, "dietary_other");
  assert.equal(stuck.prompt, `Answer “${field(V2, "dietary_other").label}” to carry on.`);
});

test("hideWaitingHint: after “Show all”, a required question left blank is still named", () => {
  const stuck = endOf(V2, { ...V2_FINISHED, sessions: [] });
  assert.deepEqual(stuck.gaps.map((f) => f.key), ["sessions"]);
  assert.equal(stuck.ended, false, "no Submit");
  assert.equal(stuck.more, 0, "no Continue");
  assert.match(stuck.prompt ?? "", /^Answer “Choose and Rank Your Sessions” to carry on\.$/);
});

test("hideWaitingHint: the one gap goes unsaid only when it is the last question open", () => {
  // First paint: question one alone, starred directly above.
  assert.equal(endOf(V2, {}).prompt, null);
  assert.match(endOf({ ...V2, presentation: undefined }, {}).prompt ?? "", /^Answer “What is your current BioHubNet program status\?” to carry on\.$/);
  // Several gaps are always said.
  const several = endOf(V2, { bhn_status: V2_ACCEPTED });
  assert.ok(several.gaps.length > 1);
  assert.equal(several.prompt, `${several.gaps.length} questions still need an answer.`);
  // Continue on screen, or the form stopped: the line is not needed.
  const common = { gaps: [field(V2, "sessions")], hideWaitingHint: true, lastKey: "newsletter_optin" };
  assert.equal(gapPrompt({ ...common, more: 1, stopped: false }), null);
  assert.equal(gapPrompt({ ...common, more: 0, stopped: true }), null);
  assert.match(gapPrompt({ ...common, more: 0, stopped: false }) ?? "", /Choose and Rank Your Sessions/);
});

/* ── C15, measured toward Submit ─────────────────────────────────── */

test("progress bar: full exactly when Submit is there, with optional questions left blank", () => {
  const done = endOf(V2, V2_FINISHED);
  assert.ok(done.shown.some((f) => !f.required && f.type !== "note" && !answeredIn(V2_FINISHED)(f)), "some optional question is blank");
  assert.equal(done.progress.done, done.progress.total);

  const html = renderToStaticMarkup(<Progress done={done.progress.done} total={done.progress.total} />);
  assert.match(html, /<span id="form-progress"[^>]*>Ready to submit<\/span>/);
  assert.match(html, new RegExp(`aria-valuemax="${done.progress.total}" aria-valuenow="${done.progress.total}"`));
  assert.match(html, /style="width:100%"/);

  const part = renderToStaticMarkup(<Progress done={3} total={8} />);
  assert.match(part, /<span id="form-progress"[^>]*>3 of 8 done<\/span>/);
  assert.match(part, /aria-valuemax="8" aria-valuenow="3"[\s\S]*style="width:38%"/);
});

test("progress bar: an optional question counts once they are past it, not while it is the one open", () => {
  const answers: Answers = { bhn_status: V2_ACCEPTED, trainee_email: "someone@utoronto.ca" };
  const shown = visibleFields(V2, answers);
  const upTo = (key: string) => shown.findIndex((f) => f.key === key) + 1;
  const asked = shown.filter((f) => f.type !== "note").length;

  // Travel open and blank: two answered, travel still in front of them.
  assert.deepEqual(endOf(V2, answers, upTo("travel_over_2h")).progress, { done: 2, total: asked });
  // Continue past it to the sessions: travel is behind them now.
  assert.deepEqual(endOf(V2, answers, upTo("sessions")).progress, { done: 3, total: asked });
  // A required question does not count until it is answered, however far they go.
  const all = endOf(V2, answers);
  assert.equal(all.progress.done, asked - all.gaps.length);
});

test("progress bar: never full while Submit is not on screen", () => {
  // A required follow-up still blank.
  const other = endOf(V2, { ...V2_FINISHED, dietary: ["Vegan", V2_DIET_OTHER] });
  assert.equal(other.ended, false);
  assert.equal(other.progress.done, other.progress.total - 1);

  // Everything answered, but a branch opened above the last question and
  // it is waiting behind a Continue.
  const answered: Answers = { ...V2_FINISHED, question: "None", newsletter_optin: field(V2, "newsletter_optin").options[0] };
  const shown = visibleFields(V2, answered);
  const behind = endOf(V2, answered, shown.length - 1);
  assert.equal(behind.more, 1);
  assert.equal(behind.progress.done, behind.progress.total - 1);
});

/* ── C2, when the refusal comes from Submit ───────────────────────── */

test("gateInline: a refusal at Submit goes under the address, not above question one", () => {
  const blocked = [BLOCKED_MESSAGE];
  assert.deepEqual(refusalPlacement(blocked, { gateInline: true, emailOnScreen: true }), { gate: true, refused: [] });
  // v1: the box above the form, exactly as before.
  assert.deepEqual(refusalPlacement(blocked, { gateInline: false, emailOnScreen: true }), { gate: false, refused: blocked });
  // Under a question nobody can see is nowhere.
  assert.deepEqual(refusalPlacement(blocked, { gateInline: true, emailOnScreen: false }), { gate: false, refused: blocked });
  // Anything else the server said is still said, above.
  assert.deepEqual(
    refusalPlacement(["Too many registrations.", BLOCKED_MESSAGE], { gateInline: true, emailOnScreen: true }),
    { gate: true, refused: ["Too many registrations."] },
  );
  assert.deepEqual(
    refusalPlacement(["Could not reach the server."], { gateInline: true, emailOnScreen: true }),
    { gate: false, refused: ["Could not reach the server."] },
  );
  assert.deepEqual(refusalPlacement(undefined, { gateInline: false, emailOnScreen: true }), { gate: false, refused: ["It was not accepted."] });

  // After "Show all" there is no Continue, so the box says how Submit comes back.
  const fromSubmit = renderToStaticMarkup(
    <Question
      doc={look(V1, { gateInline: true })} field={EMAIL} index={2} answers={{ trainee_email: "someone@example.ca" }}
      set={noop} flagged={false} gateBlocked gateRetry="submit"
    />,
  );
  assert.match(fromSubmit, /<input[^>]*aria-describedby="eligibility-refusal"/);
  assert.match(fromSubmit, /Correct the address above and submit again if you typed it wrong\./);
  assert.doesNotMatch(fromSubmit, /Continue/);
  assert.match(emailQuestion(look(V1, { gateInline: true }), true), /press Continue again/, "the Continue check keeps its words");
});

/* ── the thank-you screen's timeline ─────────────────────────────── */

test("confirmationNote: the thank-you screen gives the form's own timeline, and only a form with one", () => {
  const DEFAULT = /We will come back to you within two to three weeks\./;
  const note =
    "The BioHubNet team will email you with seat offers during the **last week of September**.\nQuestions? Visit [biohubnet.ca](https://biohubnet.ca).";
  const receipt = (doc: BuiltForm, mode: "preview" | "test" | "live") =>
    renderToStaticMarkup(<Confirmation title="T" doc={doc} answers={{ bhn_status: ACCEPTED }} receipt={undefined} mode={mode} />);

  for (const doc of [look(V1, { richText: true, confirmationNote: note }), look(V1, { confirmationNote: note })]) {
    for (const mode of ["preview", "live"] as const) {
      assert.match(receipt(V1, mode), DEFAULT);
      const html = receipt(doc, mode);
      assert.doesNotMatch(html, /two to three weeks|after three weeks/);
      assert.match(
        html,
        /<div class="mt-4 rounded-xl border border-line bg-card p-4"><p class="text-\[13px\] leading-relaxed text-fg"><span class="block">[\s\S]*?<strong class="font-semibold text-fg">last week of September<\/strong>/,
      );
      assert.match(html, /<span class="block mt-2">[\s\S]*?<a href="https:\/\/biohubnet\.ca"[^>]*>biohubnet\.ca<\/a>/);
    }
    // A test entry gives no timeline, note or no note.
    assert.doesNotMatch(receipt(doc, "test"), /last week of September|two to three weeks/);
  }
});
