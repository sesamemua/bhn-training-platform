/** Highlights read back safely and always carry a reason. */
import test from "node:test";
import assert from "node:assert/strict";
import { highlightProblem, highlightsOf } from "../../src/lib/allocation/highlights";

test("highlights are read from the registration, and junk is dropped", () => {
  const data = {
    __highlights: [
      { id: "h1", byId: "u1", byName: "Ruilin Yuan", reason: "Sponsor's student", at: "2026-09-29T15:00:00Z" },
      { id: "h2", byId: null, byName: "Yeseul Lee", reason: "   ", at: "2026-09-29T15:01:00Z" }, // no reason
      "not a highlight",
    ],
  };
  const hs = highlightsOf(data);
  assert.deepEqual(hs.map((h) => h.byName), ["Ruilin Yuan"]);
  assert.deepEqual(highlightsOf({}), []);
  assert.deepEqual(highlightsOf(null), []);
});

test("a highlight needs a reason, and a short one", () => {
  assert.match(highlightProblem("  ") ?? "", /Say why/);
  assert.equal(highlightProblem("Asked about step-free access"), null);
  assert.match(highlightProblem("x".repeat(301)) ?? "", /under 300/);
});
