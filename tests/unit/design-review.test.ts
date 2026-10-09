/** Design review: who has seen / OK'd an artwork, which pages are accepted, and where a pin may sit. */
import test from "node:test";
import assert from "node:assert/strict";
import { PinInput, PagesSchema, QuestionInput, designBrief, givenNames, initials, isReviewer, isWide, optionsFromText, isApproval, pagesOf, reviewerStates } from "../../src/lib/design-review/types";

const page = { key: "design-review/a.jpg", url: "https://cdn.example.com/design-review/a.jpg", w: 3200, h: 828 };

test("each reviewer rolls up to not yet / seen / OK", () => {
  const people = [{ id: "a", name: "Yoo Jin Park" }, { id: "b", name: "Alison Stirling" }, { id: "c", name: "Roshni Christo" }];
  const states = reviewerStates(people, [
    { userId: "a", viewedAt: new Date(), okAt: new Date() },
    { userId: "b", viewedAt: new Date(), okAt: null },
    { userId: "c", viewedAt: null, okAt: null, requestedAt: new Date() },
    { userId: "gone", viewedAt: new Date(), okAt: new Date() },
  ]);
  assert.deepEqual(states.map((s) => s.state), ["ok", "viewed", "none"]);
  assert.deepEqual(states.map((s) => s.asked), [false, false, true]);
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

test("the copied feedback lists open comments only, numbered as on the artwork, with replies", () => {
  const pin = (id: string, body: string, status: string, at: string, parentId: string | null = null) =>
    ({ id, parentId, page: 0, x: 0.25, y: 0.5, authorName: "Alison", body, status, createdAt: at });
  const text = designBrief({
    project: "2026 Annual Symposium", title: "Stand-up banners", round: 2, pages: 1,
    pins: [pin("a", "Old point", "resolved", "1"), pin("b", "Move the logo up", "open", "2"), pin("r", "Agreed", "open", "3", "b")],
  });
  assert.match(text, /^2026 Annual Symposium — Stand-up banners\nDesign feedback, round 2: 1 open comment\n/);
  assert.match(text, /2\. \(25% from the left, 50% from the top\) Alison: Move the logo up\n   ↳ Alison: Agreed/);
  assert.doesNotMatch(text, /Old point/);
});

test("short names, the review team, and which artworks get the full width", () => {
  assert.equal(givenNames("Yoo Jin Park"), "Yoo Jin");
  assert.equal(givenNames("Epshita"), "Epshita");
  assert.equal(isReviewer("Meenakshi Venkatesan"), false);
  assert.equal(isReviewer("Alison Stirling"), true);
  assert.equal(isWide({ w: 3600, h: 932 }), true); // the one-pagers
  assert.equal(isWide({ w: 3600, h: 2182 }), false); // the banners
});

test("a question's choices come from one typed line; a question needs wording", () => {
  assert.deepEqual(optionsFromText("Brass, White metal ,, brass , Brass"), ["Brass", "White metal", "brass"]);
  assert.deepEqual(optionsFromText("Brass (black/white print)\nWhite metal"), ["Brass (black/white print)", "White metal"], "a slash stays inside a choice");
  assert.deepEqual(optionsFromText("  "), []);
  assert.equal(QuestionInput.safeParse({ text: " Who gets a tag? " }).success, true);
  assert.equal(QuestionInput.safeParse({ text: "  ", options: ["Yes"] }).success, false);
});
