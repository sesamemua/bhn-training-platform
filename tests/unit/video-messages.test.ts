/** The scientific directors' message: fields from the Filming day, gaps shown in brackets. */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATE, fieldsFor, fill, parseTemplate } from "../../src/lib/video/messages";

const day = { date: "2026-10-06", location: "FitzGerald Building Atrium" };
const names: Record<string, string> = { y: "Yoo Jin", e: "Soha (EQUIP)" };
const molly = { id: "m", name: "Molly Shoichet", email: "m@x.ca" };
const slots = [
  { kind: "interview", title: "Interview — Molly", start: "2026-10-06T19:30:00Z", end: "2026-10-06T21:00:00Z", prepMinutes: 30, people: ["m"], facilitators: ["y", "e"] },
  { kind: "lab", title: "Lab shots — Molly's lab, with students", start: "2026-10-06T16:30:00Z", end: "2026-10-06T17:00:00Z", prepMinutes: 0, people: ["m"], facilitators: [] },
];

test("fills times, facilitators and other slots", () => {
  const { fields, missing } = fieldsFor(molly, day, slots, (id) => names[id], "Ruilin Yuan");
  assert.deepEqual(missing, []);
  assert.equal(fields.first_name, "Molly");
  assert.equal(fields.arrive, "3:30 p.m.");
  assert.equal(fields.camera, "4:00 p.m.");
  assert.equal(fields.end, "5:00 p.m.");
  assert.equal(fields.facilitators, "Yoo Jin and Soha");
  assert.equal(fields.other_slots, "• We will also film lab shots with you, 12:30 p.m.–1:00 p.m.\n");
  const body = fill(DEFAULT_TEMPLATE.body, fields);
  assert.ok(!/\{[a-z_]+\}/.test(body), "every field filled");
  assert.ok(!/\.\./.test(body), "no doubled full stop after a.m./p.m.");
  assert.match(body, /Business attire/);
  assert.match(body, /Attached is your script/);
  assert.match(body, /setting powder, hairspray and lint rollers/);
  assert.match(body, /allergies or dietary restrictions/);
});

test("gaps are named and bracketed; unknown fields stay visible; bad saves fall back", () => {
  const { fields, missing } = fieldsFor({ id: "z", name: "Gilbert", email: "" }, day, slots, () => "", "R");
  assert.deepEqual(missing, ["a slot on the Filming day", "an email address"]);
  assert.equal(fields.arrive, "[time]");
  assert.equal(fill("{nope} {first_name}", fields), "{nope} Gilbert");
  assert.deepEqual(parseTemplate("not json"), DEFAULT_TEMPLATE);
});
