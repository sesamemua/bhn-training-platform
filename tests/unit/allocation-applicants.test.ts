/** The decision model reads the registration form and the roster, and suggests seats. */
import test from "node:test";
import assert from "node:assert/strict";
import { applicantFor, suggestSeats, type BookingFacts } from "../../src/lib/allocation/applicants";
import { rankApplicants, type Rule } from "../../src/lib/allocation/model";

const roster = new Map([["ana@utoronto.ca", "Ana Diaz"], ["ben@utoronto.ca", null]]);
const lookup = (e: string) => (roster.has(e) ? { name: roster.get(e) ?? null } : null);

const form = (id: string, email: string, travel: string | undefined, at: string, status = "pending"): BookingFacts => ({
  bookingId: id, status, bookedAt: at, preference: 1, seatsHeld: 0, roster: lookup,
  submission: { data: { trainee_email: email, ...(travel ? { travel_over_2h: travel } : {}) }, email, createdAt: at },
});

test("facts come from the form and the roster", () => {
  const a = applicantFor(form("1", "ana@utoronto.ca", "Yes", "2026-09-20T10:00:00Z"));
  assert.equal(a.name, "ana@utoronto.ca", "the roster's name column is not trusted — it can hold the institution");
  assert.equal(a.isOutOfTown, true);
  assert.equal(a.isCurrentTrainee, true);
  const c = applicantFor(form("3", "cat@gmail.com", undefined, "2026-09-20T10:00:00Z"));
  assert.equal(c.travel, "unknown", "no answer is not 'local'");
  assert.equal(c.isOutOfTown, undefined);
  assert.equal(c.roster, "off");
  assert.equal(c.name, "cat@gmail.com", "falls back to the email, never blank");
  const d = applicantFor({ ...form("4", "d@x.ca", "No", "2026-09-20T10:00:00Z"), roster: () => undefined });
  assert.equal(d.roster, "unknown", "no roster to check is not 'not a trainee'");
  assert.equal(d.travel, "near");
});

test("an account booking falls back to the profile country", () => {
  const u = applicantFor({
    bookingId: "u", status: "pending", bookedAt: "2026-09-20T09:00:00Z", preference: null, seatsHeld: 0, roster: lookup,
    user: { name: "Uma", email: "uma@x.com", organization: null, country: "United States" },
  });
  assert.equal(u.isOutOfTown, true);
  assert.equal(u.name, "Uma");
});

test("ranking + suggestions fill only the open seats, confirmed seats stand", () => {
  const rules: Rule[] = [
    { id: "o", kind: "out_of_town", label: "Out-of-town first", isActive: true },
    { id: "t", kind: "current_trainee", label: "Trainees first", isActive: true },
    { id: "f", kind: "first_come", label: "First come", isActive: true },
  ];
  const people = [
    applicantFor(form("early-local", "ben@utoronto.ca", "No", "2026-09-20T08:00:00Z")),
    applicantFor(form("far-late", "cat@gmail.com", "Yes", "2026-09-20T12:00:00Z")),
    applicantFor(form("far-trainee", "ana@utoronto.ca", "Yes", "2026-09-20T13:00:00Z")),
    applicantFor(form("held", "zed@x.ca", "No", "2026-09-20T07:00:00Z", "confirmed")),
  ];
  const ranked = rankApplicants(people, rules, 3);
  // Ben (early-local) is on the roster, so "Trainees first" lifts him above Zed.
  assert.deepEqual(ranked.map((r) => r.applicant.id), ["far-trainee", "far-late", "early-local", "held"]);
  assert.equal(ranked[0].decidedBy, "Trainees first", "why Ana is above the next person");
  const s = suggestSeats(ranked, 3);
  // 3 seats, 1 already confirmed → 2 open: the two far applicants.
  assert.equal(s.get("far-trainee"), "approve");
  assert.equal(s.get("far-late"), "approve");
  assert.equal(s.get("held"), null, "a confirmed seat is never taken back");
  assert.equal(s.get("early-local"), "waitlist");
});
