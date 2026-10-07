import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime loader hooks are newer than the repository Node typings.
import { registerHooks } from "node:module";
import { PlanPersonSchema } from "../../src/lib/events/people-plan";

let row: { value: string; updatedAt: Date } | null = null;
let failAudit = false;
let race = false;
const audits: unknown[] = [];
const settings = {
  findUnique: async () => row,
  create: async ({ data }: { data: NonNullable<typeof row> }) => { row = data; },
  updateMany: async ({ where, data }: { where: { value: string }; data: NonNullable<typeof row> }) => {
    if (race || row?.value !== where.value) return { count: 0 };
    row = data; return { count: 1 };
  },
};
Reflect.set(globalThis, "prisma", { platformSetting: settings, $transaction: async (fn: (tx: unknown) => Promise<void>) => {
  const before = row;
  try { await fn({ platformSetting: settings, auditLog: { create: async (value: unknown) => { if (failAudit) throw new Error("Audit unavailable"); audits.push(value); } } }); }
  catch (e) { row = before; throw e; }
} });
const person = PlanPersonSchema.parse({ id: "one", fullName: "Example Person", title: "Director", organization: "Company", bio: "PRIVATE note", email: "private@example.org", session: "discussion", source: "paste" });
const roster = { version: null, people: [person], speakers: [] };
Reflect.set(globalThis, "plannerPublicationRoster", roster);
const hooks = registerHooks({ resolve(specifier, context, next) {
  const fixture = specifier === "@/lib/auth" ? "people-route-auth.cjs" : specifier === "@/lib/events/people-plan-store" ? "planner-publication-roster.cjs" : null;
  return fixture ? { url: new URL(`../fixtures/${fixture}`, import.meta.url).href, shortCircuit: true } : next(specifier, context);
} });
const route = import("../../src/app/api/admin/symposium-people/publication/route").finally(() => hooks.deregister());
const origin = "https://platform.example.org";
const request = (change: unknown, version: string | null = null, source = origin) => new Request(`${origin}/api/admin/symposium-people/publication`, { method: "POST", headers: { origin: source }, body: JSON.stringify({ version, change }) });
const preview = async () => {
  const api = await route;
  const res = await api.POST(request({ action: "preview-plan" }, row?.updatedAt.toISOString() ?? null));
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
};

test("planner preview requires admin and same origin, and does not save or publish", async () => {
  const api = await route;
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await api.POST(request({ action: "preview-plan" }))).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  assert.equal((await api.POST(request({ action: "preview-plan" }, null, "https://other.example"))).status, 403);
  const result = await preview();
  assert.equal(result.changes.length, 1);
  assert.equal(result.initialized, false);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.ok(!JSON.stringify(result).includes("private@example.org"));
  assert.equal(row, null);
  assert.equal(audits.length, 0);
});
test("tampering, omitted consent and changed roster cannot be published", async () => {
  const api = await route;
  const prepared = await preview();
  const change = { action: "publish-plan", confirm: true, rosterHash: prepared.rosterHash, changes: prepared.changes };
  assert.equal((await api.POST(request({ ...change, confirm: false }))).status, 400);
  assert.equal((await api.POST(request({ ...change, changes: [] }))).status, 409);
  roster.people[0] = { ...person, session: "networking" };
  assert.equal((await api.POST(request(change))).status, 409);
  roster.people[0] = person;
  const injected = structuredClone(change);
  injected.changes[0].profile.bio = "Not in the preview";
  assert.equal((await api.POST(request(injected))).status, 409);
  assert.equal(row, null);
});
test("approved planner changes commit atomically with audit, never implicitly activate", async () => {
  const api = await route;
  const prepared = await preview();
  const change = { action: "publish-plan", confirm: true, rosterHash: prepared.rosterHash, changes: prepared.changes };
  failAudit = true;
  assert.equal((await api.POST(request(change))).status, 400);
  assert.equal(row, null);
  failAudit = false;
  const result = await api.POST(request(change));
  assert.equal(result.status, 200, await result.clone().text());
  const saved = await result.json();
  assert.equal(saved.state.approved[0].profile.placements[0].sessionId, "discussion");
  assert.equal(saved.state.initialized, false);
  assert.equal(saved.state.revision, 1);
  assert.equal(audits.length, 1);
  assert.equal((await api.POST(request(change))).status, 409);
  assert.deepEqual((await preview()).changes, []);
});
test("removals preserve the last approval on CAS races; retry publishes one complete revision", async () => {
  const api = await route;
  roster.people[0] = { ...person, session: null };
  const prepared = await preview();
  assert.deepEqual(prepared.changes, [{ id: "one", profile: null }]);
  const change = { action: "publish-plan", confirm: true, rosterHash: prepared.rosterHash, changes: prepared.changes };
  const before = row?.value;
  race = true;
  assert.equal((await api.POST(request(change, prepared.version))).status, 409);
  assert.equal(row?.value, before);
  race = false;
  const result = await api.POST(request(change, prepared.version));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).state.approved.length, 0);
});
