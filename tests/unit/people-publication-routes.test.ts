import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { EMPTY_PUBLICATION, type PublicProfileInput } from "../../src/lib/events/people-publication";

let row: { value: string; updatedAt: Date } | null = null;
let failRead = false;
let race = false;
let failAudit = false;
const audits: unknown[] = [];
const setting = {
  findUnique: async ({ where }: { where: { key: string } }) => {
    if (failRead) throw new Error("Simulated database outage");
    return where.key.includes("Publication") ? row : null;
  },
  create: async ({ data }: { data: { value: string; updatedAt: Date } }) => { if (row) throw Object.assign(new Error("exists"), { code: "P2002" }); row = data; return data; },
  updateMany: async ({ where, data }: { where: { value: string }; data: { value: string; updatedAt: Date } }) => {
    if (race || row?.value !== where.value) return { count: 0 };
    row = data; return { count: 1 };
  },
};
const fake = {
  platformSetting: setting,
  bhnEvent: { findUnique: async () => ({ speakers: [] }) },
  $transaction: async (fn: (tx: unknown) => Promise<void>) => {
    const before = row;
    try { await fn({ platformSetting: setting, auditLog: { create: async (data: unknown) => { if (failAudit) throw new Error("Audit unavailable"); audits.push(data); } } }); }
    catch (e) { row = before; throw e; }
  },
};
Reflect.set(globalThis, "prisma", fake as unknown as PrismaClient);
const authUrl = new URL("../fixtures/people-route-auth.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: authUrl, shortCircuit: true };
  return next(specifier, context);
} });
const routes = Promise.all([
  import("../../src/app/api/admin/symposium-people/publication/route"),
  import("../../src/app/api/public/events/2026-annual-symposium/people/route"),
]).finally(() => hooks.deregister());
const origin = "https://platform.example.org";
const request = (body: unknown, source: string | null = origin) => new Request(`${origin}/api/admin/symposium-people/publication`, { method: "POST", headers: source ? { origin: source } : {}, body: JSON.stringify(body) });
const publicRequest = (tag?: string) => new Request(`${origin}/api/public/events/2026-annual-symposium/people`, { headers: tag ? { "If-None-Match": tag } : {} });
const profile: PublicProfileInput = { fullName: "Kelley Parato", title: "Director", organization: "Example", bio: "Public bio", photoUrl: null, linkedinUrl: null, links: [], placements: [{ sessionId: "panel-1", order: 0 }] };

test("publication mutations require an administrator and exact same-origin request", async () => {
  const [admin] = await routes;
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await admin.GET()).status, 403);
  assert.equal((await admin.POST(request({}))).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  assert.equal((await admin.POST(request({}, "https://evil.example"))).status, 403);
  assert.equal((await admin.POST(request({}, null))).status, 403);
  assert.equal((await admin.POST(request({ change: { action: "save", id: "x", profile: { ...profile, email: "private" } }, version: null }))).status, 400);
});
test("public empty initial feed has CORS, cache policy and conditional ETag handling", async () => {
  const [, publicRoute] = await routes;
  row = null;
  const res = await publicRoute.GET(publicRequest());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("cache-control")!, /max-age=30/);
  assert.equal((await res.json()).initialized, false);
  assert.equal((await publicRoute.GET(publicRequest(res.headers.get("etag")!))).status, 304);
  assert.equal((await publicRoute.OPTIONS()).status, 204);
});
test("real admin handlers save, approve, activate, retain old snapshot after edits, and unpublish", async () => {
  const [admin, publicRoute] = await routes;
  row = null;
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  let state = await (await admin.GET()).json();
  const mutate = async (change: unknown) => {
    const response = await admin.POST(request({ version: state.version, change }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    state = await response.json();
  };
  await mutate({ action: "save", id: "2025-kelley-parato", profile });
  assert.equal((await (await publicRoute.GET(publicRequest())).json()).people.length, 0);
  await mutate({ action: "approve", id: "2025-kelley-parato", draftHash: state.hashes["2025-kelley-parato"] });
  assert.equal((await (await publicRoute.GET(publicRequest())).json()).complete, false);
  await mutate({ action: "initialize", confirm: true });
  const first = await (await publicRoute.GET(publicRequest())).json();
  assert.equal(first.people[0].bio, "Public bio");
  await mutate({ action: "save", id: "2025-kelley-parato", profile: { ...profile, bio: "Private draft edit" } });
  assert.deepEqual(await (await publicRoute.GET(publicRequest())).json(), first);
  const stale = await admin.POST(request({ version: null, change: { action: "unpublish", id: "2025-kelley-parato" } }));
  assert.equal(stale.status, 409);
  await mutate({ action: "unpublish", id: "2025-kelley-parato" });
  const last = await (await publicRoute.GET(publicRequest())).json();
  assert.equal(last.complete, true); assert.equal(last.people.length, 0); assert.ok(last.revision > first.revision);
  assert.equal(audits.length, 5);
});
test("publication races and audit failures do not overwrite or partially approve", async () => {
  const [admin] = await routes;
  const current = await (await admin.GET()).json();
  const raw = row?.value;
  race = true;
  assert.equal((await admin.POST(request({ version: current.version, change: { action: "save", id: "2025-kelley-parato", profile } }))).status, 409);
  assert.equal(row?.value, raw);
  race = false; failAudit = true;
  assert.equal((await admin.POST(request({ version: current.version, change: { action: "save", id: "2025-kelley-parato", profile } }))).status, 400);
  assert.equal(row?.value, raw);
  failAudit = false;
});
test("DB failure and corrupt stored data are 503, never authoritative empty", async () => {
  const [, publicRoute] = await routes;
  failRead = true;
  let res = await publicRoute.GET(publicRequest());
  assert.equal(res.status, 503); assert.equal(res.headers.get("cache-control"), "no-store");
  failRead = false; row = { value: "{broken", updatedAt: new Date() };
  res = await publicRoute.GET(publicRequest());
  assert.equal(res.status, 503);
  row = { value: JSON.stringify(EMPTY_PUBLICATION), updatedAt: new Date() };
});
