import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime hooks are newer than the repository Node types.
import { registerHooks } from "node:module";

const reads: Record<string, unknown>[] = [];
const post = { id: "post", body: "A workshop post", assetSpec: { title: "Workshop" }, status: "published", scheduledFor: new Date(), publishedAt: new Date(), bufferPostId: null, publishError: null };
Reflect.set(globalThis, "prisma", {
  equipDeadline: { findMany: async () => [] },
  socialPost: {
    findMany: async (query: Record<string, unknown>) => {
      reads.push(query);
      if (Reflect.get(globalThis, "socialDashboardFailure")) throw new Error("Database unavailable");
      return [post];
    },
    count: async (query: Record<string, unknown>) => { reads.push(query); return 4; },
  },
});
const hooks = registerHooks({ resolve(specifier, context, next) {
  return ["@/lib/auth", "@/lib/metrics/linkedin", "@/lib/metrics/ga4"].includes(specifier)
    ? { url: new URL("../fixtures/social-dashboard.cjs", import.meta.url).href, shortCircuit: true }
    : next(specifier, context);
} });
const route = import("../../src/app/api/admin/marketing-metrics/route").finally(() => hooks.deregister());

test("social brief is admin-only, uses bounded read-only queries and confirmed schedules", async () => {
  const { GET } = await route;
  Reflect.set(globalThis, "socialDashboardAdmin", false);
  assert.equal((await GET()).status, 403);
  assert.equal(reads.length, 0);
  Reflect.set(globalThis, "socialDashboardAdmin", true);
  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.social.scheduled.count, 4);
  assert.equal(body.social.next.due, 4);
  assert.equal(body.social.recent.reactions, null);
  const scheduled = reads.find(q => (q.where as { status?: string }).status === "scheduled")!;
  assert.deepEqual((scheduled.where as { bufferPostId: unknown }).bufferPostId, { not: null });
  for (const read of reads.filter(r => "select" in r)) assert.equal(read.take, 2);
  const next = reads.find(q => Array.isArray((q.where as { OR?: unknown }).OR))!;
  assert.match(JSON.stringify(next.where), /venture_connect/);
  assert.match(JSON.stringify(next.where), /recipients/);
  assert.ok("linkedin" in body && "site" in body, "Existing API fields remain compatible");
});

test("queue failure leaves available social metrics usable without fabricated schedule counts", async () => {
  Reflect.set(globalThis, "socialDashboardAdmin", true);
  Reflect.set(globalThis, "socialDashboardFailure", true);
  const body = await (await (await route).GET()).json();
  assert.equal(body.social.scheduled.count, null);
  assert.equal(body.social.next.due, null);
  assert.equal(body.social.recent.count, 0);
});
