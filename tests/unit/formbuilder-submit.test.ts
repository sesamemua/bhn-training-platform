import test from "node:test";
import assert from "node:assert/strict";
import { checkSubmission, emailFrom, rankedSessions } from "../../src/lib/formbuilder/submit";
import {
  ACCEPTED, DIET_OTHER, NO_ACCOUNT, NO_DIET, SESSIONS_2026, TRAINING_WEEK_FORM,
} from "../../src/lib/formbuilder/training-week";

const complete = {
  bhn_status: ACCEPTED,
  trainee_name: "Amara Okonkwo",
  trainee_email: "amara@utoronto.ca",
  travel_over_2h: "No",
  first_name: "Amara", last_name: "Okonkwo", email: "amara@example.org",
  sessions: [SESSIONS_2026[3], SESSIONS_2026[0]],
  symposium_signup: "Yes — already signed up",
  primary_position: "PhD Student",
  primary_org: "Academic Institution",
  expertise: ["R & D"],
  dietary: ["Vegan"],
  newsletter_optin: "No thanks",
};

const check = (over: Record<string, unknown> = {}) =>
  checkSubmission(TRAINING_WEEK_FORM, { ...complete, ...over } as never);

test("a complete registration is accepted", () => {
  const v = check();
  assert.ok(v.ok, v.problems.join(" · "));
});

/* ── the rules the browser also enforces, enforced again ─────────── */

test("more sessions than the cap is refused", () => {
  // The disabled buttons in the calendar are a courtesy to whoever is
  // filling the form in. This is a public endpoint.
  const v = check({ sessions: SESSIONS_2026.slice(0, 4) });
  assert.ok(!v.ok);
  assert.ok(v.problems.some((p) => /at most 3/.test(p)));
});

test("a session that is not on the list is refused, not quietly kept", () => {
  const v = check({ sessions: ["Some workshop we never offered"] });
  assert.ok(!v.ok);
  assert.ok(v.problems.some((p) => /not on the list/.test(p)));
});

test("an answer to a single-choice question that is not one of its options is refused", () => {
  assert.ok(!check({ bhn_status: "Yes obviously" }).ok);
  assert.ok(!check({ symposium_signup: "maybe" }).ok);
});

test("a required question left empty is refused", () => {
  assert.ok(!check({ bhn_status: undefined }).ok);
  assert.ok(!check({ sessions: [] }).ok);
});

test("“no requirements” cannot be combined with a requirement", () => {
  // Two answers contradicting each other, and the caterer has no way to
  // tell which one to believe.
  const v = check({ dietary: [NO_DIET, "Vegan"] });
  assert.ok(!v.ok);
  assert.ok(v.problems.some((p) => /cannot be combined/.test(p)));
});

test("“something else” without a description is refused", () => {
  assert.ok(!check({ dietary: [DIET_OTHER] }).ok);
  assert.ok(check({ dietary: [DIET_OTHER], dietary_other: "Severe sesame allergy" }).ok);
});

/* ── what gets stored ────────────────────────────────────────────── */

test("answers to questions this person never saw are not stored", () => {
  // Somebody new to BioHubNet sees one question. Storing sessions they
  // never picked would put something in the registrant sheet nobody was
  // shown — and the first person to notice would rightly stop believing
  // the rest of it.
  const v = checkSubmission(TRAINING_WEEK_FORM, {
    bhn_status: NO_ACCOUNT, sessions: SESSIONS_2026.slice(0, 3), dietary: ["Vegan"],
  } as never);
  assert.ok(v.ok, "they are not rejected — they only saw one question");
  assert.deepEqual(Object.keys(v.clean), ["bhn_status"]);
});

test("a confirmation-stage answer is not stored with a registration", () => {
  const v = check({ confirmed: "Yes" });
  assert.ok(!("confirmed" in v.clean), "that question is asked by email weeks later");
});

test("text is trimmed and bounded", () => {
  const v = check({ trainee_name: "  Amara  ", dietary: [NO_DIET] });
  assert.equal(v.clean.trainee_name, "Amara");
  const long = check({ trainee_name: "x".repeat(9000), dietary: [NO_DIET] });
  assert.ok(String(long.clean.trainee_name).length <= 5000);
});

test("the ranking is stored in the order it was given", () => {
  const order = [SESSIONS_2026[5], SESSIONS_2026[0], SESSIONS_2026[3]];
  const v = check({ sessions: order });
  assert.deepEqual(v.clean.sessions, order, "sorting it would throw the ranking away");
  assert.deepEqual(rankedSessions(TRAINING_WEEK_FORM, v.clean), order);
});

test("a submission is filed under an address somebody typed", () => {
  assert.equal(emailFrom(TRAINING_WEEK_FORM, complete as never), "amara@example.org");
  // Falls back rather than losing the row: a registration with no
  // address is worse to drop than to have to match up by hand.
  assert.equal(emailFrom(TRAINING_WEEK_FORM, { trainee_email: "T@Utoronto.CA" } as never), "t@utoronto.ca");
  assert.equal(emailFrom(TRAINING_WEEK_FORM, {} as never), null);
});

test("every problem names the question it is about", () => {
  // "That form could not be read" tells somebody nothing about what to
  // change.
  const v = check({ sessions: SESSIONS_2026.slice(0, 4), bhn_status: undefined });
  assert.ok(v.problems.length > 0);
  for (const p of v.problems) assert.match(p, /“[^”]+”/, `no question named in: ${p}`);
});

test("the same problem is not said twice", () => {
  const v = check({ sessions: ["nope", "also nope"] });
  assert.equal(new Set(v.problems).size, v.problems.length);
});

/* ── the form is open to anyone, so nothing in the payload is trusted ── */

test("nothing that is not a question survives into what gets stored", () => {
  // The public form takes a body from anybody with the link. If a key
  // that is not a question could ride along, "__test" — the marker that
  // lets a coordinator clear their own rows in bulk — becomes something
  // a stranger can set on a real registration.
  const v = check({
    __test: true,
    reviewStatus: "approved",
    eligibilityApprovedAt: new Date().toISOString(),
    id: "hijack",
    userId: "somebody-else",
  } as Record<string, unknown>);
  assert.ok(v.ok, v.problems.join(" · "));
  for (const smuggled of ["__test", "reviewStatus", "eligibilityApprovedAt", "id", "userId"]) {
    assert.ok(!(smuggled in v.clean), `"${smuggled}" was kept`);
  }
  // And what IS kept is only ever question keys.
  const questions = new Set(TRAINING_WEEK_FORM.fields.map((f) => f.key));
  for (const key of Object.keys(v.clean)) assert.ok(questions.has(key), `"${key}" is not a question`);
});

test("an array where a single answer belongs does not become an array", () => {
  const v = check({ bhn_status: [ACCEPTED, "and something else"] } as Record<string, unknown>);
  // Either refused or flattened — never stored as a list on a question
  // that offers one answer.
  if (v.ok) assert.equal(typeof v.clean.bhn_status, "string");
});

test("an object where text belongs is stringified, not stored as an object", () => {
  const v = check({ trainee_name: { evil: true } } as Record<string, unknown>);
  if ("trainee_name" in v.clean) assert.equal(typeof v.clean.trainee_name, "string");
});
