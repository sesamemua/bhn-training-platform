import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { DEFAULT_SOCIAL_ORDER } from "../../src/lib/social/order";

let row: { value: string; updatedAt: Date } | null = null;
let fail = false;
let race = false;
Reflect.set(globalThis, "prisma", { platformSetting: {
  findUnique: async () => { if (fail) throw new Error("Offline"); return row; },
  create: async ({ data }: { data: { value: string; updatedAt: Date } }) => {
    if (fail) throw new Error("Offline");
    if (row || race) throw Object.assign(new Error("Exists"), { code: "P2002" });
    row = data; return row;
  },
  updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: { value: string; updatedAt: Date } }) => {
    if (fail) throw new Error("Offline");
    if (race || row?.updatedAt.toISOString() !== where.updatedAt.toISOString()) return { count: 0 };
    row = data; return { count: 1 };
  },
} });
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: new URL("../fixtures/people-route-auth.cjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const route = import("../../src/app/api/admin/social/order/route").finally(() => hooks.deregister());
const origin = "https://platform.example.org";
const request = (order: unknown, version: string | null = null, source = origin) => new Request(origin + "/api/admin/social/order", {
  method: "POST", headers: { origin: source }, body: JSON.stringify({ order, version }),
});

test("only same-origin admin requests can save a complete campaign order", async () => {
  const { GET, POST } = await route;
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await GET()).status, 403);
  assert.equal((await POST(request(DEFAULT_SOCIAL_ORDER))).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin-a" } });
  assert.equal((await POST(request(DEFAULT_SOCIAL_ORDER, null, "https://other.example.org"))).status, 403);
  assert.equal((await POST(request(["unknown"]))).status, 400);
  assert.equal((await POST(new Request(origin + "/api/admin/social/order", { method: "POST", headers: { origin }, body: "{" }))).status, 400);
  assert.equal((await POST(new Request(origin + "/api/admin/social/order", { method: "POST", headers: { origin }, body: "x".repeat(4001) }))).status, 413);
  assert.equal(row, null);
});

test("one admin saves and another reads the same order without changing any posts", async () => {
  const { GET, POST } = await route;
  const initial = await GET();
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.deepEqual(await initial.json(), { order: DEFAULT_SOCIAL_ORDER, version: null });
  const order = [...DEFAULT_SOCIAL_ORDER].reverse();
  const response = await POST(request(order));
  assert.equal(response.status, 200);
  const layout = (await response.json()).layout;
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin-b" } });
  assert.deepEqual(await (await GET()).json(), layout);
  assert.deepEqual(layout.order, order);
});

test("concurrent moves return the current order instead of overwriting another admin", async () => {
  const { GET, POST } = await route;
  const current = await (await GET()).json();
  const stale = await POST(request(DEFAULT_SOCIAL_ORDER));
  assert.equal(stale.status, 409);
  assert.deepEqual((await stale.json()).layout, current);
  race = true;
  assert.equal((await POST(request(DEFAULT_SOCIAL_ORDER, current.version))).status, 409);
  race = false;
  assert.equal((await POST(request(DEFAULT_SOCIAL_ORDER, current.version))).status, 200);
  const saved = await (await GET()).json();
  assert.notEqual(saved.version, current.version);
  row = null; race = true;
  assert.equal((await POST(request(DEFAULT_SOCIAL_ORDER))).status, 409);
  race = false;
});

test("unavailable or corrupt storage cannot overwrite the shared order with a default", async () => {
  const { GET, POST } = await route;
  fail = true;
  assert.equal((await GET()).status, 503);
  assert.equal((await POST(request(DEFAULT_SOCIAL_ORDER))).status, 503);
  fail = false;
  row = { value: "{broken", updatedAt: new Date() };
  assert.equal((await GET()).status, 503);
});
