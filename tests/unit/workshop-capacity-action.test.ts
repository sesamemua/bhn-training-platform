import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime hooks are newer than the repository Node types.
import { registerHooks } from "node:module";

const paths: string[] = [];
const writes: unknown[] = [];
Reflect.set(globalThis, "workshopRevalidated", paths);
Reflect.set(globalThis, "prisma", {
  workshopBooking: { count: async () => 2 },
  workshop: { update: async (data: unknown) => { writes.push(data); } },
});
const hooks = registerHooks({ resolve(specifier, context, next) {
  return ["@/lib/auth", "next/cache", "server-only"].includes(specifier)
    ? { url: new URL("../fixtures/workshop-registration.cjs", import.meta.url).href, shortCircuit: true }
    : next(specifier, context);
} });
const action = import("../../src/app/(dashboard)/admin/workspace/training-admin/actions").finally(() => hooks.deregister());

test("capacity edits reuse admin validation, preserve confirmed seats and refresh both dashboards", async () => {
  const { updateWorkshop } = await action;
  Reflect.set(globalThis, "workshopAdmin", false);
  await assert.rejects(updateWorkshop("room", { capacity: 20 }), /Forbidden/);
  assert.equal(writes.length, 0);
  Reflect.set(globalThis, "workshopAdmin", true);
  for (const capacity of [-1, NaN, 1001, 1]) {
    assert.equal((await updateWorkshop("room", { capacity })).ok, false);
  }
  assert.equal(writes.length, 0);
  assert.equal(paths.length, 0);
  assert.equal((await updateWorkshop("room", { capacity: 12 })).ok, true);
  assert.deepEqual(writes, [{ where: { id: "room" }, data: { capacity: 12 } }]);
  assert.ok(paths.includes("/dashboard"));
  assert.ok(paths.includes("/admin/workspace/training-admin"));
});
