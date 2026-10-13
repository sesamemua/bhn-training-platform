import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
const authUrl = new URL("../fixtures/people-route-auth.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: authUrl, shortCircuit: true };
  return next(specifier, context);
} });
const route = import("../../src/app/api/admin/symposium-people/website-status/route").finally(() => hooks.deregister());
const snapshot = { schemaVersion: 1, eventId: "2026-annual-symposium", initialized: true, complete: true, revision: 31, people: [{ id: "person", fullName: "Liz", bio: "Not needed" }] };

test("website status is admin-only and reads only the fixed public website without forwarding credentials", async (t) => {
  const { GET } = await route;
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(url, "https://biohubnet.ca/wp-json/biohubnet/v1/approved-people");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.headers, undefined);
    assert.ok(options?.signal);
    return Response.json({ snapshot });
  });
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await GET()).status, 403); assert.equal(fetchMock.mock.callCount(), 0);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).people, [{ id: "person", fullName: "Liz" }]);
});
test("unavailable and invalid website responses are unknown, never an empty authoritative list", async (t) => {
  const { GET } = await route;
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  const mock = t.mock.method(globalThis, "fetch");
  for (const value of [new Response("offline", { status: 502 }), Response.json({ snapshot: { ...snapshot, complete: false } }), new Response("invalid")]) {
    mock.mock.mockImplementation(async () => value);
    const response = await GET(); assert.equal(response.status, 503);
    assert.equal((await response.json()).people, undefined);
  }
  mock.mock.mockImplementation(async () => { throw new Error("timeout"); });
  assert.equal((await GET()).status, 503);
});
