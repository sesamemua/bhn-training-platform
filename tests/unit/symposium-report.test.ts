import assert from "node:assert/strict";
import test from "node:test";
import { catalogueSchema, isGalleryPhoto } from "../../src/lib/symposium-report/gallery";
import { pagePhoto, photoPreset } from "../../src/lib/symposium-report/photos";
import { reportSchema } from "../../src/lib/symposium-report/document";
import { paginate, replaceReportBlock, reportBlocks } from "../../src/lib/symposium-report/paginate";

test("report validation protects covers and unique section IDs", () => {
  const report = reportSchema.parse({
    cover: { title: "Annual symposium", theme: "Future workforce", date: "October 26–29" },
    pages: [{ id: "summary", label: "Overview", title: "Executive Summary", text: "A four-day event.", frames: 1 }],
    back: { title: "BioHubNet", text: "Learn more." },
  });
  assert.ok(report.cover.title && report.back.title);
  assert.equal(reportSchema.safeParse({ ...report, pages: [...report.pages, report.pages[0]] }).success, false);
  assert.equal(reportSchema.safeParse({ ...report, pages: [{ ...report.pages[0], id: "cover" }] }).success, false);
});

test("flow preserves each character, including long words and Unicode, through smaller first frames", () => {
  const source = "Well-developed ideas need evidence. ".repeat(28) + "➡️".repeat(80) + "Ending.";
  const [block] = reportBlocks(source);
  const fits = (blocks: typeof block[], index: number) =>
    blocks.reduce((length, item) => length + Array.from(item.text).length, 0) <= (index === 0 ? 100 : 144);
  const frames = paginate([block], 1, fits);
  assert.ok(frames.length > 3);
  assert.ok(frames.every(fits));
  assert.equal(frames.flat().map((block) => block.text).join(""), source);
  assert.ok(frames[1][0].continued);
});

test("requested linked frames remain until removed, and a subhead stays with its next paragraph", () => {
  const blocks = reportBlocks("A".repeat(72) + "\n\n## The next topic\n\nEvidence is gathered from the event recording.\n\n> Confirm the figures.");
  const frames = paginate(blocks, 3, (items) => items.reduce((length, item) => length + item.text.length, 0) <= 85);
  assert.equal(frames.length, 3);
  assert.equal(frames[1][0].kind, "heading");
  assert.equal(frames[1][1].kind, "paragraph");
  assert.equal(frames.flat().at(-1)?.kind, "note");
  assert.deepEqual(paginate([], 2, () => true), [[], []]);
});

test("editing a continued fragment preserves the rest of the story and its formatting", () => {
  const source = "  ## Subhead\n\n" + "Café 🧬 research. ".repeat(18) + "\n \n> Check the source.";
  const frames = paginate(reportBlocks(source), 1, (blocks) => blocks.reduce((length, block) => length + block.text.length, 0) <= 95);
  const chunk = frames[1][0];
  assert.equal(chunk.continued, true);
  const needle = chunk.text.replace("research", "training");
  const updated = replaceReportBlock(source, chunk, needle);
  assert.equal(updated.slice(0, chunk.start), source.slice(0, chunk.start));
  assert.equal(updated.slice(chunk.start), needle + source.slice(chunk.start + chunk.text.length));
  assert.deepEqual(reportBlocks(updated).map(({ kind }) => kind), ["heading", "paragraph", "note"]);
});

test("workshop copy and its photo row move together and remain linked after an edit", () => {
  const source = "A".repeat(68) + "\n\n## Negotiation Navigator\n\nTrainees practised at the board.\n[[photos:2]]";
  const blocks = reportBlocks(source);
  const fits = (items: typeof blocks) => items.reduce((size, block) => size + block.text.length + (block.photoRow ? 40 : 0), 0) <= 105;
  const frames = paginate(blocks, 1, fits);
  assert.deepEqual(frames.map((frame) => frame.map(({ kind }) => kind)), [["paragraph"], ["heading", "paragraph"]]);
  const description = frames[1][1];
  assert.equal(description.photoRow, "2");
  assert.equal(description.text, "Trainees practised at the board.");
  const edited = replaceReportBlock(source, description, "Trainees compared their approaches.");
  assert.equal(reportBlocks(edited).at(-1)?.photoRow, "2");
  assert(edited.endsWith("Trainees compared their approaches.\n[[photos:2]]"));
});

test("registration counts and source are part of the editable document", () => {
  const document = {
    cover: { title: "Annual symposium", theme: "Future workforce", date: "October 26–29" },
    pages: [{
      id: "summary", label: "Overview", title: "Executive Summary", text: "", frames: 1,
      image: "registration",
      registration: {
        unit: "registrations", source: "Approved export",
        categories: [{ label: "A", count: 7 }, { label: "B", count: 2 }, { label: "C", count: 1 }, { label: "D", count: 0 }],
      },
    }],
    back: { title: "BioHubNet", text: "Learn more." },
  };
  assert.deepEqual(reportSchema.parse(document).pages[0].registration, document.pages[0].registration);
  document.pages[0].registration.categories[0].count = -1;
  assert.equal(reportSchema.safeParse(document).success, false);
});

test("photo choices and crops belong to their report page and must use known artwork", () => {
  const crop = { ...photoPreset("panel-1-3.webp"), x: 75 };
  const input = {
    cover: { title: "Annual symposium", theme: "Future workforce", date: "October 26–29", photo: photoPreset("cover.jpg") },
    pages: [{ id: "panels", label: "Symposium", title: "Panel Sessions", text: "Panel summary.", frames: 2, photos: { "1": crop } }],
    back: { title: "BioHubNet", text: "Learn more." },
  };
  const report = reportSchema.parse(input);
  assert.deepEqual(pagePhoto(report.pages[0], 0), photoPreset("panel-1-1.webp"));
  assert.deepEqual(pagePhoto(report.pages[0], 1), crop);
  assert.equal(reportSchema.safeParse({ ...input, cover: { ...input.cover, photo: { ...crop, file: "../private" } } }).success, false);
  assert.equal(reportSchema.safeParse({ ...input, cover: { ...input.cover, photo: { ...crop, y: 101 } } }).success, false);
});

test("the private photo catalogue accepts organized and uploaded identifiers without accepting paths", () => {
  const file = "final." + "a".repeat(24) + ".webp";
  const choice = { file, label: "Panelists on stage", x: 50, y: 30, fit: "whole" };
  assert.equal(isGalleryPhoto(file), true);
  assert.equal(isGalleryPhoto("local.panels." + "b".repeat(24) + ".panel-room.webp"), true);
  assert.equal(isGalleryPhoto("../" + file), false);
  assert.equal(isGalleryPhoto(file + ".svg"), false);
  assert.equal(catalogueSchema.safeParse({ groups: [{ id: "panels", title: "Panels", photos: [choice] }], defaults: { panels: [choice] } }).success, true);
  assert.equal(catalogueSchema.safeParse({ groups: [{ id: "panels", title: "Panels", photos: [{ ...choice, file: "/tmp/photo.jpg" }] }], defaults: {} }).success, false);
});
