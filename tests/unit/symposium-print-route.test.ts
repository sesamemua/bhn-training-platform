import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node loader hooks precede this project's Node typings.
import { registerHooks } from "node:module";
import { NextRequest } from "next/server";

const globals = globalThis as unknown as { peopleActor: unknown; printCalls: unknown[]; printConflict: boolean; printPdf: unknown };
globals.peopleActor = null; globals.printCalls = []; globals.printConflict = false; globals.printPdf = null;
const auth = new URL("../fixtures/people-route-auth.cjs", import.meta.url).href;
const store = new URL("../fixtures/print-route-store.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: auth, shortCircuit: true };
  if (specifier === "@/lib/events/print-store") return { url: store, shortCircuit: true };
  return next(specifier, context);
} });
const routes = Promise.all([import("../../src/app/api/admin/symposium-print/route"), import("../../src/app/api/admin/symposium-print/[id]/pdf/route")]).finally(() => hooks.deregister());
const request = (body: unknown, origin = "https://platform.example.org", contentLength?: string) => new NextRequest("https://platform.example.org/api/admin/symposium-print", { method: "POST", headers: { origin, "Content-Type": "application/json", ...(contentLength ? { "content-length": contentLength } : {}) }, body: JSON.stringify(body) });
const id = "00000000-0000-4000-8000-000000000001";

test("roster, mutations and stored PDFs are admin-only before any data access", async () => {
  const [route, pdf] = await routes;
  assert.equal((await route.GET()).status, 403);
  assert.equal((await route.POST(request({ version: null, change: { action: "sync" } }))).status, 403);
  assert.equal((await pdf.GET(new NextRequest("https://platform.example.org"), { params: Promise.resolve({ id }) })).status, 403);
  assert.equal(globals.printCalls.length, 0);
});

test("cross-origin writes, oversized files and invalid actions are refused", async () => {
  const [route] = await routes; globals.peopleActor = { user: { name: "Admin", email: "admin@example.org" } };
  assert.equal((await route.POST(request({ version: null, change: { action: "sync" } }, "https://foreign.example.org"))).status, 403);
  assert.equal((await route.POST(request({}, undefined, "2800001"))).status, 413);
  assert.equal((await route.POST(request({ version: null, change: { action: "create", kind: "invalid" } }))).status, 400);
  assert.equal((await route.POST(request({ version: null, change: { action: "delete_everything" } }))).status, 400);
  assert.equal(globals.printCalls.length, 0);
});

test("mutations retain version and actor and surface a colleague's conflicting update", async () => {
  const [route] = await routes;
  let response = await route.POST(request({ version: null, change: { action: "sync" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(globals.printCalls.at(-1), { version: null, change: { action: "sync" }, actor: "Admin" });
  globals.printConflict = true;
  response = await route.POST(request({ version: null, change: { action: "sync" } }));
  assert.equal(response.status, 409);
  assert.ok((await response.json()).snapshot);
});

test("PDF download is private, does not confirm printing and rejects unknown artifact IDs", async () => {
  const [, route] = await routes;
  globals.printCalls = [];
  const req = new NextRequest("https://platform.example.org");
  assert.equal((await route.GET(req, { params: Promise.resolve({ id: "../secret" }) })).status, 404);
  assert.equal((await route.GET(req, { params: Promise.resolve({ id }) })).status, 404);
  globals.printPdf = { job: { label: "Batch 1" }, bytes: Buffer.from("%PDF-1.7\n") };
  const response = await route.GET(req, { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.match(response.headers.get("Content-Disposition")!, /attachment/);
  assert.equal(globals.printCalls.length, 0);
});
