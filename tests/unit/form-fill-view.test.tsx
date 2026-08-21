import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormFillView } from "../../src/components/workspace/FormFillView";
import {
  ACCEPTED, EQUIP_APPLIED, HAS_ACCOUNT, NO_ACCOUNT, TRAINING_WEEK_FORM,
} from "../../src/lib/formbuilder/training-week";
import { parseForm, type BuiltForm } from "../../src/lib/formbuilder/types";
import { hasLink } from "../../src/lib/formbuilder/linkify";

/**
 * The registrant's view, rendered.
 *
 * First paint only — renderToStaticMarkup does not run effects or
 * clicks — which is exactly the moment that matters: what a person
 * meets before they have told us anything. A conditional question
 * visible here is visible to everybody.
 */
const paint = (doc: BuiltForm, title = "Training Week 2026 registration") =>
  renderToStaticMarkup(React.createElement(FormFillView, { doc, title }));

const html = paint(TRAINING_WEEK_FORM);

test("it says, on the page, that nothing is submitted", () => {
  // An admin will show this to a colleague. A colleague who thinks they
  // have registered is worse off than one who never saw it.
  assert.match(html, /nothing is sent and nobody is registered/);
});

test("the form opens with the question it is supposed to open with", () => {
  assert.match(html, /Where do you stand with BioHubNet\?/);
});

test("questions behind an answer are not shown before that answer", () => {
  // The trainee follow-ups are gated on trainee = Yes. If they paint,
  // every registrant sees them and the logic is decoration.
  for (const hidden of ["The name we know you by", "The email registered with BioHubNet", "Which programmes are you in?"]) {
    assert.ok(!html.includes(hidden), `"${hidden}" is showing before it should`);
  }
});

test("the confirmation question is not on the registration form at all", () => {
  // Stage, not a rule that might accidentally be true. It goes out by
  // email once a place is approved.
  assert.ok(!html.includes("Can you still make it?"));
});

test("required questions are marked", () => {
  assert.match(html, /title="Required"/);
});

test("there is a way to submit, and it is checked for real", () => {
  // Submit only appears once the whole form has been opened — offering
  // it under question one would be offering to submit a blank form. A
  // one-question form is open from the start, so it shows immediately.
  // An OPTIONAL question, so nothing is outstanding on first paint.
  // Submit no longer appears while a required question is unanswered —
  // answering it can still reveal the rest of the form.
  const oneQuestion: BuiltForm = {
    ...TRAINING_WEEK_FORM,
    fields: TRAINING_WEEK_FORM.fields
      .filter((f) => f.key === "dietary")
      .map((f) => ({ ...f, showWhen: [] })),
  };
  const solo = paint(oneQuestion);
  assert.match(solo, /Submit registration/);
  assert.match(solo, /Checked for real\. Sent nowhere\./);
  assert.ok(!solo.includes(">Continue<"), "nothing left to continue to");
});

test("the second stage is offered, because this form has one", () => {
  assert.match(html, /The email after approval/);
});

test("a form with no confirmation questions offers no stage switch", () => {
  const oneStage: BuiltForm = {
    ...TRAINING_WEEK_FORM,
    fields: TRAINING_WEEK_FORM.fields.filter((f) => f.stage !== "confirmation"),
  };
  assert.ok(!paint(oneStage).includes("The email after approval"));
});

test("an empty form says so rather than rendering a bare page", () => {
  const empty: BuiltForm = { ...TRAINING_WEEK_FORM, fields: [] };
  assert.match(paint(empty), /No questions in this part of the form yet/);
});

