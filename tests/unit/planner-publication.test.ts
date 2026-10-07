import test from "node:test";
import assert from "node:assert/strict";
import { plannerPublicationChanges } from "../../src/lib/events/planner-publication";
import { EMPTY_PUBLICATION, PublicProfileInput, type PublicationState } from "../../src/lib/events/people-publication";
import { applyPublication } from "../../src/lib/events/people-publication-store";
import { PlanPersonSchema, type PlanSnapshot } from "../../src/lib/events/people-plan";

const person = PlanPersonSchema.parse({ id: "person", fullName: "Example Person", title: "New role", organization: "Company", bio: "PRIVATE planning notes", email: "private@example.org", source: "paste", session: "discussion" });
const roster: PlanSnapshot = { version: null, people: [person], speakers: [] };
const profile = PublicProfileInput.parse({ fullName: "Example Person", title: "Old role", organization: "Company", bio: "Public biography", photoUrl: null, linkedinUrl: null, links: [], placements: [{ sessionId: "keynote", order: 1 }, { sessionId: "networking", order: 0 }] });
const state: PublicationState = { ...EMPTY_PUBLICATION, revision: 1, initialized: true, approved: [{ id: "person", profile, approvedRevision: 1 }] };

test("planner push moves afternoon sessions and updates planner fields without changing keynote placement", () => {
  const changes = plannerPublicationChanges(state, roster);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].profile?.placements, [{ sessionId: "keynote", order: 1 }, { sessionId: "discussion", order: 0 }]);
  assert.equal(changes[0].profile?.title, "New role");
  assert.equal(changes[0].profile?.bio, "Public biography");
  assert.ok(!JSON.stringify(changes).includes("PRIVATE"));
  assert.ok(!JSON.stringify(changes).includes("private@example.org"));
});
test("new profiles use matched public submission, never freeform planner notes", () => {
  assert.equal(plannerPublicationChanges(EMPTY_PUBLICATION, roster)[0].profile?.bio, "");
  const matched = { ...roster, people: [{ ...person, linkedSpeakerId: "speaker" }], speakers: [{ id: "speaker", fullName: person.fullName, organization: person.organization, title: "Submitted title", bio: "Submitted public bio", contactEmail: person.email, photoUrl: null, sessionTitle: null, submittedAt: "2026-10-07T00:00:00Z" }] };
  assert.equal(plannerPublicationChanges(EMPTY_PUBLICATION, matched)[0].profile?.bio, "Submitted public bio");
});
test("unassigning or archiving removes only planner appearances; other sessions remain", () => {
  const unassigned = { ...roster, people: [{ ...person, session: null }] };
  assert.deepEqual(plannerPublicationChanges(state, unassigned)[0].profile?.placements, [{ sessionId: "keynote", order: 1 }]);
  const onlyPlanner = { ...state, approved: [{ id: person.id, approvedRevision: 1, profile: { ...profile, placements: [profile.placements[1]] } }] };
  assert.deepEqual(plannerPublicationChanges(onlyPlanner, unassigned), [{ id: "person", profile: null }]);
  assert.deepEqual(plannerPublicationChanges(onlyPlanner, { ...roster, people: [{ ...person, archived: true }] }), [{ id: "person", profile: null }]);
});
test("one atomic publication revision covers all changes without activating the initial feed", () => {
  const changes = plannerPublicationChanges(EMPTY_PUBLICATION, roster);
  const action = { action: "publish-plan" as const, changes, confirm: true as const, rosterHash: "a".repeat(64) };
  const next = applyPublication(EMPTY_PUBLICATION, action, "2026-10-07T00:00:00.000Z");
  assert.equal(next.initialized, false);
  assert.equal(next.revision, 1);
  assert.equal(next.approved.length, 1);
  assert.deepEqual(plannerPublicationChanges(next, roster), []);
  assert.equal(EMPTY_PUBLICATION.approved.length, 0);
});
test("unrelated approved panels and their pending drafts survive planner publication", () => {
  const untouched = { id: "other", profile: { ...profile, placements: [profile.placements[0]] }, approvedRevision: 1 };
  const current = { ...state, approved: [...state.approved, untouched], drafts: [{ id: "other", profile: { ...untouched.profile, bio: "Pending editorial changes" } }] };
  const next = applyPublication(current, { action: "publish-plan", changes: plannerPublicationChanges(current, roster), confirm: true, rosterHash: "a".repeat(64) }, "2026-10-07T00:00:00.000Z");
  assert.deepEqual(next.approved.find((p) => p.id === "other"), untouched);
  assert.equal(next.drafts.find((p) => p.id === "other")?.profile.bio, "Pending editorial changes");
});
