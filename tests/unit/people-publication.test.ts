import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PUBLICATION, PublicProfileInput, publicPeopleFeed, type PublicationState } from "../../src/lib/events/people-publication";
import { applyPublication, profileHash, PublicationConflict } from "../../src/lib/events/people-publication-store";
import fixtures from "../fixtures/people-publication-feed.json";

const profile: PublicProfileInput = { fullName: "Example Person", title: "Director", organization: "Example Org", bio: "Public bio", photoUrl: null, linkedinUrl: null, links: [], placements: [{ sessionId: "keynote", order: 0 }, { sessionId: "panel-3", order: 1 }] };
const now = "2026-10-07T20:00:00.000Z";
const draft = () => applyPublication(EMPTY_PUBLICATION, { action: "save", id: "person", profile }, now);
const approve = (state: PublicationState) => applyPublication(state, { action: "approve", id: "person", draftHash: profileHash(state.drafts[0].profile) }, now);

test("uninitialized feed is explicitly incomplete, not an authoritative empty list", () => {
  assert.deepEqual(publicPeopleFeed(EMPTY_PUBLICATION), fixtures.uninitialized);
  assert.equal(draft().revision, 0);
  assert.deepEqual(publicPeopleFeed(draft()), fixtures.uninitialized);
});
test("approving a person never implicitly activates or exposes the initial list", () => {
  const state = approve(draft());
  assert.equal(state.initialized, false);
  assert.equal(state.revision, 1);
  assert.deepEqual(publicPeopleFeed(state).people, []);
  assert.throws(() => applyPublication(EMPTY_PUBLICATION, { action: "initialize", confirm: true }, now), /initial website list/);
});
test("activation publishes stable multiple placements and only whitelisted profile fields", () => {
  const state = applyPublication(approve(draft()), { action: "initialize", confirm: true }, now);
  const feed = publicPeopleFeed(state);
  assert.equal(feed.complete, true);
  assert.equal(feed.revision, 2);
  assert.equal(feed.people[0].approvedRevision, 1);
  assert.deepEqual(feed.people[0].placements.map((p) => p.id), ["person:keynote", "person:panel-3"]);
  const poisoned = structuredClone(state);
  Object.assign(poisoned.approved[0].profile, { email: "secret@example.org", notes: "secret notes", actorId: "private" });
  assert.ok(!JSON.stringify(publicPeopleFeed(poisoned)).includes("secret"));
  assert.ok(!JSON.stringify(publicPeopleFeed(poisoned)).includes("actorId"));
});
test("edits leave the approved snapshot and public revision unchanged until reapproval", () => {
  const live = applyPublication(approve(draft()), { action: "initialize", confirm: true }, now);
  const edited = applyPublication(live, { action: "save", id: "person", profile: { ...profile, bio: "New draft only" } }, now);
  assert.deepEqual(publicPeopleFeed(edited), publicPeopleFeed(live));
  assert.equal(publicPeopleFeed(approve(edited)).people[0].bio, "New draft only");
  assert.equal(approve(edited).revision, 3);
  assert.equal(live.approved[0].profile.bio, "Public bio");
});
test("stale preview hash cannot approve changed data", () => {
  const edited = applyPublication(draft(), { action: "save", id: "person", profile: { ...profile, title: "Changed" } }, now);
  assert.throws(() => applyPublication(edited, { action: "approve", id: "person", draftHash: profileHash(profile) }, now), PublicationConflict);
});
test("unpublish is an authoritative complete empty snapshot with an advancing revision", () => {
  const live = applyPublication(approve(draft()), { action: "initialize", confirm: true }, now);
  const removed = applyPublication(live, { action: "unpublish", id: "person" }, now);
  assert.deepEqual(publicPeopleFeed(removed).people, []);
  assert.equal(removed.initialized, true);
  assert.equal(removed.revision, 3);
  assert.equal(removed.drafts.length, 1);
  assert.throws(() => applyPublication(removed, { action: "initialize", confirm: true }, now), /already activated/);
});
test("public schema refuses injected private fields, unsafe URLs and duplicate sessions", () => {
  assert.ok(!PublicProfileInput.safeParse({ ...profile, email: "private@example.org" }).success);
  assert.ok(!PublicProfileInput.safeParse({ ...profile, photoUrl: "javascript:alert(1)" }).success);
  assert.ok(!PublicProfileInput.safeParse({ ...profile, linkedinUrl: "https://linkedin.com.evil.test/user" }).success);
  assert.ok(!PublicProfileInput.safeParse({ ...profile, links: [{ label: "X", url: "https://user:password@example.org/" }] }).success);
  assert.ok(!PublicProfileInput.safeParse({ ...profile, placements: [profile.placements[0], profile.placements[0]] }).success);
  assert.ok(!PublicProfileInput.safeParse({ ...profile, placements: [] }).success);
});