test("the one question on screen is numbered 1", () => {
  // The numbers count QUESTIONS, so they have to keep counting the same
  // way as the form unfolds — a note appearing must not shift them.
  const numbers = html.match(/font-mono text-\[11px\] text-subtle">(\d+)</g) ?? [];
  assert.deepEqual(numbers.map((m) => m.match(/>(\d+)</)![1]), ["1"]);
});

test("the title shown is the form's own, not a placeholder", () => {
  assert.match(paint(TRAINING_WEEK_FORM, "Something else entirely"), /Something else entirely/);
});

/* ── the session picker is a calendar, not a list ────────────────── */

import { SessionCalendar } from "../../src/components/workspace/SessionCalendar";
import { gridFromSlots } from "../../src/lib/allocation/schedule";

const sessions = TRAINING_WEEK_FORM.fields.find((f) => f.key === "sessions")!;
const calendar = renderToStaticMarkup(
  React.createElement(SessionCalendar, { field: sessions, chosen: [], onToggle: () => {} }),
);

/** The inline height a session's box was given, as a number of percent. */
function boxHeight(title: string): number {
  // Each cell carries its own title attribute; the style sits on the
  // same tag, so read the tag and pull the height out of it.
  const tag = calendar.split("<button").find((t) => t.includes(title));
  assert.ok(tag, `no box drawn for ${title}`);
  const m = tag.match(/height:\s*([\d.]+)%/);
  assert.ok(m, `${title} has no height`);
  return Number(m[1]);
}

function boxTop(title: string): number {
  const tag = calendar.split("<button").find((t) => t.includes(title));
  const m = tag!.match(/top:\s*([\d.]+)%/);
  assert.ok(m, `${title} has no top`);
  return Number(m[1]);
}

test("a session's height is how long it runs", () => {
  // The whole point. CL3 runs 09:30-17:00 and the CCRM tour runs
  // 11:00-13:30 — three times as long, and it has to look it.
  const cl3 = boxHeight("CL3 workshop");
  const ccrm = boxHeight("CCRM tour");
  assert.ok(cl3 > ccrm * 2.5, `CL3 is ${cl3}% and the tour is ${ccrm}% — not to scale`);
});

test("two sessions of the same length are drawn the same height", () => {
  // Both Monday tours run 2.5 hours.
  assert.equal(boxHeight("CCRM tour"), boxHeight("Catalent tour"));
});

test("the longer of the Tuesday pair is drawn taller", () => {
  // Negotiation runs to 16:30, Communication Chameleon to 16:00. Half
  // an hour is a real difference to somebody planning a train home.
  assert.ok(boxHeight("Negotiation Skills") > boxHeight("Communication Chameleon"));
});

test("a session's position is when it starts", () => {
  // The CCRM tour is at 11:00 and the Catalent tour at 14:00, so one
  // sits well below the other on a 9-to-5 grid.
  assert.ok(boxTop("Catalent tour") > boxTop("CCRM tour") + 20);
  // The two Tuesday sessions both start at 13:00 — same height on the page.
  assert.equal(boxTop("Communication Chameleon"), boxTop("Negotiation Skills"));
});

test("the hours are drawn down the side", () => {
  for (const hour of ["09:00", "12:00", "17:00"]) {
    assert.ok(calendar.includes(`>${hour}<`), `no ${hour} on the scale`);
  }
});

test("concurrent sessions sit side by side, consecutive ones share a column", () => {
  // Lane is expressed as a left offset. The Tuesday pair clash, so one
  // is pushed across; the Monday tours are consecutive and both sit at
  // the left edge of their shared lane.
  const left = (title: string) => {
    const tag = calendar.split("<button").find((t) => t.includes(title))!;
    return Number(tag.match(/left:\s*([\d.]+)%/)![1]);
  };
  assert.notEqual(left("Communication Chameleon"), left("Negotiation Skills"));
  assert.equal(left("CCRM tour"), left("Catalent tour"));
});

test("it says what the height means, because a scale nobody reads is decoration", () => {
  assert.match(calendar, /Height is how long a session runs/);
});

test("the day is a column heading, not repeated inside every box", () => {
  // "Mon 26 Oct · 11:00–13:30 · CCRM tour" in a box that is already in
  // Monday's column under an 11:00 line is three copies of one fact.
  const tag = calendar.split("<button").find((t) => t.includes("CCRM tour"))!;
  const body = tag.slice(tag.indexOf(">"));
  assert.ok(!body.includes("Mon 26 Oct"), "the box repeats the day it is already under");
});

test("no session is drawn past the bottom of its day", () => {
  // top + height > 100% overflows the column and the box spills over
  // whatever is under it. Cheap to check, invisible until it happens.
  for (const t of ["CL3 workshop", "CCRM tour", "Catalent tour", "Communication Chameleon", "Negotiation Skills", "innovation showcase"]) {
    const bottom = boxTop(t) + boxHeight(t);
    assert.ok(bottom <= 100.01, `${t} ends at ${bottom.toFixed(1)}% of the day`);
  }
});

test("two sessions in the same lane never overlap in time", () => {
  // A shared lane means "these can be stacked in one column". If two
  // overlapping sessions ever land in one lane they are drawn on top of
  // each other and one of them is unclickable.
  const grid = gridFromSlots(sessions.slots);
  for (const d of grid.days) {
    for (const a of d.slots) {
      for (const b of d.slots) {
        if (a.option === b.option || a.lane !== b.lane) continue;
        const clash = a.start < b.end && b.start < a.end;
        assert.ok(!clash, `${a.option} and ${b.option} share lane ${a.lane} and overlap`);
      }
    }
  }
});

/* ── the revised questions ───────────────────────────────────────── */

import { visibleFields, missing, walk } from "../../src/lib/formbuilder/logic";

const seen = (answers: Record<string, string>) =>
  visibleFields(TRAINING_WEEK_FORM, answers).map((f) => f.key);

test("a note is never something you can fail to answer", () => {
  // It has no input. Marked required by accident it would block the
  // form forever with nothing to type into.
  const withNote = missing(TRAINING_WEEK_FORM, { bhn_status: NO_ACCOUNT });
  assert.ok(!withNote.some((f) => f.type === "note"));
});

test("the travel question asks what the decision turns on, and says why", () => {
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "travel_over_2h")!;
  assert.equal(q.type, "yesno");
  assert.match(q.label, /more than 2 hours/i);
  assert.match(q.help ?? "", /travel assistance/i);
  assert.ok(!TRAINING_WEEK_FORM.fields.some((f) => f.key === "travel_origin"), "the old question is gone");
});

