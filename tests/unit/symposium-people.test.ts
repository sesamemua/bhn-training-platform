import test from "node:test";
import assert from "node:assert/strict";
import { parsePeopleTable } from "../../src/lib/events/people-import";
import { PersonInput, PLAN_SESSIONS, matchPlanPeople, duplicatePeople, type PlanPerson, type Submission } from "../../src/lib/events/people-plan";
import { PEOPLE_2025 } from "../../src/lib/events/people-2025";

const person = (extra: Partial<PlanPerson> = {}): PlanPerson => ({ id: "p1", fullName: "Jane Smith", organization: "Acme Bio", title: "", bio: "Imported notes", email: "", source: "paste", session: "networking", linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false, ...extra });
const speaker = (extra: Partial<Submission> = {}): Submission => ({ id: "s1", fullName: "Jane Smith", organization: "Acme Bio", title: "Director", bio: "Submitted bio", contactEmail: null, photoUrl: "https://example.org/photo.jpg", sessionTitle: "A talk", submittedAt: "2026-10-07T12:00:00Z", ...extra });

test("CSV and TSV preserve commas, quoted newlines, accents and optional fields", () => {
  for (const sep of [",", "\t"]) {
    const input = ["Name", "Company", "Bio", "Email"].join(sep) + "\n" + ['"Jane Smith"', '"Acme, Inc."', '"One paragraph.\nAnother, with commas."', "jane@example.org"].join(sep);
    assert.deepEqual(parsePeopleTable(input), [{ fullName: "Jane Smith", organization: "Acme, Inc.", bio: "One paragraph.\nAnother, with commas.", email: "jane@example.org", title: "" }]);
  }
  assert.equal(parsePeopleTable("Full Name\tOrganisation\nÉmilie Roy\tLab")![0].fullName, "Émilie Roy");
  assert.equal(parsePeopleTable("Jane Smith\nAcme Bio\nA biography."), null);
});

test("table validation catches malformed columns, invalid email and excessive rows", () => {
  assert.throws(() => parsePeopleTable("Name,Company\nJane,Acme,extra"), /columns/);
  assert.throws(() => parsePeopleTable("Name,Email\nJane,invalid"), /email/);
  assert.throws(() => parsePeopleTable("Name\n" + Array(101).fill("Jane Smith").join("\n")), /100/);
  assert.equal(PersonInput.safeParse({ fullName: "A" }).success, false);
});

test("unique email and exact normalized name/company match submissions", () => {
  assert.equal(matchPlanPeople([person()], [speaker()]).get("p1")?.kind, "name-company");
  assert.equal(matchPlanPeople([person({ email: "JANE@example.org" })], [speaker({ fullName: "Jane A. Smith", organization: "New Company", contactEmail: "jane@example.org" })]).get("p1")?.kind, "email");
  assert.equal(matchPlanPeople([person({ fullName: "Dr. Émilie Roy" })], [speaker({ fullName: "Emilie Roy" })]).get("p1")?.speaker?.id, "s1");
});

test("name alone, competing submissions, or conflicting emails require review", () => {
  assert.equal(matchPlanPeople([person({ organization: "" })], [speaker()]).get("p1")?.kind, "review");
  const duplicate = matchPlanPeople([person()], [speaker(), speaker({ id: "s2" })]).get("p1")!;
  assert.equal(duplicate.speaker, null); assert.equal(duplicate.candidates.length, 2);
  assert.equal(matchPlanPeople([person({ email: "one@example.org" })], [speaker({ contactEmail: "other@example.org" })]).get("p1")?.speaker, null);
});

test("same submission cannot be automatically claimed by two planned people", () => {
  const result = matchPlanPeople([person(), person({ id: "p2" })], [speaker()]);
  assert.equal(result.get("p1")?.speaker, null);
  assert.equal(result.get("p2")?.kind, "review");
});

test("manual matches take priority; unlinked, archived and unsubmitted records do not auto-link", () => {
  const result = matchPlanPeople([person({ linkedSpeakerId: "s1" }), person({ id: "p2" })], [speaker()]);
  assert.equal(result.get("p1")?.kind, "manual"); assert.equal(result.get("p2")?.speaker, null);
  for (const p of [person({ ignoredSpeakerIds: ["s1"] }), person({ archived: true })]) assert.equal(matchPlanPeople([p], [speaker()]).get(p.id)?.speaker, null);
  assert.equal(matchPlanPeople([person()], [speaker({ submittedAt: null })]).get("p1")?.speaker, null);
});

test("matching is non-destructive and displays fresh submitted fields", () => {
  const p = person(), s = speaker();
  const original = JSON.stringify(p);
  const result = matchPlanPeople([p], [s]).get("p1")!;
  assert.equal(result.speaker?.bio, "Submitted bio");
  assert.equal(JSON.stringify(p), original);
  assert.equal(matchPlanPeople([p], []).get("p1")?.kind, "none", "deleted submissions no longer match");
});

test("duplicate imports compare email or name/company without overwriting distinct identities", () => {
  assert.equal(duplicatePeople(person(), person()), true);
  assert.equal(duplicatePeople(person({ email: "a@example.org" }), person({ email: "b@example.org" })), false);
  assert.equal(duplicatePeople(person({ organization: "A" }), person({ organization: "B" })), false);
});

test("official 2025 library contains twelve unassigned profiles with provenance and photos", () => {
  assert.equal(PEOPLE_2025.length, 12);
  assert.equal(new Set(PEOPLE_2025.map((p) => p.id)).size, 12);
  for (const p of PEOPLE_2025) {
    assert.equal(p.source, "2025"); assert.equal(p.session, null);
    assert.equal(p.linkedSpeakerId, null); assert.equal(p.email, "");
    assert.match(p.sourceUrl!, /biohubnet.ca\/2025-annual-symposium/);
    assert.match(p.photoUrl!, /^https:\/\/biohubnet.ca\/wp-content\/uploads\/2025\//);
  }
  assert.equal(Object.keys(PLAN_SESSIONS).length, 2);
});
