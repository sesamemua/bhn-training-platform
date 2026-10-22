import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { publicPeopleFeed, type PublicationState } from "../../src/lib/events/people-publication";
import type { PlanPerson, PlanSnapshot, Submission } from "../../src/lib/events/people-plan";

const person: PlanPerson = { id: "angela", fullName: "Angela Davoud", organization: "Peak R&D", title: "Founder", bio: "Private planning note", email: "", source: "website", session: "networking", linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false };
const speaker: Submission = { id: "submitted", fullName: "Angela Davoud", organization: "PeakR&D", title: "Co-founder & CGO", bio: "New public biography", contactEmail: "private@example.org", photoUrl: "https://images.example.org/speakers/headshot.jpg", sessionTitle: null, submittedAt: "2026-10-13T20:00:00Z", eventSlug: "2026-annual-symposium" };
const initial = (): PublicationState => ({ initialized: true, revision: 1, updatedAt: "2026-10-12T12:00:00.000Z", drafts: [], approved: [{ id: person.id, approvedRevision: 1, profile: { fullName: person.fullName, title: person.title, organization: person.organization, bio: "", photoUrl: null, linkedinUrl: null, links: [{ label: "Peak R&D", url: "https://example.org/" }], placements: [{ sessionId: "panel-2", order: 0 }, { sessionId: "networking", order: 6 }] } }] });
const roster = (people = [person], speakers = [speaker]): PlanSnapshot => ({ people, speakers, version: null });
let row = { value: JSON.stringify(initial()), updatedAt: new Date("2026-10-12T12:00:00.000Z") };
let race: "move" | "unpublish" | null = null;
let writes = 0;
const fake = {
  platformSetting: {
    findUnique: async ({ where }: { where: { key: string } }) => where.key.includes("Publication") ? row : { value: JSON.stringify({ people: [person] }), updatedAt: row.updatedAt },
    updateMany: async ({ where, data }: { where: { value: string }; data: typeof row }) => {
      if (race) {
        const changed = JSON.parse(row.value) as PublicationState;
        if (race === "unpublish") changed.approved = [];
        else changed.approved[0].profile.placements = [{ sessionId: "panel-3", order: 2 }];
        changed.revision++;
        const now = new Date(row.updatedAt.getTime() + 1);
        row = { value: JSON.stringify(changed), updatedAt: now }; race = null;
        return { count: 0 };
      }
      if (row.value !== where.value) return { count: 0 };
      row = data; writes++; return { count: 1 };
    },
  },
  bhnEvent: { findUnique: async ({ where }: { where: { slug: string } }) => where.slug === "2026-annual-symposium" ? { speakers: [{ ...speaker, submittedAt: new Date(speaker.submittedAt!) }] } : null },
};
Reflect.set(globalThis, "prisma", fake as unknown as PrismaClient);
const photoUrl = new URL("../fixtures/auto-publication-photo.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "./publication-photo") return { url: photoUrl, shortCircuit: true };
  return next(specifier, context);
} });
const autoPublication = import("../../src/lib/events/speaker-auto-publication").finally(() => hooks.deregister());

test("an existing website person receives submitted details in all current placements", async () => {
  const { submittedProfileUpdates } = await autoPublication;
  const state = initial();
  const changes = submittedProfileUpdates(state, roster());
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "angela");
  assert.equal(changes[0].profile.bio, speaker.bio);
  assert.equal(changes[0].profile.title, speaker.title);
  assert.deepEqual(changes[0].profile.placements, state.approved[0].profile.placements);
  assert.deepEqual(changes[0].profile.links, state.approved[0].profile.links);
  assert.ok(!JSON.stringify(changes).includes("private@example.org"));
  assert.ok(!JSON.stringify(changes).includes("Private planning note"));
});