test("the postal code is asked only of the people it is about", () => {
  assert.ok(!seen({ bhn_status: ACCEPTED }).includes("postcode"), "not before the travel answer");
  assert.ok(!seen({ bhn_status: ACCEPTED, travel_over_2h: "No" }).includes("postcode"), "not on a No");
  assert.ok(seen({ bhn_status: ACCEPTED, travel_over_2h: "Yes" }).includes("postcode"));
});

test("the trainee email says what is done with it", () => {
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "trainee_email")!;
  assert.match(q.help ?? "", /trainee list/i);
  // And that not being found is not a rejection — the workflow says so,
  // so the question has to as well.
  assert.match(q.help ?? "", /still goes through/i);
});

test("the newsletter offers the answer an existing subscriber would give", () => {
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "newsletter_optin")!;
  assert.equal(q.type, "choice");
  assert.equal(q.options.length, 3);
  assert.ok(q.options.some((o) => /already subscribed/i.test(o)));
});

test("a note renders as something said, with no input and no number", () => {
  const html = renderToStaticMarkup(
    React.createElement(FormFillView, { doc: TRAINING_WEEK_FORM, title: "T" }),
  );
  assert.ok(!html.includes("Two steps first"), "hidden until the question is answered");
  // Rendered directly rather than through the form, so the note is
  // definitely on screen for this assertion.
  const noteOnly: typeof TRAINING_WEEK_FORM = {
    ...TRAINING_WEEK_FORM,
    submitNote: undefined,
    fields: TRAINING_WEEK_FORM.fields.filter((f) => f.key === "need_account_note").map((f) => ({ ...f, showWhen: [] })),
  };
  const shown = renderToStaticMarkup(React.createElement(FormFillView, { doc: noteOnly, title: "T" }));
  assert.match(shown, /Two steps first/);
  assert.ok(!shown.includes("<input"), "a note has nothing to fill in");
  assert.ok(!shown.includes('title="Required"'), "a note is not required");
  assert.match(shown, /0 questions/, "and it is not counted as one");
});

/* ── where you stand with BioHubNet ──────────────────────────────── */

test("question one has an answer for each of the four people who ask it", () => {
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "bhn_status")!;
  assert.equal(q.type, "choice");
  assert.equal(q.options.length, 4);
  // Yes/no had an accepted trainee, somebody with an account and no
  // programme, and somebody who had never heard of us all answering the
  // same thing and being told the same thing.
  assert.ok(q.required, "the rest of the form depends on it");
});

