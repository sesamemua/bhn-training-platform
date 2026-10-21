import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { SYMPOSIUM_DAY_PREFIX } from "../../src/lib/social/symposium-day";

let setting: { value: string; updatedAt: Date } | null = null, race = false;
const posts = new Map<string, Record<string, unknown>>([
  ["one", { id: "one", key: SYMPOSIUM_DAY_PREFIX + "one", status: "draft" }],
  ["two", { id: "two", key: SYMPOSIUM_DAY_PREFIX + "two", status: "draft" }],
]);
Reflect.set(globalThis, "prisma", {
  platformSetting: {
    findUnique: async () => setting,
    create: async ({ data }: { data: NonNullable<typeof setting> }) => { if (setting || race) throw Object.assign(new Error("Exists"), { code: "P2002" }); setting = data; },
    updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: NonNullable<typeof setting> }) => { if (race || where.updatedAt.toISOString() !== setting?.updatedAt.toISOString()) return { count: 0 }; setting = data; return { count: 1 }; },
  },
  socialPost: {
    findMany: async ({ where }: { where: { key: { startsWith: string }; status: { not: string } } }) => { assert.equal(where.key.startsWith, SYMPOSIUM_DAY_PREFIX); return [...posts.values()].filter(p => p.status !== where.status.not).map(p => ({ id: p.id })); },
    upsert: async ({ where, create, update }: { where: { key: string }; create: Record<string, unknown>; update: unknown }) => {
      assert.deepEqual(update, {});
      const existing = [...posts.values()].find(p => p.key === where.key);
      if (existing) return existing;
      const post = { ...create, id: "new-" + posts.size, status: "draft", editVersion: 0, trackChanges: true, assetUrl: null };
      posts.set(post.id, post); return post;
    },
  },
});
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: new URL("../fixtures/people-route-auth.cjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const route = import("../../src/app/api/admin/social/day/route").finally(() => hooks.deregister());
const origin = "https://platform.example.org";
const request = (body: unknown, source = origin) => new Request(origin + "/api/admin/social/day", { method: "POST", headers: { origin: source }, body: JSON.stringify(body) });

test("day-of post writes require an identified admin, same origin and validated content", async () => {
  const { GET, POST } = await route;
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await GET()).status, 403); assert.equal((await POST(request({}))).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin-a" } });
  assert.equal((await POST(request({}, "https://other.example.org"))).status, 403);
  assert.equal((await POST(request({ action: "create", title: "", body: "", requestId: "bad" }))).status, 400);
  assert.equal((await POST(new Request(origin + "/api/admin/social/day", { method: "POST", headers: { origin }, body: "{" }))).status, 400);
  assert.equal((await POST(request({ action: "order", order: ["one", "one"], version: null }))).status, 400);
  assert.equal(posts.size, 2);
});

test("manual day-of posts are tagged drafts and retrying creation does not duplicate or overwrite them", async () => {
  const { POST } = await route;
  const input = { action: "create", title: "Extra moment", body: "An additional conversation.", requestId: "00000000-0000-4000-8000-000000000001" };
  const first = await (await POST(request(input))).json();
  assert.equal(first.post.status, "draft"); assert.equal(first.post.symposiumDay, true); assert.match(first.post.body, /@BioHubNet/);
  assert.equal(first.post.trackChanges, true); assert.equal(first.post.approvedAt, undefined);
  const second = await (await POST(request({ ...input, body: "Do not overwrite an existing draft" }))).json();
  assert.equal(second.post.id, first.post.id); assert.equal(second.post.body, first.post.body); assert.equal(posts.size, 3);
  assert.deepEqual(first.layout.order, ["one", "two", first.post.id]);
});

test("shared day order rejects foreign IDs and stale moves and removes deleted drafts without affecting other posts", async () => {
  const { GET, POST } = await route;
  const initial = await (await GET()).json();
  assert.equal((await POST(request({ action: "order", order: ["foreign"], version: null }))).status, 409);
  const order = [...initial.order].reverse();
  assert.equal((await POST(request({ action: "order", order, version: null }))).status, 200);
  const saved = await (await GET()).json(); assert.deepEqual(saved.order, order);
  assert.equal((await POST(request({ action: "order", order: initial.order, version: null }))).status, 409);
  race = true; assert.equal((await POST(request({ action: "order", order: initial.order, version: saved.version }))).status, 409); race = false;
  posts.get("one")!.status = "skipped";
  const withoutDeleted = await (await GET()).json(); assert.ok(!withoutDeleted.order.includes("one"));
  assert.equal(posts.get("one")!.status, "skipped");
  assert.equal((await POST(request({ action: "order", order: [...withoutDeleted.order].reverse(), version: withoutDeleted.version }))).status, 200);
});
