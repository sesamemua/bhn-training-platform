import test from "node:test";
import assert from "node:assert/strict";
import { idOf, label, place, timeGrid, titleOf, toMinutes, type Timed } from "../../src/lib/allocation/schedule";

/** A workshop at a local wall-clock time, whatever the runner's zone. */
const at = (id: string, title: string, day: number, sh: number, eh: number): Timed => ({
  id, title,
  startDateTime: new Date(2026, 9, day, sh, 0).toISOString(),
  endDateTime: new Date(2026, 9, day, eh, 0).toISOString(),
});

test("the grid spans the earliest start to the latest end, rounded to hours", () => {
  const g = timeGrid([
    at("a", "Morning", 26, 9, 12),
    at("b", "Afternoon", 28, 13, 16),
  ]);
  assert.equal(g.startMin, 9 * 60);
  assert.equal(g.endMin, 16 * 60);
  assert.deepEqual(g.hours.map(label), ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
});

test("every day shares one set of bounds, which is what aligns the columns", () => {
  // Monday starts at 9, Tuesday not until 13. If bounds were per day,
  // Tuesday's 1pm would be drawn level with Monday's 9am.
  const g = timeGrid([
    at("a", "Mon early", 26, 9, 12),
    at("b", "Tue late", 27, 13, 16),
  ]);
  const mon = g.days.find((d) => d.day.endsWith("-26"))!.slots[0];
  const tue = g.days.find((d) => d.day.endsWith("-27"))!.slots[0];
  assert.equal(place(mon, g).top, 0, "the earliest session sits at the top");
  assert.ok(place(tue, g).top > 50, "a 1pm session sits well down a 9-to-4 grid");
});

test("the same hour on two different days lands at the same height", () => {
  const g = timeGrid([
    at("a", "Mon 1pm", 26, 13, 16),
    at("b", "Wed 1pm", 28, 13, 16),
    at("c", "Mon 9am", 26, 9, 12),
  ]);
  const mon = g.days.find((d) => d.day.endsWith("-26"))!.slots.find((s) => s.start === "13:00")!;
  const wed = g.days.find((d) => d.day.endsWith("-28"))!.slots.find((s) => s.start === "13:00")!;
  assert.equal(place(mon, g).top, place(wed, g).top);
  assert.equal(place(mon, g).height, place(wed, g).height);
});

test("a session's height is proportional to how long it runs", () => {
  const g = timeGrid([at("a", "Short", 26, 9, 10), at("b", "Long", 26, 10, 13)]);
  const short = g.days[0].slots.find((s) => s.start === "09:00")!;
  const long = g.days[0].slots.find((s) => s.start === "10:00")!;
  assert.ok(long.end > short.end);
  assert.ok(place(long, g).height > place(short, g).height * 2.5);
});

test("days come back in date order", () => {
  const g = timeGrid([
    at("c", "Wed", 28, 9, 10),
    at("a", "Mon", 26, 9, 10),
    at("b", "Tue", 27, 9, 10),
  ]);
  assert.deepEqual(g.days.map((d) => d.day.slice(-2)), ["26", "27", "28"]);
});

test("concurrent sessions get their own lane so neither is hidden", () => {
  const g = timeGrid([
    at("a", "CCRM tour", 26, 11, 14),
    at("b", "Catalent tour", 26, 11, 14),
  ]);
  const lanes = g.days[0].slots.map((s) => s.lane);
  assert.deepEqual([...lanes].sort(), [0, 1]);
  assert.ok(g.days[0].slots.every((s) => s.lanes === 2));
});

test("an empty week gives a sane default rather than a collapsed grid", () => {
  const g = timeGrid([]);
  assert.deepEqual(g.days, []);
  assert.ok(g.endMin > g.startMin);
});

test("a workshop with unreadable dates is dropped, not allowed to break the grid", () => {
  const g = timeGrid([
    at("ok", "Fine", 26, 9, 12),
    { id: "bad", title: "Broken", startDateTime: "not a date", endDateTime: "also not" },
  ]);
  assert.equal(g.days.length, 1);
  assert.equal(g.days[0].slots.length, 1);
});

test("the id survives the round trip, so a cell can find its workshop", () => {
  const g = timeGrid([at("ws_123", "CCRM tour + Lunch & Learn", 26, 11, 14)]);
  const s = g.days[0].slots[0];
  assert.equal(idOf(s.option), "ws_123");
  assert.equal(titleOf(s.option), "CCRM tour + Lunch & Learn");
});

test("minutes parse from the clock strings the grid uses", () => {
  assert.equal(toMinutes("09:00"), 540);
  assert.equal(toMinutes("13:30"), 810);
  assert.equal(label(810), "13:30");
});
