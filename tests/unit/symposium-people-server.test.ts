import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { PlanSnapshot, PlanPerson, Submission } from "../../src/lib/events/people-plan";

const unexpected = async () => { throw new Error("Unexpected database call"); };
const prisma = { platformSetting: { findUnique: unexpected, create: unexpected, updateMany: unexpected }, bhnEvent: { findUnique: unexpected } } as unknown as PrismaClient;
Reflect.set(globalThis, "prisma", prisma);
const server = import("../../src/lib/events/people-plan-store");
const p: PlanPerson = { id: "p", fullName: "Jane Smith", organization: "Acme", title: "", bio: "", email: "", source: "paste", session: "networking", linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false };
const s: Submission = { id: "s", fullName: "Jane Smith", organization: "Acme", title: "Director", bio: "New bio", contactEmail: null, photoUrl: null, sessionTitle: null, submittedAt: "2026-10-07T12:00:00Z" };
const snapshot = (): PlanSnapshot => ({ people: [structuredClone(p)], speakers: [s], version: "2026-10-07T12:00:00.000Z" });

test("imports are idempotent and never replace a colleague's existing notes", async () => {
  const { changePeoplePlan } = await server;
  const result = changePeoplePlan(snapshot(), { action: "add", people: [{ ...p, bio: "Overwrite?", session: "discussion" }, { ...p, fullName: "Other Person", session: "discussion" }] });
  assert.equal(result.added, 1); assert.equal(result.skipped, 1);
  assert.equal(result.people[0].bio, ""); assert.equal(result.people[0].session, "networking");
});

test("moving assigns only one concurrent session, archive is reversible, and input stays unchanged", async () => {
  const { changePeoplePlan } = await server;
  const input = snapshot();
  const moved = changePeoplePlan(input, { action: "assign", id: "p", session: "discussion" });
  assert.equal(moved.people[0].session, "discussion"); assert.equal(input.people[0].session, "networking");
  const archived = changePeoplePlan(input, { action: "archive", id: "p", archived: true });
  assert.equal(archived.people[0].archived, true);
  assert.equal(changePeoplePlan({ ...input, people: archived.people }, { action: "archive", id: "p", archived: false }).people[0].archived, false);
});

test("manual link is event-scoped, one-to-one, and unlink suppresses rematching", async () => {
  const { changePeoplePlan } = await server;
  assert.throws(() => changePeoplePlan(snapshot(), { action: "link", id: "p", speakerId: "foreign" }), /this event/);
  const unlinked = changePeoplePlan(snapshot(), { action: "link", id: "p", speakerId: null });
  assert.deepEqual(unlinked.people[0].ignoredSpeakerIds, ["s"]);
  const other = { ...p, id: "other", fullName: "Different Person" };
  assert.throws(() => changePeoplePlan({ ...snapshot(), people: [p, other] }, { action: "link", id: "other", speakerId: "s" }), /already matched/);
});

test("stale client cannot save over a colleague's board", async (t) => {
  const { savePeoplePlan } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => ({ value: JSON.stringify({ people: [p] }), updatedAt: new Date("2026-10-07T13:00:00Z") }));
  t.mock.method(prisma.bhnEvent, "findUnique", async () => ({ speakers: [] }));
  const result = await savePeoplePlan(snapshot().version, { action: "assign", id: "p", session: "discussion" });
  assert.equal(result.conflict, true);
  assert.equal(result.snapshot.people[0].session, "networking");
});

test("atomic compare-and-swap detects a race after reading; no public speaker writes", async (t) => {
  const { savePeoplePlan } = await server;
  const raw = JSON.stringify({ people: [p] });
  t.mock.method(prisma.platformSetting, "findUnique", async () => ({ value: raw, updatedAt: new Date(snapshot().version!) }));
  t.mock.method(prisma.bhnEvent, "findUnique", async () => ({ speakers: [] }));
  t.mock.method(prisma.platformSetting, "updateMany", async (input) => { assert.equal(input.where.value, raw); assert.equal(input.where.updatedAt.toISOString(), snapshot().version); return { count: 0 }; });
  assert.equal((await savePeoplePlan(snapshot().version, { action: "assign", id: "p", session: "discussion" })).conflict, true);
});

test("empty storage starts with sourced 2025 profiles and saves all colleagues' planning persistently", async (t) => {
  const { loadPeoplePlan, savePeoplePlan } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  t.mock.method(prisma.bhnEvent, "findUnique", async () => ({ speakers: [] }));
  const initial = await loadPeoplePlan(); assert.equal(initial.snapshot.people.length, 33);
  let saved = "";
  t.mock.method(prisma.platformSetting, "create", async ({ data }) => { saved = data.value; return data; });
  const result = await savePeoplePlan(null, { action: "assign", id: initial.snapshot.people[0].id, session: "discussion" });
  assert.equal(result.conflict, false);
  assert.equal(JSON.parse(saved).people[0].session, "discussion");
});

test("corrupt stored data fails visibly rather than resetting profiles", async (t) => {
  const { loadPeoplePlan } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => ({ value: "bad json", updatedAt: new Date() }));
  t.mock.method(prisma.bhnEvent, "findUnique", async () => ({ speakers: [] }));
  await assert.rejects(loadPeoplePlan());
});

test("both event intakes enter the roster without modifying public speaker records", async (t) => {
  const { loadPeoplePlan } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  const requested: string[] = [];
  t.mock.method(prisma.bhnEvent, "findUnique", async ({ where }) => {
    requested.push(where.slug);
    return { speakers: [{ ...s, id: where.slug, submittedAt: new Date(s.submittedAt!) }] };
  });
  const { snapshot } = await loadPeoplePlan();
  assert.deepEqual(requested.sort(), ["2026-annual-symposium", "2026-industry-insights"]);
  const jane = snapshot.people.filter((p) => p.fullName === "Jane Smith");
  assert.equal(jane.length, 1);
  assert.equal(jane[0].eventTags?.length, 2);
  assert.equal(jane[0].speakerIds?.length, 2);
});

test("missing Industry Insights event does not break symposium roster", async (t) => {
  const { loadPeoplePlan } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  t.mock.method(prisma.bhnEvent, "findUnique", async ({ where }) => where.slug === "2026-industry-insights" ? null : { speakers: [] });
  assert.equal((await loadPeoplePlan()).snapshot.people.length, 33);
});
