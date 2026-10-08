/** Design review: who has seen / OK'd an artwork, which pages are accepted, and where a pin may sit. */
import test from "node:test";
import assert from "node:assert/strict";
import { PinInput, PagesSchema, initials, isApproval, pagesOf, reviewerStates } from "../../src/lib/design-review/types";

const page = { key: "design-review/a.jpg", url: "https://cdn.example.com/design-review/a.jpg", w: 3200, h: 828 };

test("each reviewer rolls up to not yet / seen / OK", () => {
  const people = [{ id: "a", name: "Yoo Jin Park" }, { id: "b", name: "Alison Stirling" }, { id: "c", name: "Roshni Christo" }];
  const states = reviewerStates(people, [
    { userId: "a", viewedAt: new Date(), okAt: new Date() },
    { userId: "b", viewedAt: new Date(), okAt: null },
    { userId: "gone", viewedAt: new Date(), okAt: new Date() },
  ]);
  assert.deepEqual(states.map((s) => s.state), ["ok", "viewed", "none"]);
});

test("only pages stored under the design-review prefix are accepted", () => {
  assert.equal(PagesSchema.safeParse([page]).success, true);
  assert.equal(PagesSchema.safeParse([{ ...page, key: "showcase/a.jpg" }]).success, false);
  assert.equal(PagesSchema.safeParse([]).success, false);
  assert.deepEqual(pagesOf("nonsense"), []);
  assert.equal(pagesOf([page]).length, 1);
});

test("a pin stays on the picture and an empty comment is refused", () => {
  assert.equal(PinInput.safeParse({ page: 0, x: 0.5, y: 1, body: " Move the logo " }).success, true);
  assert.equal(PinInput.safeParse({ page: 0, x: 1.2, y: 0.5, body: "x" }).success, false);
  assert.equal(PinInput.safeParse({ page: 0, x: 0.5, y: 0.5, body: "   " }).success, false);
});

test("approval states and initials", () => {
  assert.equal(isApproval("approved"), true);
  assert.equal(isApproval("maybe"), false);
  assert.equal(initials("Yoo Jin Park"), "YJ");
});
