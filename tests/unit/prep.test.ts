/** The prep day: starting tasks assigned by name, saved state kept, custom tasks added. */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREP, mergePrep } from "../../src/lib/video/prep";

const PEOPLE = [{ id: "fp_ruilin", name: "Ruilin" }, { id: "fp_alison", name: "Alison" }];

test("starting tasks go to people by name; nobody when nobody matches", () => {
  const tasks = mergePrep(null, PEOPLE);
  assert.deepEqual(tasks.find((t) => t.id === "prep-gear")?.people, ["fp_ruilin"]);
  assert.deepEqual(tasks.find((t) => t.id === "prep-dietary")?.people, []);
  assert.ok((tasks.find((t) => t.id === "prep-gear")?.items.length ?? 0) >= 14);
});

test("saved state wins, custom tasks follow, junk is dropped", () => {
  const gear = mergePrep(null, PEOPLE).find((t) => t.id === "prep-gear")!;
  const tasks = mergePrep(JSON.stringify([
    { ...gear, done: true, people: ["fp_alison"] },
    { id: "c1", title: "Charge the batteries", people: [], done: false, custom: true },
    { id: "", title: "" },
  ]), PEOPLE);
  const g = tasks.find((t) => t.id === "prep-gear")!;
  assert.equal(g.done, true);
  assert.deepEqual(g.people, ["fp_alison"]);
  assert.equal(tasks.at(-1)?.title, "Charge the batteries");
  assert.equal(tasks.length, DEFAULT_PREP.length + 1);
});

test("the starting prep tasks pass the save's own check", async () => {
  const { PrepSchema } = await import("../../src/lib/video/prep");
  const r = PrepSchema.safeParse(mergePrep(null, [{ id: "fp_ruilin", name: "Ruilin" }]));
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues[0]));
});

test("before the shoot: the team's tasks with their owners and dates; suggestions marked; saves", async () => {
  const { DEFAULT_PRESHOOT, PrepSchema } = await import("../../src/lib/video/prep");
  const people = [{ id: "r", name: "Ruilin" }, { id: "e", name: "Epshita" }];
  const tasks = mergePrep(null, people, DEFAULT_PRESHOOT);
  assert.deepEqual(tasks.find((t) => t.id === "pre-insurance")?.people, ["r"]);
  assert.deepEqual(tasks.find((t) => t.id === "pre-script-engage")?.people, ["e"]);
  assert.equal(tasks.find((t) => t.id === "pre-permit")?.suggested, true);
  assert.equal(tasks.find((t) => t.id === "pre-rental-form")?.due, "2026-10-01");
  assert.ok(PrepSchema.safeParse(tasks).success);
});
