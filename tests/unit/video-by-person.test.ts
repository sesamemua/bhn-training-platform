/** One person's view across the tabs: matched by id where the tab has ids, by name where it has names. */
import test from "node:test";
import assert from "node:assert/strict";
import { personView, roster, sameName, scriptPanels, scriptsFor } from "../../src/lib/video/by-person";

test("names match across tabs", () => {
  assert.ok(sameName("Yeseul", "Yeseul Lee"));
  assert.ok(sameName("yoo jin", "Yoo Jin"));
  assert.ok(!sameName("Yoo Jin", "Yeseul"));
  assert.ok(!sameName("", "Ruilin"));
});

const html = `<div class="doc-panels"><div class="doc-panel" data-tab="molly" data-label="Molly">guide</div>
<div class="doc-panel" data-tab="pillars" data-label="Pillar leads">ENGAGE with Epshita Islam, EQUIP with Roshni.</div>
<div class="doc-panel" data-tab="pillar-engage" data-label="ENGAGE"><p class="tab-meta">@Epshita Islam · 2:30</p></div>
<div class="doc-panel" data-tab="pillar-equip" data-label="EQUIP"><p>Script 3, with Roshni: funding</p></div></div>`;

test("scripts: the tab named after them, or one that says @Name / with Name — not a list that merely mentions them", () => {
  const panels = scriptPanels(html);
  assert.deepEqual(panels.map((p) => p.key), ["molly", "pillars", "pillar-engage", "pillar-equip"]);
  assert.deepEqual(scriptsFor("Roshni", panels).map((s) => s.key), ["pillar-equip"]);
  assert.deepEqual(scriptsFor("Epshita", panels).map((s) => s.key), ["pillar-engage"]);
  assert.deepEqual(scriptsFor("Molly", panels).map((s) => s.key), ["molly"]);
});

test("a person's day, tasks and packing list", () => {
  const people = [{ id: "r", name: "Roshni", group: "team", role: "" }, { id: "y", name: "Yoo Jin", group: "team", role: "" }];
  const everyone = roster(people, ["Alison", "Roshni"], null);
  assert.deepEqual(everyone.map((p) => p.name), ["Roshni", "Yoo Jin", "Alison"]);
  const task = (id: string, who: string[], removed = false) => ({ id, title: id, people: who, done: false, notes: "", items: [], removed, custom: false, due: "", suggested: false });
  const v = personView(people[0], {
    blocks: [
      { id: "b2", kind: "interview", title: "Interview — Roshni", start: "2026-10-06T18:00:00Z", end: "2026-10-06T19:00:00Z", prepMinutes: 30, flexible: false, done: false, people: ["r"], facilitators: ["y"] },
      { id: "b1", kind: "logistics", title: "Signs", start: "2026-10-06T12:30:00Z", end: "2026-10-06T13:00:00Z", prepMinutes: 0, flexible: false, done: false, people: ["r"], facilitators: [] },
    ],
    before: [task("releases", ["r"]), task("gone", ["r"], true), task("other", ["y"])],
    prep: [],
    kit: [{ id: "k", group: "Safety", label: "First-aid kit", checked: false, custom: false, removed: false, suggested: false, owner: "Roshni" }],
    sheet: null, panels: scriptPanels(html),
  });
  assert.deepEqual(v.day.map((d) => [d.id, d.how]), [["b1", "on it"], ["b2", "on camera"]]);
  assert.equal(v.arrive, "2026-10-06T12:30:00Z");
  assert.equal(v.day[1].filming, "2026-10-06T18:30:00.000Z");
  assert.deepEqual(v.before.map((t) => t.id), ["releases"]);
  assert.equal(v.bring.length, 1);
  assert.deepEqual(v.scripts.map((s) => s.key), ["pillar-equip"]);
});