test("no option contains a comma, or every rule testing it breaks", () => {
  // `any of` splits its value on commas. A comma inside an option makes
  // the rule test for two halves of a sentence, neither of which is an
  // answer, and the questions behind it silently never show.
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "bhn_status")!;
  for (const o of q.options) assert.ok(!o.includes(","), `"${o}" has a comma in it`);
});

test("applying to EQUIP is enough — an award is not required", () => {
  // The point of Training Week is the people who are trying. Gating on
  // an award would shut out exactly the applicants it exists for.
  //
  // Phrased as what DID happen rather than as "an award is not
  // required", which answers by naming the thing it is not and leaves
  // the reader working out whether that means them.
  assert.match(EQUIP_APPLIED, /submitted an EQUIP application/i);
  assert.ok(!/not required|award/i.test(EQUIP_APPLIED), "it no longer describes itself by a negative");
  assert.deepEqual(seen({ bhn_status: EQUIP_APPLIED }), seen({ bhn_status: ACCEPTED }),
    "an EQUIP applicant sees the same form as an accepted trainee");
});

test("the two answers with a step to take get different instructions", () => {
  const withAccount = seen({ bhn_status: HAS_ACCOUNT });
  const without = seen({ bhn_status: NO_ACCOUNT });
  assert.ok(withAccount.includes("need_programme_note"));
  assert.ok(without.includes("need_account_note"));
  assert.ok(!withAccount.includes("need_account_note"), "somebody with an account is not told to make one");
  assert.ok(!without.includes("need_programme_note"));
});

test("neither note is shown to somebody who is already in", () => {
  for (const status of [ACCEPTED, EQUIP_APPLIED]) {
    const keys = seen({ bhn_status: status });
    assert.ok(!keys.includes("need_programme_note") && !keys.includes("need_account_note"));
  }
});

test("both notes point somewhere", () => {
  for (const key of ["need_programme_note", "need_account_note"]) {
    const n = TRAINING_WEEK_FORM.fields.find((f) => f.key === key)!;
    assert.match(n.help ?? "", /biohubnet\.ca/);
    assert.match(n.help ?? "", /EQUIP/, "the EQUIP route is the one most people do not know about");
  }
});

test("the form stops at question one for anyone not in a programme", () => {
  // The coordinator's call: they are told how to join and the form ends
  // there. It used to show them the note and then the whole rest of the
  // form, finishing on "Complete — every required question has an
  // answer", which is two different things on one screen.
  for (const status of [HAS_ACCOUNT, NO_ACCOUNT]) {
    const keys = seen({ bhn_status: status });
    assert.equal(keys.length, 2, `${status} sees ${keys.join(", ")}`);
    assert.ok(keys[0] === "bhn_status" && keys[1].endsWith("_note"));
    assert.ok(!keys.includes("sessions"), "no session picker for somebody who cannot have one");
  }
});

test("and carries on in full for anyone who is", () => {
  for (const status of [ACCEPTED, EQUIP_APPLIED]) {
    assert.ok(seen({ bhn_status: status }).includes("sessions"), `${status} cannot reach the sessions`);
  }
});

test("a stopping note offers no Submit and no Continue", () => {
  // Ending the form and then offering to submit it is the same
  // contradiction wearing a button.
  const doc: BuiltForm = {
    ...TRAINING_WEEK_FORM,
    fields: TRAINING_WEEK_FORM.fields
      .filter((f) => f.key === "need_account_note")
      .map((f) => ({ ...f, showWhen: [] })),
  };
  const html = paint(doc);
  assert.match(html, /Two steps first/);
  assert.ok(!html.includes("Submit registration"), "nothing to submit");
  assert.ok(!html.includes(">Continue<"), "nowhere to continue to");
  assert.ok(!html.includes("photographed and filmed"), "and no terms for a form that is not being submitted");
  assert.match(html, /carry on from here/, "it says what to do next");
});

test("both notes are marked as ending the form", () => {
  for (const key of ["need_programme_note", "need_account_note"]) {
    assert.equal(TRAINING_WEEK_FORM.fields.find((f) => f.key === key)!.stopsHere, true);
  }
});

