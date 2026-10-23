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
const params = (id = "cmtestworkshop123", sort?: string | string[]) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ sort }) });

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

test("reads only this workshop's approved non-withdrawn bookings, newest first for identity matching, without writes", async () => {
  const { default: render, dynamic, metadata } = await page;
  globals.signInQueries = [];
  globals.signInWorkshop = { title: "Workshop", bookings: [] };
  const result = await render(params());
  assert.ok(result);
  assert.deepEqual(globals.signInQueries, [{
    where: { id: "cmtestworkshop123" },
    select: {
      title: true, startDateTime: true, endDateTime: true, locationName: true,
      bookings: { where: { status: "confirmed", withdrawnAt: null }, orderBy: { bookedAt: "desc" }, select: {
        id: true, submissionId: true, userId: true,
        status: true, withdrawnAt: true, submission: { select: { data: true, email: true } }, user: { select: { name: true, email: true } },
      } },
    },
  }]);
  assert.equal(dynamic, "force-dynamic");
  assert.equal(metadata.robots.index, false);
});

test("sort choice reaches the sheet, and unrecognised or repeated query values safely default to first name", async () => {
  const { default: render } = await page;
  for (const [input, expected] of [["last", "last"], ["first", "first"], ["invalid", "first"], [["last", "first"], "first"]] as const) {
    const result = await render(params(undefined, Array.isArray(input) ? [...input] : input as string));
    assert.equal(result.props.sortBy, expected);
  }
});
