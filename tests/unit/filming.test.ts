/** The filming day's checks: one camera, nobody in two places, building hours, nobody on a task. */
import test from "node:test";
import assert from "node:assert/strict";
import { atMinute, issues, minuteOfDay, type Block, type Person } from "../../src/lib/video/filming";

// Tuesday 6 October 2026: Toronto is UTC-4.
const DAY = { date: "2026-10-06", opensAt: "08:30", closesAt: "17:00" };
const at = (hhmm: string) => atMinute(DAY.date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const blk = (id: string, kind: string, from: string, to: string, people: string[], o: Partial<Block> = {}): Block => ({
  id, kind, title: id, notes: "", start: at(from), end: at(to), prepMinutes: 0, locked: false, flexible: false, people, ...o,
});
const P: Person[] = ["ruilin", "darius", "gilbert", "molly"].map((id) => ({ id, name: id, group: "team", role: "", email: "" }));
const kinds = (xs: ReturnType<typeof issues>) => xs.map((i) => `${i.kind}:${"a" in i ? `${i.a.id}+${i.b.id}` : i.block.id}${i.kind === "person" ? `:${i.person.id}` : ""}`);

test("wall clock round-trips through the day", () => {
  assert.equal(at("11:30"), "2026-10-06T15:30:00.000Z");
  assert.equal(minuteOfDay(at("11:30")), 690);
});

test("a clean plan has no issues", () => {
  const plan = [
    blk("setup", "setup", "08:30", "09:30", ["ruilin"]),
    blk("darius", "interview", "11:30", "12:00", ["darius", "ruilin"]),
    blk("gilbert", "interview", "12:00", "12:30", ["gilbert", "ruilin"]),
  ];
  assert.deepEqual(issues(DAY, plan, P), []);
});

test("filmed at once is a camera clash; preparation is not", () => {
  const a = blk("a", "interview", "11:00", "12:00", ["darius"], { prepMinutes: 30 }); // films 11:30–12:00
  const b = blk("b", "interview", "11:30", "12:00", ["gilbert"]);
  const c = blk("c", "interview", "10:30", "11:30", ["molly"], { prepMinutes: 30 }); // films 11:00–11:30, prep overlaps nobody's filming
  assert.deepEqual(kinds(issues(DAY, [a, b, c], P)), ["camera:a+b"]);
});

test("somebody on two things at once; flexible tasks do not count", () => {
  const a = blk("a", "setup", "10:30", "11:30", ["ruilin"]);
  const b = blk("b", "logistics", "10:30", "10:45", ["ruilin"]);
  const m = blk("m", "interview", "10:30", "11:00", ["ruilin", "molly"], { flexible: true });
  assert.deepEqual(kinds(issues(DAY, [a, b, m], P)), ["person:a+b:ruilin"]);
});

test("outside building hours, and a task nobody is on", () => {
  const early = blk("early", "setup", "08:00", "09:00", ["ruilin"]);
  const late = blk("late", "broll", "16:45", "17:15", []);
  assert.deepEqual(kinds(issues(DAY, [early, late], P)), ["hours:early", "hours:late", "nobody:late"]);
});
