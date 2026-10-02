/** Testimonial answers: only the link's questions, each typed (≤150 words) or a recording from this link. */
import test from "node:test";
import assert from "node:assert/strict";
import { AnswerSchema, answerProblems, cleanQuote, quotePrompt, spoken } from "../../src/lib/showcase/testimonial";

const Q = ["Tell us about your experience with BioHubNet.", "What have you gained?"];

test("answers are checked against the questions, the word limit and where recordings came from", () => {
  assert.deepEqual(answerProblems([{ question: Q[0], text: "Great." }], Q, "t"), []);
  assert.match(answerProblems([], Q, "t")[0], /at least one/);
  assert.match(answerProblems([{ question: "Anything else?", text: "x" }], Q, "t")[0], /does not ask/);
  assert.match(answerProblems([{ question: Q[0], text: "word ".repeat(151) }], Q, "t")[0], /150 words/);
  assert.match(answerProblems([{ question: Q[1], audioKey: "showcase/other/audio/a.webm" }], Q, "t")[0], /did not come from this form/);
  assert.deepEqual(answerProblems([{ question: Q[1], audioKey: "showcase/t/audio/a.webm", transcript: "hi" }], Q, "t"), []);
  assert.ok(!AnswerSchema.safeParse({ question: Q[0] }).success, "an answer needs words or a recording");
});

test("the quote prompt carries what they said; the reply is tidied", () => {
  const m = quotePrompt("Ana", ["ENGAGE"], [{ question: Q[0], transcript: "It changed my career." }]);
  assert.match(m[1].content, /ENGAGE/);
  assert.match(m[1].content, /It changed my career/);
  assert.equal(spoken([{ question: Q[1], text: "Skills" }]), `Q: ${Q[1]}\nA: Skills`);
  assert.equal(cleanQuote('  "BioHubNet opened doors for me."  '), "BioHubNet opened doors for me.");
});
