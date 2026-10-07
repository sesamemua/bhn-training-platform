import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
// @ts-expect-error registerHooks is available in Node 22.15+, ahead of this repo's Node types.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

const unexpected = async () => { throw new Error("Unexpected database call in seat suggestion test"); };
const prisma = {
  platformSetting: { findUnique: unexpected }, user: { findMany: unexpected },
  eligibilityEntry: { count: unexpected, findMany: unexpected }, workshop: { findMany: unexpected },
  $transaction: unexpected,
} as unknown as PrismaClient;
Reflect.set(globalThis, "prisma", prisma);

// Next's marker has no runtime work outside the Next compiler.
const emptyMarker = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only" ? { url: emptyMarker, shortCircuit: true } : next(specifier, context);
} });
const server = import("../../src/lib/allocation/seat-suggestions-server").finally(() => hooks.deregister());

const row = (id: string, workshopId: string, email: string, status = "pending", rank = 1) => ({
  id, status, rank, notifiedStatus: "pending", bookedAt: new Date("2026-09-01T10:00:00Z"), withdrawnAt: null as Date | null,
  userId: null, submissionId: `submission-${id}`, user: null,
  submission: { data: {}, email, createdAt: new Date("2026-09-01T10:00:00Z"), form: { slug: "training-week" } },
  workshop: { id: workshopId, eventId: "week", title: workshopId, capacity: 1, isActive: true,
    startDateTime: new Date("2026-10-26T10:00:00Z"), endDateTime: new Date("2026-10-26T11:00:00Z") },
});

test("server rechecks overlap, capacity and withdrawn seats without writing or sending", async (t) => {
  const { writeSeatDecision } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  t.mock.method(prisma.user, "findMany", async () => []);
  let target = row("a", "A", "a@example.org");
  let held = [row("b", "B", "a@example.org", "confirmed")];
  let writes = 0;
  t.mock.method(prisma, "$transaction", async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    return callback({ workshopBooking: {
      findUnique: async () => target,
      findMany: async () => held,
      update: async () => { writes++; return target; },
    } });
  });
  assert.deepEqual(await writeSeatDecision("a", "confirmed", "admin"), { ok: false, problem: "Conflicts with B." });
  held = [row("b", "A", "b@example.org", "confirmed")];
  assert.deepEqual(await writeSeatDecision("a", "confirmed", "admin"), { ok: false, problem: "No seats remaining." });
  held = [];
  target = { ...target, withdrawnAt: new Date() };
  assert.equal((await writeSeatDecision("a", "confirmed", "admin")).ok, false);
  assert.equal(writes, 0);
});

test("an old Apply cannot waitlist a seat another coordinator confirmed", async (t) => {
  const { writeSeatDecision } = await server;
  const confirmed = row("a", "A", "a@example.org", "confirmed");
  let writes = 0;
  t.mock.method(prisma, "$transaction", async (callback) => callback({ workshopBooking: {
    findUnique: async () => confirmed, update: async () => { writes++; },
  } }));
  const result = await writeSeatDecision("a", "waitlist", "admin", undefined, ["pending"]);
  assert.equal(result.ok, false);
  assert.equal(writes, 0);
});

test("a valid approval stamps the decision inside the transaction", async (t) => {
  const { writeSeatDecision } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  t.mock.method(prisma.user, "findMany", async () => []);
  let written: Record<string, unknown> | undefined;
  t.mock.method(prisma, "$transaction", async (callback) => callback({ workshopBooking: {
    findUnique: async () => row("a", "A", "a@example.org"), findMany: async () => [],
    update: async ({ data }) => { written = data; },
  } }));
  assert.equal((await writeSeatDecision("a", "confirmed", "admin", "Reviewed")).ok, true);
  assert.equal(written?.status, "confirmed");
  assert.equal(written?.approvedById, "admin");
  assert.ok(written?.approvedAt instanceof Date);
});

test("serialization conflicts return a retry instruction rather than claiming approval", async (t) => {
  const { writeSeatDecision } = await server;
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  t.mock.method(prisma.user, "findMany", async () => []);
  t.mock.method(prisma, "$transaction", async () => { throw Object.assign(new Error("write conflict"), { code: "P2034" }); });
  const result = await writeSeatDecision("a", "confirmed", "admin");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.problem, /Refresh and try again/);
});

test("server recomputes the whole week's ranking from current persisted choices", async (t) => {
  const { currentSeatSuggestions } = await server;
  const first = row("first", "A", "a@example.org", "pending", 1);
  const second = row("second", "B", "a@example.org", "pending", 2);
  t.mock.method(prisma.platformSetting, "findUnique", async () => null);
  t.mock.method(prisma.user, "findMany", async () => []);
  t.mock.method(prisma.eligibilityEntry, "count", async () => 0);
  t.mock.method(prisma.eligibilityEntry, "findMany", async () => []);
  t.mock.method(prisma.workshop, "findMany", async () => [
    { ...second.workshop, bookings: [second] }, { ...first.workshop, bookings: [first] },
  ]);
  const result = await currentSeatSuggestions("week");
  assert.equal(result.get("first")?.suggestion, "approve");
  assert.equal(result.get("second")?.suggestion, "waitlist");
});
