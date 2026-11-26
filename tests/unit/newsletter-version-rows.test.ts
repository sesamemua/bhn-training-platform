import assert from "node:assert/strict";
import test from "node:test";
import { inlineEditRounds, versionRows } from "../../src/lib/page-review/inline-edit-versions";

test("history lists saves and collapses runs of inline-edit autosaves into one row", () => {
  const archived = new Map([1, 2, 3, 4, 5, 6].map((r) => [r, `2026-11-2${r}T12:00:00.000Z`]));
  // Saves made v1–v3; autosaves made v4, v5, v6; an explicit save made v7 (current).
  const inline = inlineEditRounds([`{"round":3,"nextRound":4,"edits":[]}`, `{"round":4,"nextRound":5,"edits":[]}`, `{"round":5,"nextRound":6,"edits":[]}`, null]);
  assert.deepEqual([...inline].sort(), [4, 5, 6]);
  const rows = versionRows(archived, 7, "2026-11-20T09:00:00.000Z", inline);
  assert.deepEqual(rows.map((r) => r.round), [1, 2, 3, 6, 7]);
  assert.deepEqual(rows[3], { round: 6, savedAt: "2026-11-25T12:00:00.000Z", autosaves: 3, fromRound: 4 });
  assert.equal(rows[0].savedAt, "2026-11-20T09:00:00.000Z", "Version 1 dates from the review itself");
  assert.equal(rows[4].savedAt, "2026-11-26T12:00:00.000Z", "a version is dated when its predecessor was archived");
});
