/** The filming day's checks: one camera, building opening, somebody on each task, a facilitator on each interview. */
import test from "node:test";
import assert from "node:assert/strict";
import { atMinute, issues, minuteOfDay, type Block } from "../../src/lib/video/filming";

// Tuesday 6 October 2026: Toronto is UTC-4.
const DAY = { date: "2026-10-06", opensAt: "08:30", closesAt: "17:00" };
const at = (hhmm: string) => atMinute(DAY.date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const blk = (id: string, kind: string, from: string, to: string, people: string[], o: Partial<Block> = {}): Block => ({
  id, kind, title: id, notes: "", start: at(from), end: at(to), prepMinutes: 0, locked: false, flexible: false, people, facilitators: ["f"], ...o,
});
const kinds = (xs: ReturnType<typeof issues>) => xs.map((i) => `${i.kind}:${"a" in i ? `${i.a.id}+${i.b.id}` : i.block.id}`);

test("wall clock round-trips through the day", () => {
  assert.equal(at("11:30"), "2026-10-06T15:30:00.000Z");
  assert.equal(minuteOfDay(at("11:30")), 690);
});

test("a clean plan has no issues — including the same person on two set-up tasks, and running past closing", () => {
  const plan = [
    blk("meet", "logistics", "10:30", "10:45", ["ruilin"]),
    blk("setup", "setup", "10:30", "11:30", ["ruilin", "darek"]),
    blk("darius", "interview", "11:00", "12:00", ["darius"], { prepMinutes: 30 }),
    blk("gilbert", "interview", "11:30", "12:30", ["gilbert"], { prepMinutes: 30 }), // prep overlaps Darius's filming: fine
    blk("late", "interview", "17:00", "18:30", ["molly"], { prepMinutes: 30 }),
  ];
  assert.deepEqual(issues(DAY, plan), []);
});

test("filmed at once is a camera clash; a flexible task is not", () => {
  const a = blk("a", "interview", "11:00", "12:00", ["darius"], { prepMinutes: 30 }); // films 11:30–12:00
  const b = blk("b", "lab", "11:30", "12:00", ["molly"]);
  const m = blk("m", "interview", "11:30", "12:00", ["x"], { flexible: true });
  assert.deepEqual(kinds(issues(DAY, [a, b, m])), ["camera:a+b"]);
});

test("before opening, nobody on it, an interview without a facilitator", () => {
  const early = blk("early", "setup", "08:00", "09:00", ["ruilin"]);
  const empty = blk("empty", "logistics", "10:00", "10:15", [], { facilitators: [] });
  const alone = blk("alone", "interview", "13:00", "14:00", ["roshni"], { prepMinutes: 30, facilitators: [] });
  assert.deepEqual(kinds(issues(DAY, [early, empty, alone])), ["early:early", "nobody:empty", "facilitator:alone"]);
});
