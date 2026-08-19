import test from "node:test";
import assert from "node:assert/strict";
import { suggestKind, suggestionFor } from "../../src/lib/flowchart/suggest";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { NodeKind } from "../../src/lib/flowchart/types";

const kindOf = (text: string, actor?: string) => suggestKind(text, actor)?.kind ?? null;

test("it reads the obvious shapes", () => {
  const cases: [string, NodeKind][] = [
    ["Registration opens", "start"],
    ["Wait for the confirmation cut-off", "delay"],
    ["Info pack emailed to the registrant", "document"],
    ["The eligibility sheet of 41 member institutions", "data"],
    ["Up to 3 sessions may be picked", "rule"],
    ["Note: does the waitlist promote itself?", "note"],
    ["Travel-support approval is its own process", "subprocess"],
    ["Attends", "end"],
  ];
  for (const [text, want] of cases) {
    assert.equal(kindOf(text), want, `${JSON.stringify(text)} should read as ${want}`);
  }
});

test("a question is asked of the registrant; a decision is evaluated by the process", () => {
  assert.equal(kindOf("What is your position title?"), "question");
  assert.equal(kindOf("Your affiliations"), "question");
  assert.equal(kindOf("Any chosen session full?"), "decision");
  assert.equal(kindOf("Eligible?"), "decision");
});

test("it never contradicts the author of the real chart", () => {
  // The seeded Training Week flow is 17 hand-authored boxes whose kinds
  // are known-good. Agreeing or staying silent is fine; contradicting a
  // deliberate choice is the failure that would make this feature a
  // nuisance rather than a help.
  const clashes = TRAINING_WEEK_FLOW.nodes
    .map((n) => ({ n, s: suggestKind(n.text, (n as { actor?: string }).actor) }))
    .filter(({ n, s }) => s && s.kind !== n.kind)
    .map(({ n, s }) => `${JSON.stringify(n.text)}: authored ${n.kind}, suggested ${s!.kind}`);
  assert.deepEqual(clashes, []);
});

test("a record being consulted is a step, not a data box", () => {
  // The sheet is the object of a preposition — the box is the checking.
  assert.equal(kindOf("Checked against the eligibility sheet"), null);
  // ...but the sheet itself still reads as one.
  assert.equal(kindOf("The eligibility sheet of 41 member institutions"), "data");
});

test("a compound label is a step, whatever its tail sounds like", () => {
  assert.equal(kindOf("Seat confirmed, info pack emailed"), null);
  assert.equal(kindOf("Info pack emailed"), "document");
});

test("the actor is read separately, so it cannot break a rule anchored to the line end", () => {
  // Concatenating the two made this "Registration opens Coordinator",
  // and every $-anchored rule silently stopped matching.
  assert.equal(kindOf("Registration opens", "Coordinator"), "start");
});

test("it says nothing rather than guessing", () => {
  for (const quiet of ["", "  ", "Se", "abc", "Added to the waitlist", "Trainee details"]) {
    assert.equal(kindOf(quiet), null, `${JSON.stringify(quiet)} should stay silent`);
  }
});

test("it never throws on hostile input", () => {
  const nasty = ["?", "!!!", "a".repeat(5000), "\n\n\t", "((((", "😀😀😀", "NOTE:", "1"];
  for (const t of nasty) assert.doesNotThrow(() => suggestKind(t, t));
});

test("suggestionFor stays quiet when the box is already right", () => {
  assert.equal(suggestionFor({ text: "Registration opens", kind: "start" }), null);
  assert.equal(suggestionFor({ text: "Registration opens", kind: "step" })?.kind, "start");
});

test("suggestionFor never offers to restyle a question that carries form fields", () => {
  // Changing the shape there would drop the fields, so the words lose
  // their vote once the box is load-bearing.
  const node = { text: "Wait for the cut-off", kind: "question" as NodeKind };
  assert.equal(suggestionFor(node, 3), null);
  assert.equal(suggestionFor(node, 0)?.kind, "delay");
});

// ── cases found by red-teaming the rules ────────────────────────────
// Every one of these was a real misclassification, found by generating
// realistic labels for this registration flow and running them. They
// are here so the rules cannot quietly loosen again.

test("an elided form question is not a fork", () => {
  // Matching bare auxiliaries ("any", "is", "has") turned every one of
  // these into a diamond. A fork names a STATE; these ask a person.
  assert.equal(kindOf("Any dietary requirements?"), "question");
  assert.equal(kindOf("Anything else we should know?"), "question");
  // ...while the genuine forks in this flow still read as forks.
  assert.equal(kindOf("Any chosen session full?"), "decision");
  assert.equal(kindOf("Eligible?"), "decision");
});

test("the process asking about itself is a fork, not a form field", () => {
  assert.equal(kindOf("Have we heard back?"), "decision");
});

test("words that name a manual act do not outrank being asked of someone", () => {
  assert.equal(kindOf("Are you attending in person?"), "question");
  // The manual reading survives where nobody is being asked.
  assert.equal(kindOf("Programme lead phones the registrant"), "manual");
  assert.equal(kindOf("Checked manually"), "manual");
});

test("a wait is stated, never asked", () => {
  assert.equal(kindOf("Has the cut-off passed?"), "decision");
  assert.equal(kindOf("Has the confirmation cut-off passed?"), "decision");
  assert.equal(kindOf("Wait for the confirmation cut-off"), "delay");
  assert.equal(kindOf("Hold until the deadline"), "delay");
  assert.equal(kindOf("On hold pending eligibility check"), "delay");
});

test("a deadline mentioned in passing does not make the box a wait", () => {
  // "before the deadline" is a temporal adjunct; the emailing is the box.
  assert.equal(kindOf("Reminder emailed before the deadline"), "document");
});

test("a limit is stated; asking about one is a fork, and offering one is a question", () => {
  assert.equal(kindOf("Up to 3 sessions · clashes flagged"), "rule");
  assert.equal(kindOf("Any clashes?"), "decision");
  assert.equal(kindOf("Choose up to 3 sessions"), "question");
});
