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
  ])).items;
  assert.equal(merged[0].checked, true);
  assert.equal(merged[1].removed, true);
  assert.equal(merged.at(-1)?.label, "Stapler");
  assert.equal(merged.length, DEFAULT_KIT.length + 1);
  assert.equal(mergeKit("junk").items.length, DEFAULT_KIT.length);
});

test("the starting list keeps what was asked for, and marks suggestions", () => {
  assert.ok(DEFAULT_KIT.some((i) => i.label === "Lint roller" && !i.suggested));
  assert.ok(DEFAULT_KIT.some((i) => i.label.startsWith("Release forms") && i.suggested));
  assert.equal(new Set(DEFAULT_KIT.map((i) => i.id)).size, DEFAULT_KIT.length);
});

test("owners: the new shape keeps who brings what; the old shape gets the default people", () => {
  const first = DEFAULT_KIT[0];
  const state = mergeKit(JSON.stringify({ items: [{ ...first, owner: "Alison" }], owners: ["Alison", "Ruilin", "Darek"] }));
  assert.deepEqual(state.owners, ["Alison", "Ruilin", "Darek", "Roshni", "Yoo Jin", "Epshita", "Yeseul"], "people added since join once");
  assert.equal(state.items[0].owner, "Alison");
  assert.deepEqual(mergeKit(JSON.stringify([first])).owners, ["Alison", "Ruilin", "Roshni", "Yoo Jin", "Epshita", "Yeseul"]);
  // Removed after they joined: they stay removed.
  assert.deepEqual(mergeKit(JSON.stringify({ items: [], owners: ["Alison"], v: 2 })).owners, ["Alison"]);
});

test("asked-for items start with the person doing them", () => {
  const items = mergeKit(null).items;
  assert.equal(items.find((i) => i.label === "Print the signs and put them up")?.owner, "Roshni");
  assert.deepEqual(items.filter((i) => i.owner === "Alison").map((i) => i.label), ["Lunch", "Coffee — morning, and a second box with lunch", "Snacks"]);
  assert.equal(items.filter((i) => i.label === "Snacks").length, 1);
});
