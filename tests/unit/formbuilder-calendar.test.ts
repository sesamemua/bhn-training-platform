import test from "node:test";
import assert from "node:assert/strict";
import { chosenClashes, clashes, packDay, packWeek, type Slot } from "../../src/lib/formbuilder/calendar";

const s = (option: string, day: string, start: string, end: string): Slot => ({ option, day, start, end });

test("two sessions in the same hour on the same day clash", () => {
  assert.equal(clashes(s("a", "2026-10-27", "13:00", "16:00"), s("b", "2026-10-27", "13:00", "16:00")), true);
  assert.equal(clashes(s("a", "2026-10-27", "13:00", "16:00"), s("b", "2026-10-27", "15:00", "17:00")), true);
});

test("the same hour on a different day does not clash", () => {
  assert.equal(clashes(s("a", "2026-10-26", "13:00", "16:00"), s("b", "2026-10-27", "13:00", "16:00")), false);
});

test("end-to-start is consecutive, not concurrent", () => {
  // A tour finishing at noon and a workshop starting at noon can both
  // be attended; drawing them as a clash would be a lie.
  assert.equal(clashes(s("a", "2026-10-26", "09:00", "12:00"), s("b", "2026-10-26", "12:00", "14:00")), false);
});

test("clashing sessions get separate lanes, consecutive ones reuse a lane", () => {
  const packed = packDay([
    s("cl3", "2026-10-26", "09:00", "12:00"),
    s("ccrm", "2026-10-26", "11:00", "14:00"),
    s("later", "2026-10-26", "15:00", "16:00"),
  ]);
  const lane = (o: string) => packed.find((p) => p.option === o)!.lane;
  assert.notEqual(lane("cl3"), lane("ccrm"), "these two overlap");
  assert.equal(lane("later"), 0, "nothing overlaps it, so it takes the first lane back");
});

test("a lone session is drawn full width even if the morning was busy", () => {
  const packed = packDay([
    s("a", "2026-10-26", "09:00", "12:00"),
    s("b", "2026-10-26", "09:00", "12:00"),
    s("solo", "2026-10-26", "15:00", "16:00"),
  ]);
  assert.equal(packed.find((p) => p.option === "solo")!.lanes, 1);
  assert.equal(packed.find((p) => p.option === "a")!.lanes, 2);
});

test("days come back in date order", () => {
  const week = packWeek([
    s("c", "2026-10-28", "09:00", "10:00"),
    s("a", "2026-10-26", "09:00", "10:00"),
    s("b", "2026-10-27", "09:00", "10:00"),
  ]);
  assert.deepEqual(week.map((d) => d.day), ["2026-10-26", "2026-10-27", "2026-10-28"]);
});

test("picking two concurrent sessions is reported, so the form can warn", () => {
  const slots = [
    s("chameleon", "2026-10-27", "13:00", "16:00"),
    s("negotiation", "2026-10-27", "13:00", "16:00"),
    s("showcase", "2026-10-28", "09:00", "16:00"),
  ];
  assert.deepEqual(chosenClashes(slots, ["chameleon", "negotiation"]), [["chameleon", "negotiation"]]);
  assert.deepEqual(chosenClashes(slots, ["chameleon", "showcase"]), []);
  assert.deepEqual(chosenClashes(slots, ["chameleon"]), []);
});

test("packing is stable — the same slots give the same lanes twice", () => {
  const slots = [
    s("b", "2026-10-26", "09:00", "12:00"),
    s("a", "2026-10-26", "09:00", "12:00"),
  ];
  const one = packDay(slots).map((p) => `${p.option}:${p.lane}`);
  const two = packDay([...slots].reverse()).map((p) => `${p.option}:${p.lane}`);
  assert.deepEqual(one.sort(), two.sort());
});
