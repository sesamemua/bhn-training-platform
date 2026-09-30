/** Rebuilding the call sheet from the filming plan: calls, running order, and what is kept. */
import test from "node:test";
import assert from "node:assert/strict";
import { CallSheetDataSchema } from "../../src/lib/video/call-sheet";
import { sheetFromFilming } from "../../src/lib/video/call-sheet-from-filming";
import { atMinute, type Block, type Person } from "../../src/lib/video/filming";

const at = (h: string) => atMinute("2026-10-06", Number(h.slice(0, 2)) * 60 + Number(h.slice(3)));
const P: Person[] = [
  { id: "r", name: "Ruilin", group: "team", role: "Producer & DP", email: "" },
  { id: "d", name: "Darius", group: "interviewee", role: "Scientific Director", email: "" },
  { id: "y", name: "Yoo Jin", group: "team", role: "Interviewee · facilitator", email: "" },
];
const B: Block[] = [
  { id: "1", kind: "setup", title: "Ruilin setting up", notes: "", start: at("08:30"), end: at("09:30"), prepMinutes: 0, locked: false, flexible: false, people: ["r"], facilitators: [] },
  { id: "2", kind: "interview", title: "Interview — Darius", notes: "", start: at("11:00"), end: at("12:00"), prepMinutes: 30, locked: true, flexible: false, people: ["d"], facilitators: ["y"] },
];

test("calls come from each person's first task; the order from the timeline; the rest is kept", () => {
  const existing = CallSheetDataSchema.parse({ parking: "Landmark Garage", people: [{ name: "Ruilin Yuan", phone: "416-000", email: "ruilin@x" }] });
  const d = sheetFromFilming(existing, { location: "Fitzgerald Building Atrium, 150 College Street", opensAt: "08:30", closesAt: "17:00", notes: "" }, P, B);
  assert.equal(d.parking, "Landmark Garage");
  assert.equal(d.generalCall, "08:30");
  assert.equal(d.locationName, "Fitzgerald Building Atrium");
  assert.equal(d.locationAddress, "150 College Street, Toronto, ON");
  const ruilin = d.people.find((p) => p.name === "Ruilin Yuan")!;
  assert.equal(ruilin.call, "08:30");
  assert.equal(ruilin.phone, "416-000", "phone kept from the old sheet");
  assert.equal(d.people.find((p) => p.name === "Yoo Jin")!.call, "11:00", "a facilitator is called for the prep");
  assert.equal(d.people.find((p) => p.name === "Darius")!.group, "talent");
  assert.deepEqual(d.schedule.map((r) => `${r.time}-${r.end} ${r.item}`), ["08:30-09:30 Ruilin setting up", "11:00-12:00 Interview — Darius"]);
  assert.match(d.schedule[1].notes, /Prep 11:00–11:30, filming 11:30–12:00/);
  assert.match(d.schedule[1].who, /facilitators: Yoo Jin/);
  assert.match(d.hospital, /Mount Sinai/);
  assert.ok(CallSheetDataSchema.safeParse(d).success);
});
