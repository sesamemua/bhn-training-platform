import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES, parseRules, rankApplicants, validateRules,
  type Applicant, type Rule,
} from "../../src/lib/allocation/model";

const who = (id: string, over: Partial<Applicant> = {}): Applicant => ({
  id, name: id, appliedAt: "2026-09-01T10:00:00Z", ...over,
});
const order = (r: ReturnType<typeof rankApplicants>) => r.map((x) => x.applicant.id);

test("the shipped policy puts out-of-town first, then earliest applicant", () => {
  const people = [
    who("local-early", { isOutOfTown: false, appliedAt: "2026-09-01T09:00:00Z" }),
    who("away-late", { isOutOfTown: true, appliedAt: "2026-09-05T09:00:00Z" }),
    who("away-early", { isOutOfTown: true, appliedAt: "2026-09-02T09:00:00Z" }),
  ];
  assert.deepEqual(order(rankApplicants(people, DEFAULT_RULES, 2)), [
    "away-early", "away-late", "local-early",
  ]);
});

test("capacity decides the label, and everyone below it is a waitlist in promotion order", () => {
  const people = [who("a"), who("b", { appliedAt: "2026-09-02T09:00:00Z" }), who("c", { appliedAt: "2026-09-03T09:00:00Z" })];
  const ranked = rankApplicants(people, DEFAULT_RULES, 1);
  assert.deepEqual(ranked.map((r) => r.outcome), ["seat", "waitlist", "waitlist"]);
  assert.deepEqual(ranked.map((r) => r.position), [1, 2, 3]);
});

test("each placement says which rule decided it", () => {
  const people = [
    who("away", { isOutOfTown: true, appliedAt: "2026-09-09T09:00:00Z" }),
    who("local", { isOutOfTown: false, appliedAt: "2026-09-01T09:00:00Z" }),
  ];
  const ranked = rankApplicants(people, DEFAULT_RULES, 1);
  assert.equal(ranked[0].decidedBy, "Out-of-town applicants first");
  assert.equal(ranked[1].decidedBy, null, "nobody below the last person");
});

test("reordering the rules reorders the people", () => {
  const people = [
    who("away-late", { isOutOfTown: true, appliedAt: "2026-09-05T09:00:00Z" }),
    who("local-early", { isOutOfTown: false, appliedAt: "2026-09-01T09:00:00Z" }),
  ];
  const flipped: Rule[] = [
    { id: "fc", kind: "first_come", label: "First come, first served", isActive: true },
  ];
  assert.deepEqual(order(rankApplicants(people, DEFAULT_RULES, 1)), ["away-late", "local-early"]);
  assert.deepEqual(order(rankApplicants(people, flipped, 1)), ["local-early", "away-late"]);
});

test("switching a rule off takes it out of the decision without deleting it", () => {
  const people = [
    who("away-late", { isOutOfTown: true, appliedAt: "2026-09-05T09:00:00Z" }),
    who("local-early", { isOutOfTown: false, appliedAt: "2026-09-01T09:00:00Z" }),
  ];
  const off = DEFAULT_RULES.map((r) => (r.kind === "out_of_town" ? { ...r, isActive: false } : r));
  assert.deepEqual(order(rankApplicants(people, off, 1)), ["local-early", "away-late"]);
});

test("the distance threshold is configurable", () => {
  const people = [
    who("far", { distanceKm: 80, appliedAt: "2026-09-09T09:00:00Z" }),
    who("near", { distanceKm: 60, appliedAt: "2026-09-01T09:00:00Z" }),
  ];
  const strict: Rule[] = [
    { id: "o", kind: "out_of_town", label: "Out of town", isActive: true, config: { minKm: 70 } },
    { id: "f", kind: "first_come", label: "First come", isActive: true },
  ];
  // At 70km only "far" qualifies, so it outranks an earlier applicant.
  assert.deepEqual(order(rankApplicants(people, strict, 1)), ["far", "near"]);
  // At 50km both qualify, so the earlier application wins instead.
  const loose = strict.map((r) => (r.kind === "out_of_town" ? { ...r, config: { minKm: 50 } } : r));
  assert.deepEqual(order(rankApplicants(people, loose, 1)), ["near", "far"]);
});

