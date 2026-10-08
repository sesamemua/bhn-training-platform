import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime hooks are newer than the repository Node types.
import { registerHooks } from "node:module";
import { SESSIONS } from "../../src/lib/training-week/schedule-2026";

let value = "{}";
let fail = false;
let writes = 0;
const paths: string[] = [];
Reflect.set(globalThis, "workshopRevalidated", paths);
Reflect.set(globalThis, "prisma", { $transaction: async (fn: (tx: unknown) => Promise<void>, options: { isolationLevel: string }) => {
  assert.equal(options.isolationLevel, "Serializable");
  if (fail) throw new Error("Concurrent change");
  return fn({ platformSetting: {
    findUnique: async () => ({ value }),
    upsert: async ({ update }: { update: { value: string } }) => { writes++; value = update.value; },
  } });
} });
const hooks = registerHooks({ resolve(specifier, context, next) {
  return ["@/lib/auth", "next/cache"].includes(specifier)
    ? { url: new URL("../fixtures/workshop-registration.cjs", import.meta.url).href, shortCircuit: true }
    : next(specifier, context);
} });
const action = import("../../src/lib/training-week/workshop-registration").finally(() => hooks.deregister());

test("row registration changes require admin, validate input, preserve other sessions and report write failures", async () => {
  const { saveWorkshopRegistration } = await action;
  const [a, b] = SESSIONS;
  Reflect.set(globalThis, "workshopAdmin", false);
  await assert.rejects(saveWorkshopRegistration(a.slug, "paused"), /Forbidden/);
  assert.equal(writes, 0);
  Reflect.set(globalThis, "workshopAdmin", true);
  assert.equal((await saveWorkshopRegistration("unknown", "open")).ok, false);
  assert.equal((await saveWorkshopRegistration(a.slug, "nonsense")).ok, false);
  assert.equal(writes, 0);
  const other = { state: "closed", message: "No more seats" };
  value = JSON.stringify({ [b.slug]: other });
  for (const state of ["paused", "closed", "open"]) {
    assert.equal((await saveWorkshopRegistration(a.slug, state)).ok, true);
    assert.deepEqual(JSON.parse(value)[b.slug], other);
    assert.deepEqual(JSON.parse(value)[a.slug], { state, message: "" });
  }
  assert.ok(paths.includes("/dashboard"));
  assert.ok(paths.includes("/apply/training-week-registration-2026-v2"));
  fail = true;
  const before = value;
  assert.equal((await saveWorkshopRegistration(a.slug, "paused")).ok, false);
  assert.equal(value, before);
});
