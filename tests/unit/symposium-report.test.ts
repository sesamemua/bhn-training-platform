import assert from "node:assert/strict";
import test from "node:test";
import { pagePhoto, photoPreset } from "../../src/lib/symposium-report/photos";
import { reportSchema } from "../../src/lib/symposium-report/document";
import { paginate, reportBlocks } from "../../src/lib/symposium-report/paginate";

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