test("every registration question except the first is behind eligibility", () => {
  // One missed gate is one question an ineligible person is asked, and
  // it would look deliberate.
  const open = new Set(["bhn_status", "need_programme_note", "need_account_note"]);
  for (const f of TRAINING_WEEK_FORM.fields) {
    if ((f.stage ?? "registration") !== "registration" || open.has(f.key)) continue;
    assert.ok(
      f.showWhen.some((c) => c.field === "bhn_status" && c.op === "any of"),
      `"${f.key}" is asked of everybody`,
    );
  }
});

/* ── one question at a time ──────────────────────────────────────── */

test("the form opens on question one and nothing else", () => {
  // Sixteen questions on arrival is a wall, and the first one decides
  // whether the other fifteen are even yours to answer.
  const html = paint(TRAINING_WEEK_FORM);
  assert.match(html, /Where do you stand with BioHubNet\?/);
  assert.ok(!html.includes("Choose your sessions"), "the rest of the form is still folded up");
  // Nothing to submit: question one is unanswered, and every other
  // question is behind the answer to it.
  assert.ok(!html.includes("Submit registration"), "nothing to submit yet");
  assert.ok(!html.includes("photographed and filmed"), "and no terms for a form nobody can submit");
  assert.match(html, /Answer .Where do you stand with BioHubNet\?. to carry on/, "it says what is needed");
});

/* ── the rest of this round ──────────────────────────────────────── */

test("the Symposium question offers the three real answers", () => {
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "symposium_signup")!;
  assert.equal(q.options.length, 3);
  assert.ok(q.options.some((o) => /already/i.test(o)));
  assert.ok(q.options.some((o) => /plan to/i.test(o)));
  assert.ok(q.options.some((o) => /not attending/i.test(o)));
  assert.ok(!q.required, "the Symposium is a different event — this is not a condition of anything");
});

test("dietary requirements can be answered with N/A", () => {
  // Blank meant either "none" or "have not got to it", and whoever is
  // ordering lunch needs the difference.
  const q = TRAINING_WEEK_FORM.fields.find((f) => f.key === "dietary")!;
  assert.match(q.noneLabel ?? "", /N\/A/);
});

test("a short list of choices renders as radios, not a dropdown", () => {
  const html = paint(TRAINING_WEEK_FORM);
  assert.match(html, /name="fill_bhn_status"/, "question one is radio buttons");
  assert.ok(!html.includes("<select"), "nothing on the opening screen is a dropdown");
});

test("photography consent is a condition of submitting, not a question", () => {
  // It was a question with one box you had to tick — a checkbox
  // pretending to be a choice, with no No the form would accept.
  assert.ok(!TRAINING_WEEK_FORM.fields.some((f) => f.key === "media_consent"));
  assert.match(TRAINING_WEEK_FORM.submitNote ?? "", /photographed and filmed/i);
  assert.match(TRAINING_WEEK_FORM.submitNote ?? "", /contact the coordinator/i,
    "somebody who is not comfortable still needs to know who to talk to");
});

test("the submit terms survive a round trip through storage", () => {
  // Added to the schema, saved happily, and silently gone on the next
  // read — because parseForm rebuilds the document key by key.
  const back = parseForm(JSON.parse(JSON.stringify(TRAINING_WEEK_FORM)));
  assert.equal(back.submitNote, TRAINING_WEEK_FORM.submitNote);
});

test("the workflow does not test a question nobody is asked", () => {
  // A step reading media_consent could never pass once the question was
  // gone, and a workflow that can never reach its own end is worse than
  // one that is wrong out loud.
  const keys = new Set(TRAINING_WEEK_FORM.fields.map((f) => f.key));
  for (const s of TRAINING_WEEK_FORM.steps) {
    for (const c of s.when) assert.ok(keys.has(c.field), `${s.id} tests "${c.field}", which nobody is asked`);
  }
});

test("the workflow actually reaches a different end for each status", () => {
  // The check that decides this once tested "the question was
  // answered", which is true of all four options — so "Declined, with a
  // reason" was an end nothing could reach, and problems() cannot see
  // that: it checks a condition names a live key, not that a branch is
  // reachable.
  // `confirmed` is answered too: without it the eligible path stops at
  // "seat released", which is a real ending but not the one this test
  // is about.
  const endFor = (status: string) => {
    const path = walk(TRAINING_WEEK_FORM, { bhn_status: status, sessions: ["x"], confirmed: "Yes" });
    return path[path.length - 1].step.id;
  };
  assert.equal(endFor(ACCEPTED), "w_attends");
  assert.equal(endFor(EQUIP_APPLIED), "w_attends");
  assert.equal(endFor(HAS_ACCOUNT), "w_declined");
  assert.equal(endFor(NO_ACCOUNT), "w_declined");
});