test("unpublished, new, ambiguous, archived and explicitly unlinked people are not auto-published", async () => {
  const { submittedProfileUpdates } = await autoPublication;
  assert.deepEqual(submittedProfileUpdates({ ...initial(), initialized: false }, roster()), []);
  assert.deepEqual(submittedProfileUpdates({ ...initial(), approved: [] }, roster()), []);
  assert.deepEqual(submittedProfileUpdates(initial(), roster([{ ...person, archived: true }])), []);
  assert.deepEqual(submittedProfileUpdates(initial(), roster([{ ...person, speakerIds: [speaker.id], ignoredSpeakerIds: [speaker.id] }])), []);
  assert.deepEqual(submittedProfileUpdates(initial(), roster([{ ...person, email: "other@example.org" }])), []);
  assert.deepEqual(submittedProfileUpdates(initial(), roster([person], [{ ...speaker, eventSlug: "2026-industry-insights" }])), []);
  const ambiguous = initial();
  ambiguous.approved.push({ ...structuredClone(ambiguous.approved[0]), id: "namesake" });
  assert.deepEqual(submittedProfileUpdates(ambiguous, roster([person, { ...person, id: "namesake" }])), []);
});

test("a matched upload preserves approved per-session themes and moderator/panel placements", async () => {
  const { submittedProfileUpdates } = await autoPublication;
  const state = initial();
  state.approved[0].profile.placements[1].theme = "Venture funding";
  const change = submittedProfileUpdates(state, roster())[0];
  assert.deepEqual(change.profile.placements, state.approved[0].profile.placements);
  assert.equal(change.profile.placements[1].theme, "Venture funding");
});

test("latest submissions win and synchronized submissions do not replay", async () => {
  const { submittedProfileUpdates } = await autoPublication;
  const older = { ...speaker, id: "old", bio: "Older bio", submittedAt: "2026-10-12T20:00:00Z" };
  assert.equal(submittedProfileUpdates(initial(), roster([person], [older, speaker]))[0].sourceSubmissionId, speaker.id);
  const state = initial(); state.approved[0].sourceSubmissionId = speaker.id;
  assert.deepEqual(submittedProfileUpdates(state, roster([person], [older, speaker])), []);
});

test("automatic sync freezes photos, advances the feed and is idempotent", async () => {
  const { syncPublishedSpeakerSubmissions } = await autoPublication;
  row = { value: JSON.stringify(initial()), updatedAt: new Date("2026-10-12T12:00:00.000Z") }; writes = 0;
  const result = await syncPublishedSpeakerSubmissions();
  assert.equal(result.state.revision, 2);
  assert.equal(result.state.approved[0].profile.photoUrl, "https://images.example.org/people-publication/frozen.jpg");
  assert.equal(result.state.approved[0].sourceSubmissionId, speaker.id);
  assert.ok(!JSON.stringify(publicPeopleFeed(result.state)).includes("sourceSubmissionId"));
  assert.deepEqual((await syncPublishedSpeakerSubmissions()).state, result.state);
  assert.equal(writes, 1);
});

test("a concurrent session move is preserved and an unpublish cannot be resurrected", async () => {
  const { syncPublishedSpeakerSubmissions } = await autoPublication;
  row = { value: JSON.stringify(initial()), updatedAt: new Date("2026-10-12T12:00:00.000Z") }; race = "move";
  const moved = await syncPublishedSpeakerSubmissions();
  assert.deepEqual(moved.state.approved[0].profile.placements, [{ sessionId: "panel-3", order: 2 }]);
  row = { value: JSON.stringify(initial()), updatedAt: new Date("2026-10-12T12:00:00.000Z") }; race = "unpublish";
  assert.deepEqual((await syncPublishedSpeakerSubmissions()).state.approved, []);
});

test("a failed headshot copy leaves the public snapshot intact", async () => {
  const { syncPublishedSpeakerSubmissions } = await autoPublication;
  row = { value: JSON.stringify(initial()), updatedAt: new Date("2026-10-12T12:00:00.000Z") };
  const before = row.value;
  Reflect.set(globalThis, "failAutoPublicationPhoto", true);
  await assert.rejects(syncPublishedSpeakerSubmissions(), /Headshot unavailable/);
  assert.equal(row.value, before);
  Reflect.set(globalThis, "failAutoPublicationPhoto", false);
});
