import assert from "node:assert/strict";
import test from "node:test";
import { mergeReports } from "../../src/lib/symposium-report/merge";
import type { Report } from "../../src/lib/symposium-report/document";

const photo = { file: "cover.jpg", x: 50, y: 50, fit: "cover" as const };
const base: Report = {
  cover: { title: "Annual Symposium", theme: "Future workforce", date: "October 29" },
  pages: [
    { id: "summary", label: "Overview", title: "Summary", text: "One.\n\nTwo.\n\nThree.\n\nFour.", frames: 1, photos: { "0": photo } },
    { id: "keynote", label: "Program", title: "Keynote", text: "Keynote text", frames: 1 },
  ],
  back: { title: "BioHubNet", text: "Connect" },
};
const edit = (change: (report: Report) => void) => { const copy = structuredClone(base); change(copy); return copy; };

test("autosave keeps both people's edits to different fields, photos and paragraphs", () => {
  const mine = edit((r) => { r.cover.title = "Annual Symposium 2026"; r.pages[0].text = "One, revised.\n\nTwo.\n\nThree.\n\nFour."; r.pages[0].photos!["0"] = { ...photo, zoom: 150 }; });
  const theirs = edit((r) => { r.cover.date = "October 30"; r.pages[0].text = "One.\n\nTwo.\n\nThree.\n\nFour, revised."; r.pages[1].title = "Opening keynote"; });
  const merged = mergeReports(base, mine, theirs);
  assert.equal(merged.cover.title, "Annual Symposium 2026");
  assert.equal(merged.cover.date, "October 30");
  assert.equal(merged.pages[0].text, "One, revised.\n\nTwo.\n\nThree.\n\nFour, revised.");
  assert.equal(merged.pages[0].photos!["0"].zoom, 150);
  assert.equal(merged.pages[1].title, "Opening keynote");
  assert.deepEqual(mergeReports(base, base, theirs), theirs, "no local edits: take theirs as is");
});

test("overlapping edits to the same words keep mine", () => {
  const mine = edit((r) => { r.pages[1].text = "Keynote by Dr. Procyshyn"; });
  const theirs = edit((r) => { r.pages[1].text = "Keynote address"; });
  assert.equal(mergeReports(base, mine, theirs).pages[1].text, "Keynote by Dr. Procyshyn");
});

test("added and removed sections survive a merge", () => {
  const mine = edit((r) => { r.pages.splice(1, 0, { id: "new", label: "New", title: "New section", text: "", frames: 1 }); });
  const theirs = edit((r) => { r.pages = r.pages.filter((p) => p.id !== "keynote"); });
  assert.deepEqual(mergeReports(base, mine, theirs).pages.map((p) => p.id), ["summary", "new"]);
  const removedByMe = edit((r) => { r.pages = r.pages.filter((p) => p.id !== "summary"); });
  assert.deepEqual(mergeReports(base, removedByMe, base).pages.map((p) => p.id), ["keynote"]);
  const editedByThem = edit((r) => { r.pages[0].title = "Changed"; });
  assert.deepEqual(mergeReports(base, removedByMe, editedByThem).pages.map((p) => p.id), ["summary", "keynote"], "a section they changed is not silently deleted");
});