test("every ending in the workflow is reachable by somebody", () => {
  const ends = TRAINING_WEEK_FORM.steps.filter((s) => s.kind === "end").map((s) => s.id);
  const reached = new Set<string>();
  for (const status of [ACCEPTED, EQUIP_APPLIED, HAS_ACCOUNT, NO_ACCOUNT]) {
    for (const confirmed of ["Yes", "No"]) {
      const path = walk(TRAINING_WEEK_FORM, { bhn_status: status, sessions: ["x"], confirmed });
      reached.add(path[path.length - 1].step.id);
    }
  }
  for (const e of ends) assert.ok(reached.has(e), `nothing reaches "${e}"`);
});

/* ── the answers are values, not just labels ─────────────────────── */

test("every rule that tests question one names an answer it actually offers", () => {
  // An option string is the VALUE a rule matches on. Rename the option
  // without repointing the rule and the option still shows, the note
  // silently never appears, and nothing complains — problems() checks
  // that a condition names a live QUESTION, not that its value is one
  // of that question's answers.
  const offered = new Set(TRAINING_WEEK_FORM.fields.find((f) => f.key === "bhn_status")!.options);
  for (const f of TRAINING_WEEK_FORM.fields) {
    for (const c of f.showWhen) {
      if (c.field !== "bhn_status") continue;
      const wanted = (c.value ?? "").split(",");
      for (const w of wanted) {
        assert.ok(offered.has(w), `"${f.key}" waits for "${w}", which is not one of the answers`);
      }
    }
  }
  for (const s of TRAINING_WEEK_FORM.steps) {
    for (const c of s.when) {
      if (c.field !== "bhn_status") continue;
      for (const w of (c.value ?? "").split(",")) {
        assert.ok(offered.has(w), `step "${s.id}" waits for "${w}", which is not one of the answers`);
      }
    }
  }
});

test("every mention of an account says WHICH account", () => {
  // A reader has more than one. The one that matters here is the
  // training platform's, and "an account" on its own was doing too much
  // work in a sentence telling somebody what to go and do.
  const q1 = TRAINING_WEEK_FORM.fields.find((f) => f.key === "bhn_status")!;
  const notes = ["need_programme_note", "need_account_note"].map(
    (k) => TRAINING_WEEK_FORM.fields.find((f) => f.key === k)!,
  );
  for (const text of [q1.help ?? "", ...notes.map((n) => n.help ?? ""), HAS_ACCOUNT]) {
    for (const m of text.matchAll(/\baccount\b/g)) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
      assert.match(before, /training platform|platform/i, `"account" is unqualified in: …${before}account…`);
    }
  }
});

test("EQUIP is described by what it does not require, in plain words", () => {
  for (const key of ["need_programme_note", "need_account_note"]) {
    const n = TRAINING_WEEK_FORM.fields.find((f) => f.key === key)!;
    assert.match(n.help ?? "", /EQUIP does not require a BioHubNet training platform account/i,
      `${key} still says it vaguely`);
  }
});

test("both notes point at an address somebody can click", () => {
  for (const key of ["need_programme_note", "need_account_note"]) {
    const n = TRAINING_WEEK_FORM.fields.find((f) => f.key === key)!;
    assert.ok(hasLink(n.help ?? ""), `${key} names nowhere to go`);
  }
});

