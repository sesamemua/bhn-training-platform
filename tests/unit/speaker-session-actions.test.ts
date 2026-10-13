import test from "node:test";
import assert from "node:assert/strict";
import { speakerSessionActions, WebsitePeopleSchema, type WebsitePeople } from "../../src/lib/events/speaker-session-actions";
import { EMPTY_PUBLICATION, PUBLICATION_EVENT, type PublicProfileInput } from "../../src/lib/events/people-publication";
import type { PlanSnapshot } from "../../src/lib/events/people-plan";

const roster: PlanSnapshot = {
  version: null,
  people: [{ id: "person", fullName: "Liz Csaszar", organization: "UHN", title: "Director", bio: "", email: "", session: null, source: "submission", speakerIds: ["submission"], linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false }],
  speakers: [{ id: "submission", fullName: "Liz Csaszar", organization: "UHN", title: "Director", bio: "Submitted bio", contactEmail: null, photoUrl: "https://example.org/photo.jpg", sessionTitle: null, submittedAt: "2026-10-12T10:00:00Z", eventSlug: PUBLICATION_EVENT }],
};
const website: WebsitePeople = { schemaVersion: 1, eventId: PUBLICATION_EVENT, initialized: true, complete: true, revision: 31, people: [] };
const profile: PublicProfileInput = { fullName: "Liz Csaszar", organization: "UHN", title: "Director", bio: "Submitted bio", photoUrl: null, linkedinUrl: null, links: [], placements: [{ sessionId: "networking", order: 9 }] };

test("new submitted speaker absent from website is an unassigned action, without mutating the roster", () => {
  const before = structuredClone(roster);
  const actions = speakerSessionActions(roster, EMPTY_PUBLICATION, website);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].person.session, null);
  assert.equal(actions[0].awaitingSync, false);
  assert.deepEqual(roster, before);
});
test("website ID or normalized name suppresses duplicates, but nicknames are not guessed", () => {
  for (const person of [{ id: "person", fullName: "Changed name" }, { id: "other", fullName: "Dr. Líz Csaszar" }]) {
    assert.equal(speakerSessionActions(roster, EMPTY_PUBLICATION, { ...website, people: [person] }).length, 0);
  }
  assert.equal(speakerSessionActions(roster, EMPTY_PUBLICATION, { ...website, people: [{ id: "other", fullName: "Elizabeth Csaszar" }] }).length, 1);
});
test("archived, unfinished and other-event submissions are not queued", () => {
  const archived = structuredClone(roster); archived.people[0].archived = true;
  const unfinished = structuredClone(roster); unfinished.speakers[0].submittedAt = null;
  const otherEvent = structuredClone(roster); otherEvent.speakers[0].eventSlug = "2026-industry-insights";
  for (const value of [archived, unfinished, otherEvent]) assert.equal(speakerSessionActions(value, EMPTY_PUBLICATION, website).length, 0);
});
test("existing drafts are retained; approved profiles lagging on the website wait for sync", () => {
  const state = { ...EMPTY_PUBLICATION, initialized: true, revision: 32, drafts: [{ id: "person", profile }], approved: [{ id: "person", profile, approvedRevision: 32 }] };
  const actions = speakerSessionActions(roster, state, website);
  assert.deepEqual(actions[0].draft?.profile, profile);
  assert.equal(actions[0].awaitingSync, true);
  assert.equal(speakerSessionActions(roster, state, { ...website, revision: 32 })[0].awaitingSync, false);
});
test("website schema rejects inactive, incomplete, wrong-event or malformed feeds and strips public biography", () => {
  for (const changes of [{ initialized: false }, { complete: false }, { eventId: "other" }, { people: [{}] }]) {
    assert.equal(WebsitePeopleSchema.safeParse({ snapshot: { ...website, ...changes } }).success, false);
  }
  assert.deepEqual(WebsitePeopleSchema.parse({ snapshot: { ...website, people: [{ id: "person", fullName: "Liz", bio: "unneeded" }] } }).snapshot.people, [{ id: "person", fullName: "Liz" }]);
});
