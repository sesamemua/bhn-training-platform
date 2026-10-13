import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { DEFAULT_CARD_ORDER } from "../../src/lib/dashboard/card-order";
let row: { value: string; updatedAt: Date } | null = null;
let fail = false;
let race = false;
Reflect.set(globalThis, "prisma", { platformSetting: {
  findUnique: async () => { if (fail) throw new Error("Offline"); return row; },
  create: async ({ data }: { data: { value: string; updatedAt: Date } }) => {
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
const route = import("../../src/app/api/admin/dashboard-layout/route").finally(() => hooks.deregister());
const origin = "https://platform.example.org";
const request = (order: unknown, version: string | null = null, source = origin) => new Request(origin + "/api/admin/dashboard-layout", {
  method: "POST", headers: { origin: source }, body: JSON.stringify({ order, version }),
});
test("layout read and writes require admin and same-origin writes", async () => {
  const { GET, POST } = await route;
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await GET()).status, 403); assert.equal((await POST(request(DEFAULT_CARD_ORDER))).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin-a" } });
  assert.equal((await POST(request(DEFAULT_CARD_ORDER, null, "https://other.example.org"))).status, 403);
  assert.equal((await POST(request(["symposium"]))).status, 400);
  assert.equal(row, null);
});
test("order is global: one admin saves and another reads the same order", async () => {
  const { GET, POST } = await route;
  const first = await GET(); assert.equal(first.headers.get("cache-control"), "no-store");
  assert.deepEqual(await first.json(), { order: DEFAULT_CARD_ORDER, version: null });
  const order = [...DEFAULT_CARD_ORDER].reverse();
  const saved = await POST(request(order)); assert.equal(saved.status, 200);
  const layout = (await saved.json()).layout;
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin-b" } });
  assert.deepEqual(await (await GET()).json(), layout);
  assert.deepEqual(layout.order, order);
});
test("stale versions and simultaneous first saves return the current order, not lost updates", async () => {
  const { GET, POST } = await route;
  const current = await (await GET()).json();
  const conflict = await POST(request(DEFAULT_CARD_ORDER));
  assert.equal(conflict.status, 409); assert.deepEqual((await conflict.json()).layout, current);
  race = true;
  assert.equal((await POST(request(DEFAULT_CARD_ORDER, current.version))).status, 409);
  assert.deepEqual(await (await GET()).json(), current);
  race = false;
  const saved = await POST(request(DEFAULT_CARD_ORDER, current.version));
  assert.equal(saved.status, 200);
  assert.notEqual((await saved.json()).layout.version, current.version);
});
test("unavailable storage or corrupt settings never enable an authoritative default overwrite", async () => {
  const { GET, POST } = await route;
  const before = row!;
  fail = true;
  assert.equal((await GET()).status, 503);
  assert.equal((await POST(request(DEFAULT_CARD_ORDER, before.updatedAt.toISOString()))).status, 503);
  fail = false; assert.equal(row, before);
  row = { value: "{broken", updatedAt: new Date() };
  assert.equal((await GET()).status, 503);
});
