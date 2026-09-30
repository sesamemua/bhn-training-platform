/** The kit list: starting items with saved ticks, removals and additions laid over them. */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_KIT, mergeKit } from "../../src/lib/video/kit";

test("saved state is laid over the starting list, and custom items follow", () => {
  const first = DEFAULT_KIT[0];
  const merged = mergeKit(JSON.stringify([
    { ...first, checked: true },
    { ...DEFAULT_KIT[1], removed: true },
    { id: "c1", group: "Paper & printing", label: "Stapler", checked: false, custom: true },
    { id: "", group: "", label: "", checked: false, custom: true },
  ]));
  assert.equal(merged[0].checked, true);
  assert.equal(merged[1].removed, true);
  assert.equal(merged.at(-1)?.label, "Stapler");
  assert.equal(merged.length, DEFAULT_KIT.length + 1);
  assert.equal(mergeKit("junk").length, DEFAULT_KIT.length);
});

test("the starting list keeps what was asked for, and marks suggestions", () => {
  assert.ok(DEFAULT_KIT.some((i) => i.label === "Lint roller" && !i.suggested));
  assert.ok(DEFAULT_KIT.some((i) => i.label.startsWith("Release forms") && i.suggested));
  assert.equal(new Set(DEFAULT_KIT.map((i) => i.id)).size, DEFAULT_KIT.length);
});
