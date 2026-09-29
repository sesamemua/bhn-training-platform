/** Highlights read back safely and always carry a reason. */
import test from "node:test";
import assert from "node:assert/strict";
import { highlightProblem, highlightsOf, reusableReasons } from "../../src/lib/allocation/highlights";

test("highlights are read from the registration, and junk is dropped", () => {
  const data = {
    __highlights: [
      { id: "h1", byId: "u1", byName: "Ruilin Yuan", reason: "Sponsor's student", at: "2026-09-29T15:00:00Z" },
      { id: "h2", byId: null, byName: "Yeseul Lee", reason: "   ", at: "2026-09-29T15:01:00Z" }, // no reason is fine
      { id: "h3", byName: "No byId", reason: "x", at: "2026-09-29T15:02:00Z" }, // malformed
      "not a highlight",
    ],
  };
  const hs = highlightsOf(data);
  assert.deepEqual(hs.map((h) => h.byName), ["Ruilin Yuan", "Yeseul Lee"]);
  assert.equal(hs[1].reason, "");
  assert.deepEqual(highlightsOf({}), []);
  assert.deepEqual(highlightsOf(null), []);
});

test("a reason is optional, but short", () => {
  assert.equal(highlightProblem("  "), null);
  assert.equal(highlightProblem("Asked about step-free access"), null);
  assert.match(highlightProblem("x".repeat(301)) ?? "", /under 300/);
});

test("used reasons come back as pills, most used first, no blanks or repeats", () => {
  const h = (reason: string) => ({ id: reason, byId: null, byName: "A", reason, at: "" });
  assert.deepEqual(
    reusableReasons([h("VIP"), h(""), h("Sponsor's student"), h("vip"), h("Sponsor's student"), h("Sponsor's student")]),
    ["Sponsor's student", "VIP"],
  );
});
