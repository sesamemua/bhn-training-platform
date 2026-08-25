import test from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATIONS, HOURS, NOT_THIS_HOUR, PER_SESSION, conversationFor, optionFor,
  optionsForHour, unconfirmedCount, whenIs,
} from "../../src/lib/industry-insights/schedule-2026";
import {
  INDUSTRY_INSIGHTS_FORM, INDUSTRY_INSIGHTS_SLUG, ROLES,
} from "../../src/lib/formbuilder/industry-insights";
import { missing, problems, visibleFields, walk } from "../../src/lib/formbuilder/logic";
import { checkSubmission } from "../../src/lib/formbuilder/submit";
import { parseForm } from "../../src/lib/formbuilder/types";

const NOT_LISTED = "My institution is not on the list";
const AT_A_PARTNER = { institution: "University of Toronto" };
const see = (a: Record<string, string>) => visibleFields(INDUSTRY_INSIGHTS_FORM, a).map((f) => f.key);

/* ── the schedule ────────────────────────────────────────────────── */

test("three hours, four conversations in each", () => {
  assert.equal(HOURS.length, 3);
  for (const h of HOURS) {
    assert.equal(CONVERSATIONS.filter((c) => c.hour === h.hour).length, 4, `hour ${h.hour}`);
  }
  assert.equal(CONVERSATIONS.length, 12);
});

test("the hours run back to back through the afternoon", () => {
  for (const h of HOURS) {
    const { start, end } = whenIs(h.hour);
    assert.equal((end.getTime() - start.getTime()) / 60000, 60, `hour ${h.hour} is not an hour`);
  }
  // 1pm ET in September is EDT, so 17:00Z.
  assert.equal(whenIs(1).start.toISOString(), "2026-09-24T17:00:00.000Z");
  assert.equal(whenIs(3).end.toISOString(), "2026-09-24T20:00:00.000Z");
});

test("an unconfirmed company says so rather than being given a plausible name", () => {
  // The page says three times that the line-up is tentative. A
  // registrant choosing "Company 3" should know they are choosing an
  // HOUR, not a company.
  const tba = CONVERSATIONS.filter((c) => !c.confirmed);
  assert.ok(tba.length > 0, "sanity: some are still unannounced");
  for (const c of tba) {
    assert.match(c.company, /to be announced/i, `"${c.company}" reads as a real company`);
    assert.equal(c.speaker, null);
  }
});

