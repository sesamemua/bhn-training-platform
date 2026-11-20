import assert from "node:assert/strict";
import test from "node:test";
import { baselineOf, condense, fieldChanges, marks, marksByRange, reportChanges, type Mark } from "../../src/lib/symposium-report/changes";
import { paginate, reportBlocks } from "../../src/lib/symposium-report/paginate";
import type { Report } from "../../src/lib/symposium-report/document";

const report = (text: string, title = "Summary"): Report => ({
  cover: { title: "Annual Symposium", theme: "Future workforce", date: "October 29" },
  pages: [{ id: "summary", label: "Overview", title, text, frames: 1 }],
  back: { title: "BioHubNet", text: "Connect" },
});
const joined = (parts: Mark[]) => parts.filter((p) => p.kind !== "del").map((p) => p.text).join("");

test("a save records only the text fields that changed, including removed sections", () => {
  assert.deepEqual(fieldChanges(report("Old passage"), report("New passage", "Overview of the day")).map((c) => [c.key, c.before, c.after]), [
    ["page:summary:title", "Summary", "Overview of the day"],
    ["page:summary:text", "Old passage", "New passage"],
  ]);
  const removed = fieldChanges(report("Kept"), { ...report("Kept"), pages: [] });
  assert.deepEqual(removed.map((c) => c.key), ["page:summary:label", "page:summary:title", "page:summary:text"]);
  assert.ok(removed.every((c) => c.label.endsWith("(section removed)") && c.after === ""));
  assert.deepEqual(fieldChanges(report("Same"), report("Same")), []);
});

test("marks split across laid-out blocks keep every word, including paragraph and page splits", () => {
  const before = "Trainees met mentors.\n\nThe day ended with a reception.\n\nThanks to our sponsors.";
  const after = "Trainees met seventeen mentors.\n\nThanks to our generous sponsors.";
  const blocks = reportBlocks(after);
  // Split the first block across two frames, as paginate does for a long story.
  const frames = paginate(blocks, 1, (candidate) => candidate.reduce((n, b) => n + b.text.length, 0) <= 20);
  const fragments = frames.flat();
  assert.ok(fragments.some((b) => b.continued), "the fixture really splits a block");
  const split = marksByRange(marks(before, after), fragments.map((b) => [b.start, b.start + b.text.length]));
  fragments.forEach((block, i) => assert.equal(joined(split[i]), block.text, "each fragment shows exactly its own current text"));
  const all = split.flat();
  assert.ok(all.some((p) => p.kind === "ins" && p.text.includes("seventeen")));
  assert.ok(all.some((p) => p.kind === "ins" && p.text.includes("generous")));
  const removed = all.filter((p) => p.kind === "del").map((p) => p.text).join("");
  assert.match(removed, /reception/, "a deleted paragraph still shows where it was");
  assert.equal(split.flat().filter((p) => p.kind === "del" && /reception/.test(p.text)).length, 1, "and only once");
});

test("the change list shortens long unchanged text but keeps the edit", () => {
  const long = "a".repeat(300);
  const parts = condense(marks(`${long} old ${long}`, `${long} new ${long}`), 20);
  assert.ok(parts.every((p) => p.text.length < 60));
  assert.ok(parts.some((p) => p.kind === "del" && p.text.includes("old")));
  assert.ok(parts.some((p) => p.kind === "ins" && p.text.includes("new")));
  assert.match(parts[0].text, /^…/);
});

test("Show changes compares with the round snapshot, else with the text before the first logged edit", () => {
  const actor = { name: "Yoo Jin", email: "y@example.com" };
  const row = (id: string, at: string, round: number, changes: unknown) =>
    ({ id, createdAt: new Date(at), detail: JSON.stringify({ round, changes }), actor });
  const logged = [ // newest first, as the route reads them
    row("3", "2026-11-20T15:00:00Z", 1, [{ key: "page:summary:text", label: "Summary · text", before: "Second", after: "Third" }]),
    row("2", "2026-11-20T14:00:00Z", 1, [{ key: "page:summary:text", label: "Summary · text", before: "First", after: "Second" }]),
    row("1", "2026-11-19T14:00:00Z", 0, [{ key: "cover.title", label: "Cover · title", before: "Older round", after: "x" }]),
    { id: "bad", createdAt: new Date(), detail: "not json", actor },
  ];
  const tracking = reportChanges(1, null, logged);
  assert.equal(tracking.since, "tracking");
  assert.deepEqual(tracking.baseline, { "page:summary:text": "First" }, "earliest before of this round only");
  assert.deepEqual(tracking.edits.map((e) => e.id), ["3", "2"]);
  assert.equal(tracking.edits[0].author, "Yoo Jin");
  assert.equal(baselineOf(tracking, "page:summary:text", "Third"), "First");
  assert.equal(baselineOf(tracking, "cover.title", "Annual Symposium"), "Annual Symposium", "untouched fields show no change");

  const round = reportChanges(2, report("Round one text"), []);
  assert.equal(round.since, "round");
  assert.equal(baselineOf(round, "page:summary:text", "Now"), "Round one text");
  assert.equal(baselineOf(round, "page:new-section:text", "Fresh"), "", "a section added this round shows as inserted");
});
