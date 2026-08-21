import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormFillView } from "../../src/components/workspace/FormFillView";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import type { BuiltForm } from "../../src/lib/formbuilder/types";

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
  assert.match(html, /Are you a current BioHubNet trainee\?/);
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

test("the consent question is rendered as its own statement", () => {
  assert.match(html, /I agree to be photographed/);
  assert.match(html, /type="radio"/);
});

test("required questions are marked", () => {
  assert.match(html, /title="Required"/);
});

test("there is a way to submit, and it is checked for real", () => {
  assert.match(html, /Submit registration/);
  assert.match(html, /Checked for real\. Sent nowhere\./);
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

test("every question a registrant can see at first paint is numbered", () => {
  const shown = TRAINING_WEEK_FORM.fields.filter(
    (f) => (f.stage ?? "registration") === "registration" && f.showWhen.length === 0,
  );
  assert.ok(shown.length > 10, "sanity: the form is not nearly empty");
  const numbers = html.match(/font-mono text-\[11px\] text-subtle">\d+</g) ?? [];
  // Consent carries its statement instead of a numbered heading.
  const numbered = shown.filter((f) => f.type !== "consent").length;
  assert.equal(numbers.length, numbered);
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
