import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node loader hooks precede this project's Node typings.
import { registerHooks } from "node:module";

const globals = globalThis as unknown as { peopleActor: unknown; signInQueries: unknown[]; signInWorkshop: unknown };
globals.peopleActor = null; globals.signInQueries = []; globals.signInWorkshop = null;
const auth = new URL("../fixtures/people-route-auth.cjs", import.meta.url).href;
const db = new URL("../fixtures/workshop-sign-in-prisma.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: auth, shortCircuit: true };
  if (specifier === "@/lib/prisma") return { url: db, shortCircuit: true };
  return next(specifier, context);
} });
const page = import("../../src/app/training-week/sign-in/[id]/page").finally(() => hooks.deregister());
const params = (id = "cmtestworkshop123") => ({ params: Promise.resolve({ id }) });

test("sign-in sheet requires admin before reading workshop or attendee data", async () => {
  const { default: render } = await page;
  await assert.rejects(render(params()), /NEXT_REDIRECT/);
  assert.equal(globals.signInQueries.length, 0);
});

test("invalid and missing workshops return not found, never a blank unscoped roster", async () => {
  const { default: render } = await page;
  globals.peopleActor = { user: { role: "admin" } };
  await assert.rejects(render(params("../secret")), /404/);
  assert.equal(globals.signInQueries.length, 0);
  await assert.rejects(render(params()), /404/);
});

test("reads only this workshop's approved non-withdrawn bookings, never writes or selects contact details", async () => {
  const { default: render, dynamic, metadata } = await page;
  globals.signInQueries = [];
  globals.signInWorkshop = { title: "Workshop", bookings: [] };
  const result = await render(params());
  assert.ok(result);
  assert.deepEqual(globals.signInQueries, [{
    where: { id: "cmtestworkshop123" },
    select: {
      title: true, startDateTime: true, endDateTime: true, locationName: true,
      bookings: { where: { status: "confirmed", withdrawnAt: null }, select: {
        status: true, withdrawnAt: true, submission: { select: { data: true } }, user: { select: { name: true } },
      } },
    },
  }]);
  assert.equal(dynamic, "force-dynamic");
  assert.equal(metadata.robots.index, false);
});
