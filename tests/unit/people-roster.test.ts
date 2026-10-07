import test from "node:test";
import assert from "node:assert/strict";
import { buildPeopleRoster } from "../../src/lib/events/people-roster";
import { BoardSchema, PersonInput, matchPlanPeople, personEvents, type PlanPerson, type Submission } from "../../src/lib/events/people-plan";
import { PEOPLE_2026 } from "../../src/lib/events/people-2026";

const person: PlanPerson = { id: "p", fullName: "Jane Smith", organization: "Acme", email: "", title: "", bio: "Planning notes", source: "paste", session: null, linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false };
const speaker: Submission = { id: "s", fullName: "Jane Smith", organization: "Acme", title: "Director", bio: "Submitted bio", contactEmail: null, photoUrl: null, sessionTitle: null, submittedAt: "2026-10-07T12:00:00Z", eventSlug: "2026-annual-symposium" };

test("2026 official sources are valid, distinct and never preassigned or invited", () => {
  assert.equal(PEOPLE_2026.length, 21);
  assert.equal(new Set(PEOPLE_2026.map((p) => p.id)).size, 21);
  assert.ok(PEOPLE_2026.every((p) => p.session === null && p.sourceUrl));
  assert.ok(BoardSchema.safeParse({ people: PEOPLE_2026 }).success);
});
test("one person retains both event associations and latest symposium details", () => {
  const insights = { ...speaker, id: "i", eventSlug: "2026-industry-insights" };
  const people = buildPeopleRoster([person], [], [insights, speaker]);
  assert.equal(people.length, 1);
  assert.deepEqual(people[0].speakerIds, ["i", "s"]);
  assert.equal(personEvents(people[0]).length, 2);
  assert.equal(people[0].bio, "Planning notes");
  assert.equal(matchPlanPeople(people, [insights, speaker]).get("p")?.speaker?.id, "s");
  assert.deepEqual(buildPeopleRoster(people, [], [insights, speaker]), people);
});
test("known company aliases match, conflicting emails and namesakes do not", () => {
  const seed = { ...person, organization: "Canadian Alliance for Skills and Training in Life Sciences (CASTL)" };
  assert.equal(buildPeopleRoster([seed], [], [{ ...speaker, organization: "CASTL" }]).length, 1);
  assert.equal(buildPeopleRoster([{ ...person, organization: "Health Emergency Readiness Canada" }], [], [{ ...speaker, organization: "Health Emergency Readiness Canada-Innovation Science and Economic Development Canada" }]).length, 1);
  assert.equal(buildPeopleRoster([{ ...person, email: "a@example.org" }], [], [{ ...speaker, contactEmail: "b@example.org" }]).length, 2);
  assert.equal(buildPeopleRoster([person], [], [{ ...speaker, organization: "Other company" }]).length, 2);
});
test("archived records, custom tags, edits and assignments survive source refresh", () => {
  const saved: PlanPerson = { ...person, archived: true, tags: ["Moderator"], session: "discussion", speakerIds: ["s"] };
  const people = buildPeopleRoster([saved], [], [{ ...speaker, fullName: "Updated Name" }]);
  assert.equal(people.length, 1);
  assert.equal(people[0].fullName, "Jane Smith");
  assert.equal(people[0].archived, true);
  assert.equal(people[0].session, "discussion");
  assert.deepEqual(people[0].tags, ["Moderator"]);
});
test("unlink remains unlinked after automatic refresh", () => {
  const people = buildPeopleRoster([{ ...person, speakerIds: ["s"], ignoredSpeakerIds: ["s"] }], [], [speaker]);
  assert.equal(people.length, 1);
  assert.equal(matchPlanPeople(people, [speaker]).get("p")?.speaker, null);
});
test("manual matches own their source even after a name or company changes", () => {
  const people = buildPeopleRoster([{ ...person, linkedSpeakerId: "s", fullName: "Different" }], [], [speaker]);
  assert.equal(people.length, 1);
  assert.equal(matchPlanPeople(people, [speaker]).get("p")?.kind, "manual");
});
test("tags are optional for old records and bounded for new edits", () => {
  assert.ok(PersonInput.safeParse(person).success);
  assert.ok(!PersonInput.safeParse({ ...person, tags: ["a".repeat(81)] }).success);
  assert.ok(!PersonInput.safeParse({ ...person, tags: Array(31).fill("tag") }).success);
  assert.deepEqual(personEvents({ ...person, source: "2025", session: "networking" }), ["2025-annual-symposium", "2026-annual-symposium"]);
});