test("the address in a note is rendered as a link, not as text to copy out", () => {
  const doc: BuiltForm = {
    ...TRAINING_WEEK_FORM,
    fields: TRAINING_WEEK_FORM.fields
      .filter((f) => f.key === "need_account_note")
      .map((f) => ({ ...f, showWhen: [] })),
  };
  const html = paint(doc);
  assert.match(html, /<a href="https:\/\/biohubnet\.ca"/);
  // Opened in a new tab: the form is half filled in, and navigating
  // away to read about a programme would throw that away.
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("somebody new to BioHubNet is told which route needs an account and which does not", () => {
  // ENGAGE and EXPERIENCE run on the training platform. EQUIP does not
  // — sending a would-be EQUIP applicant off to create a platform
  // account is sending them to do something nobody needs from them.
  const n = TRAINING_WEEK_FORM.fields.find((f) => f.key === "need_account_note")!;
  assert.match(NO_ACCOUNT, /new to BioHubNet/i);
  assert.match(n.help ?? "", /For ENGAGE or EXPERIENCE/i, "the two-step route is named");
  assert.match(n.help ?? "", /create a BioHubNet training platform account/i, "and it says which account comes first");
  assert.match(n.help ?? "", /EQUIP does not require a BioHubNet training platform account/i,
    "and the one-step route is named plainly");
});

test("the note for somebody who already has an account says the same about EQUIP", () => {
  const n = TRAINING_WEEK_FORM.fields.find((f) => f.key === "need_programme_note")!;
  assert.match(n.help ?? "", /EQUIP does not require a BioHubNet training platform account/i);
});

/* ── ranking the sessions ────────────────────────────────────────── */

import { SESSIONS_2026 } from "../../src/lib/formbuilder/training-week";

test("the number on a session is the order it was clicked in", () => {
  // The question has always been called "choose and rank". The array
  // already kept click order; nothing on screen said so, so it read as
  // a plain multi-select and the order looked accidental.
  const f = TRAINING_WEEK_FORM.fields.find((x) => x.key === "sessions")!;
  const clicked = [SESSIONS_2026[3], SESSIONS_2026[0], SESSIONS_2026[5]];
  const html = renderToStaticMarkup(
    React.createElement(SessionCalendar, { field: f, chosen: clicked, onToggle: () => {} }),
  );
  // Matched on the first word: "CCRM tour + Lunch & Learn" comes back
  // from the renderer with the ampersand escaped, so the raw label does
  // not appear in the markup at all.
  const badgeIn = (option: string) => {
    const name = option.split(" · ").pop()!.split(" ")[0];
    const cell = html.split("<button").find((t) => t.includes(name));
    assert.ok(cell, `no cell for ${name}`);
    const m = cell.match(/bg-brand text-\[9px\] font-bold text-white">(\d)</);
    return m ? m[1] : null;
  };
  clicked.forEach((opt, i) => assert.equal(badgeIn(opt), String(i + 1), `${opt} is not ranked ${i + 1}`));
});

test("a session nobody picked carries no number", () => {
  const f = TRAINING_WEEK_FORM.fields.find((x) => x.key === "sessions")!;
  const html = renderToStaticMarkup(
    React.createElement(SessionCalendar, { field: f, chosen: [SESSIONS_2026[0]], onToggle: () => {} }),
  );
  const name = SESSIONS_2026[1].split(" · ").pop()!.split(" ")[0];
  const cell = html.split("<button").find((t) => t.includes(name))!;
  assert.ok(!/bg-brand text-\[9px\]/.test(cell), "an unpicked session is showing a rank");
});

test("the calendar says what the number means", () => {
  const f = TRAINING_WEEK_FORM.fields.find((x) => x.key === "sessions")!;
  const html = renderToStaticMarkup(
    React.createElement(SessionCalendar, { field: f, chosen: [], onToggle: () => {} }),
  );
  assert.match(html, /order of preference/i);
});

test("the question says the ranking is what decides an oversubscribed room", () => {
  const f = TRAINING_WEEK_FORM.fields.find((x) => x.key === "sessions")!;
  assert.match(f.help ?? "", /in order of preference/i);
  assert.match(f.help ?? "", /oversubscribed/i, "otherwise the order looks decorative");
});

test("the dietary question says it is Training Week, not the Symposium", () => {
  // The Symposium is asked about two questions earlier, so a bare
  // "dietary requirements" between them reads as covering both — and
  // somebody tells us once, then turns up on the Thursday to a lunch
  // that does not know about them.
  const f = TRAINING_WEEK_FORM.fields.find((x) => x.key === "dietary")!;
  assert.match(f.label, /Training Week/i);
  assert.match(f.help ?? "", /does not cover the Symposium/i);
  assert.match(f.help ?? "", /separate registration/i);
});
