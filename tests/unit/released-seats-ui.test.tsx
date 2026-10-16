import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
const emptyMarker = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only" ? { url: emptyMarker, shortCircuit: true } : next(specifier, context);
} });
let empty = false;
let failed = false;
Reflect.set(globalThis, "prisma", { workshopBooking: {
  findMany: async () => {
    if (failed) throw new Error("Offline");
    return empty ? [] : [{ id: "booking", withdrawnAt: new Date("2026-10-12T12:00:00Z"), user: { name: "Example Person" }, submission: null, workshop: { id: "w", title: "Workshop", capacity: 12 } }];
  },
  groupBy: async () => [{ workshopId: "w", _count: { _all: 10 } }],
} });
const component = import("../../src/components/training-week/ReleasedSeats").finally(() => hooks.deregister());
test("released-seat actions stack below a readable heading on mobile", async () => {
  const { ReleasedSeats } = await component;
  const html = renderToStaticMarkup(await ReleasedSeats({ framed: true, showEmpty: true }));
  assert.match(html, /grid-cols-\[2rem_minmax\(0,1fr\)\]/);
  assert.match(html, /col-span-2 inline-flex/);
  assert.match(html, /sm:col-span-1/);
  assert.match(html, /1 seat released/);
  assert.match(html, /href="\/admin\/workspace\/training-admin"/, "the button goes to the Training Week dashboard");
  assert.match(html, /2 seats free in this session/);
  assert.match(html, /Example Person/);
});
test("homepage keeps an empty slot while Training Week keeps its previous hidden-empty behavior", async () => {
  const { ReleasedSeats } = await component;
  empty = true;
  assert.equal(await ReleasedSeats({}), null);
  assert.match(renderToStaticMarkup(await ReleasedSeats({ framed: true, showEmpty: true })), /No recently released seats/);
  failed = true;
  assert.equal(await ReleasedSeats({}), null);
  assert.match(renderToStaticMarkup(await ReleasedSeats({ framed: true, showEmpty: true })), /Couldn&#x27;t load released seats/);
});

test("only the last two days lead; older releases sit behind See all", async () => {
  const { ReleasedSeats } = await component;
  empty = false; failed = false;
  const html = renderToStaticMarkup(await ReleasedSeats({ framed: true }));
  // The fixture's release is days old: not in the headline, but in the full list.
  assert.match(html, /No seats released in the last 2 days/);
  assert.match(html, /<details[^>]*><summary[^>]*>See all 1 seat released in the last three weeks/);
  assert.match(html, /Example Person/);
});