test("a confirmed conversation names its speaker", () => {
  for (const c of CONVERSATIONS.filter((x) => x.confirmed)) {
    assert.ok(c.speaker, `${c.company} is confirmed but has no speaker`);
    assert.match(optionFor(c), new RegExp(c.speaker!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("ids are unique across the afternoon", () => {
  assert.equal(new Set(CONVERSATIONS.map((c) => c.id)).size, CONVERSATIONS.length);
});

test("labels are unique WITHIN an hour, which is the only scope they are used in", () => {
  // Across the afternoon they are deliberately NOT unique: eight slots
  // are unannounced and "Company 3 — to be announced" is the clearest
  // thing each of them can say to somebody choosing inside one hour.
  for (const h of HOURS) {
    const labels = optionsForHour(h.hour);
    assert.equal(new Set(labels).size, labels.length, `hour ${h.hour} has two options reading the same`);
  }
  const all = CONVERSATIONS.map(optionFor);
  assert.ok(new Set(all).size < all.length, "sanity: the unannounced slots repeat across hours");
});

test("an option round-trips back to its conversation, given its hour", () => {
  for (const c of CONVERSATIONS) assert.equal(conversationFor(c.hour, optionFor(c))?.id, c.id);
  assert.equal(conversationFor(1, "Some company we never invited"), undefined);
});

test("the same label in a different hour resolves to a different conversation", () => {
  // The trap the hour argument exists to close: without it, an answer
  // to the 3 PM question resolves to a conversation at 1 PM.
  const shared = optionFor(CONVERSATIONS.find((c) => c.hour === 1 && !c.confirmed)!);
  const inHour1 = conversationFor(1, shared);
  const inHour3 = conversationFor(3, shared);
  assert.ok(inHour1 && inHour3, "sanity: this label appears in both hours");
  assert.notEqual(inHour1.id, inHour3.id);
  assert.equal(inHour1.hour, 1);
  assert.equal(inHour3.hour, 3);
});

test("every hour offers a way to say you cannot make it", () => {
  // Somebody free for one hour of three should be able to register for
  // that hour rather than be pushed into picking something they will
  // not attend, which is a seat somebody else could have used.
  for (const h of HOURS) {
    const opts = optionsForHour(h.hour);
    assert.equal(opts.length, 5, `hour ${h.hour} should offer four companies and an opt-out`);
    assert.equal(opts[opts.length - 1], NOT_THIS_HOUR);
  }
});

/* ── the form ────────────────────────────────────────────────────── */

test("the form is coherent — nothing waits on a question nobody asks", () => {
  assert.deepEqual(problems(INDUSTRY_INSIGHTS_FORM), []);
  assert.deepEqual(problems(parseForm(JSON.parse(JSON.stringify(INDUSTRY_INSIGHTS_FORM)))), []);
});

test("it opens on the institution and nothing else", () => {
  assert.deepEqual(see({}), ["institution"]);
});

test("somebody outside the partner list is told, and the form ends there", () => {
  const keys = see({ institution: NOT_LISTED });
  assert.deepEqual(keys, ["institution", "not_listed_note"]);
  const note = INDUSTRY_INSIGHTS_FORM.fields.find((f) => f.key === "not_listed_note")!;
  assert.equal(note.stopsHere, true, "they would otherwise be offered a Submit button");
  assert.match(note.help ?? "", /biohubnet\.ca/, "and nowhere to go");
});

test("somebody at a partner institution gets the whole form", () => {
  const keys = see(AT_A_PARTNER);
  for (const k of ["role", "full_name", "email", "hour_1", "hour_2", "hour_3"]) {
    assert.ok(keys.includes(k), `${k} is not asked`);
  }
  assert.ok(!keys.includes("not_listed_note"));
});

test("the roles are the ones the event is pitched at", () => {
  const role = INDUSTRY_INSIGHTS_FORM.fields.find((f) => f.key === "role")!;
  for (const r of ROLES) assert.ok(role.options.includes(r), `${r} is missing`);
  assert.ok(role.options.includes("Other"), "somebody who does not fit is still a person");
});

test("each hour is its own question, so double-booking is impossible", () => {
  // Four companies run at the same time. As one multi-select the form
  // could only WARN; as three single choices it cannot happen.
  for (const h of HOURS) {
    const q = INDUSTRY_INSIGHTS_FORM.fields.find((f) => f.key === `hour_${h.hour}`)!;
    assert.equal(q.type, "choice");
    assert.deepEqual(q.options, optionsForHour(h.hour));
    assert.ok(q.label.includes(h.label), "the question does not say which hour it is");
  }
});

test("the question everybody should answer is the one that is optional", () => {
  // Forty of the sixty minutes is live Q&A.
  const q = INDUSTRY_INSIGHTS_FORM.fields.find((f) => f.key === "question_for_panel")!;
  assert.equal(q.required, false);
  assert.match(q.help ?? "", /Q&A/i);
});

/* ── what the server accepts ─────────────────────────────────────── */

const complete = {
  ...AT_A_PARTNER, role: "PhD student", full_name: "Amara Okonkwo", email: "amara@utoronto.ca",
  hour_1: optionsForHour(1)[0], hour_2: NOT_THIS_HOUR, hour_3: optionsForHour(3)[0],
};

test("a complete registration is accepted", () => {
  const v = checkSubmission(INDUSTRY_INSIGHTS_FORM, complete as never);
  assert.ok(v.ok, v.problems.join(" · "));
});

test("a company that is not in that hour is refused", () => {
  // Hour 3's conversation offered as an answer to hour 1.
  const v = checkSubmission(INDUSTRY_INSIGHTS_FORM, { ...complete, hour_1: optionsForHour(3)[0] } as never);
  assert.ok(!v.ok);
});

test("an unanswered hour is refused — all three are required", () => {
  const gaps = missing(INDUSTRY_INSIGHTS_FORM, { ...complete, hour_2: undefined } as never);
  assert.ok(gaps.some((f) => f.key === "hour_2"));
});

test("nothing is stored for somebody the form turned away", () => {
  const v = checkSubmission(INDUSTRY_INSIGHTS_FORM, { ...complete, institution: NOT_LISTED } as never);
  assert.deepEqual(Object.keys(v.clean), ["institution"]);
});

test("the workflow reaches a different end for each", () => {
  const endOf = (a: Record<string, unknown>) => {
    const p = walk(INDUSTRY_INSIGHTS_FORM, a as never);
    return p[p.length - 1].step.id;
  };
  assert.equal(endOf(complete), "ii_in");
  assert.equal(endOf({ institution: NOT_LISTED }), "ii_out");
});

test("the cap the page promises is the cap the form knows about", () => {
  assert.equal(PER_SESSION, 20);
  for (const h of HOURS) {
    const q = INDUSTRY_INSIGHTS_FORM.fields.find((f) => f.key === `hour_${h.hour}`)!;
    assert.match(q.help ?? "", new RegExp(`${PER_SESSION} people`), `hour ${h.hour} does not say the cap`);
  }
});

test("the slug is the one the public URL uses", () => {
  assert.equal(INDUSTRY_INSIGHTS_SLUG, "industry-insights-2026");
});

test("the count of unannounced companies is honest", () => {
  assert.equal(unconfirmedCount(), CONVERSATIONS.filter((c) => !c.confirmed).length);
});
