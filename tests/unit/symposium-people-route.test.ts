import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node 22.15+ loader hooks precede the repo's Node typings.
import { registerHooks } from "node:module";
import { NextRequest } from "next/server";

const globals = globalThis as unknown as { peopleActor: unknown; peopleAi: unknown };
globals.peopleActor = null;
globals.peopleAi = { ok: false, error: "unavailable" };
const authUrl = new URL("../fixtures/people-route-auth.cjs", import.meta.url).href;
const aiUrl = new URL("../fixtures/people-route-ai.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: authUrl, shortCircuit: true };
  if (specifier === "@/lib/ai/reliability") return { url: aiUrl, shortCircuit: true };
  return next(specifier, context);
} });
const route = import("../../src/app/api/admin/symposium-people/route").finally(() => hooks.deregister());
const request = (body: unknown, origin = "https://platform.example.org") => new NextRequest("https://platform.example.org/api/admin/symposium-people", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });

test("board reading and all mutations require admin access before data or AI calls", async () => {
  const { GET, POST } = await route;
  globals.peopleActor = null;
  assert.equal((await GET()).status, 403);
  assert.equal((await POST(request({ action: "parse", text: "Jane Smith" }))).status, 403);
});

test("cross-origin writes and oversized or malformed input are refused", async () => {
  const { POST } = await route;
  globals.peopleActor = { user: { id: "admin" } };
  assert.equal((await POST(request({ action: "parse", text: "Jane Smith" }, "https://foreign.example.org"))).status, 403);
  assert.equal((await POST(request({ action: "parse", text: "x".repeat(1_200_001) }))).status, 413);
  assert.equal((await POST(request({ change: { action: "assign", session: "not-a-session" }, version: null }))).status, 400);
});

test("structured paste does not need AI or save any profiles", async () => {
  const { POST } = await route;
  const result = await POST(request({ action: "parse", text: "Name\tCompany\tBio\nJane Smith\tAcme\tOriginal text" }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).people[0].bio, "Original text");
});

test("freeform failures are visible and fabricated identities are rejected", async () => {
  const { POST } = await route;
  globals.peopleAi = { ok: false, error: "unavailable" };
  assert.equal((await POST(request({ action: "parse", text: "Jane Smith at Acme" }))).status, 502);
  globals.peopleAi = { ok: true, data: { people: [{ fullName: "Invented Person", email: "" }], warnings: [] } };
  assert.equal((await POST(request({ action: "parse", text: "Jane Smith at Acme" }))).status, 422);
  globals.peopleAi = { ok: true, data: { people: [{ fullName: "Jane Smith", email: "" }], warnings: [] } };
  assert.equal((await POST(request({ action: "parse", text: "Jane Smith at Acme" }))).status, 200);
});
