/** Which of a person's choices overlap: joined in the expanded view, and offered for declining together. */
import test from "node:test";
import assert from "node:assert/strict";
import { clashGroups } from "../../src/lib/allocation/clash-groups";

const seat = (h: number, len: number, status = "pending") => ({ status, start: new Date(Date.UTC(2026, 9, 26, h)).toISOString(), end: new Date(Date.UTC(2026, 9, 26, h + len)).toISOString() });

test("overlapping live choices form a group; back-to-back and declined ones do not", () => {
  assert.deepEqual(clashGroups([seat(15, 2), seat(19, 2), seat(16, 2)]), [[0, 2]]);
  assert.deepEqual(clashGroups([seat(15, 2), seat(17, 2)]), [], "touching end to start is not an overlap");
  assert.deepEqual(clashGroups([seat(15, 2), seat(16, 2, "cancelled")]), [], "a declined choice no longer clashes");
  assert.deepEqual(clashGroups([seat(15, 2), seat(16, 2), seat(17, 2), seat(22, 1)]), [[0, 1, 2]], "a chain is one cluster");
  assert.deepEqual(clashGroups([{ status: "pending" }, { status: "pending" }]), [], "no times, nothing to join");
});