test("ranking the same people twice gives the same answer", () => {
  const people = Array.from({ length: 30 }, (_, i) =>
    who(`p${i}`, { isOutOfTown: i % 3 === 0, appliedAt: "2026-09-01T09:00:00Z" }),
  );
  const a = order(rankApplicants(people, DEFAULT_RULES, 10));
  const b = order(rankApplicants([...people].reverse(), DEFAULT_RULES, 10));
  assert.deepEqual(a, b, "an allocation nobody can reproduce is one nobody can defend");
});

test("a rule set with no final tiebreak is refused, with the reason", () => {
  const noTiebreak: Rule[] = [
    { id: "o", kind: "out_of_town", label: "Out of town", isActive: true },
  ];
  const v = validateRules(noTiebreak);
  assert.equal(v.ok, false);
  assert.match(v.problem!, /tiebreak/i);

  const wrongOrder: Rule[] = [
    { id: "f", kind: "first_come", label: "First come", isActive: true },
    { id: "o", kind: "out_of_town", label: "Out of town", isActive: true },
  ];
  assert.equal(validateRules(wrongOrder).ok, false);
  assert.equal(validateRules(DEFAULT_RULES).ok, true);
});

test("every rule switched off is refused rather than allocating on nothing", () => {
  assert.equal(validateRules(DEFAULT_RULES.map((r) => ({ ...r, isActive: false }))).ok, false);
});

test("a corrupt stored blob falls back to the shipped policy", () => {
  assert.deepEqual(parseRules("not json"), DEFAULT_RULES);
  assert.deepEqual(parseRules("[]"), DEFAULT_RULES);
  assert.deepEqual(parseRules(null), DEFAULT_RULES);
  assert.deepEqual(parseRules('[{"id":"x","kind":"nope","label":"x"}]'), DEFAULT_RULES);
  const good = JSON.stringify([{ id: "f", kind: "first_come", label: "FCFS", isActive: true }]);
  assert.equal(parseRules(good).length, 1);
});

// ── regressions from the adversarial review ─────────────────────────

test("an applicant with no known location is not treated as local", () => {
  // A rule that reads a blank field as "lives here" hands seats to
  // whoever filled their profile in.
  const people = [
    who("unknown", { isOutOfTown: undefined, appliedAt: "2026-09-05T09:00:00Z" }),
    who("known-local", { isOutOfTown: false, appliedAt: "2026-09-01T09:00:00Z" }),
  ];
  const ranked = rankApplicants(people, DEFAULT_RULES, 1);
  // Neither is out of town as far as the rule can tell, so the tiebreak
  // decides — and it must not claim the unknown one is local.
  assert.equal(ranked[0].applicant.id, "known-local");
  assert.equal(ranked[0].decidedBy, "First come, first served");
});

test("seats already held ranks the person taking least of the week first", () => {
  const rules: Rule[] = [
    { id: "s", kind: "fewest_seats_held", label: "Fewest seats already held", isActive: true },
    { id: "f", kind: "first_come", label: "First come, first served", isActive: true },
  ];
  const people = [
    who("greedy", { seatsHeld: 3, appliedAt: "2026-09-01T09:00:00Z" }),
    who("none-yet", { seatsHeld: 0, appliedAt: "2026-09-08T09:00:00Z" }),
  ];
  assert.deepEqual(order(rankApplicants(people, rules, 1)), ["none-yet", "greedy"]);
});

test("an unreadable application date cannot corrupt the order", () => {
  // Date.parse returns NaN, and NaN comparisons are false in both
  // directions — a comparator that returns NaN is not an ordering.
  const people = [who("bad", { appliedAt: "not a date" }), who("good"), who("also-good")];
  const ranked = rankApplicants(people, DEFAULT_RULES, 2);
  assert.equal(ranked.length, 3);
  assert.equal(new Set(ranked.map((r) => r.applicant.id)).size, 3, "nobody lost or duplicated");
});
