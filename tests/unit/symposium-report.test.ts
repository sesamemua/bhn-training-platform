import assert from "node:assert/strict";
import test from "node:test";
import { catalogueSchema, isGalleryPhoto } from "../../src/lib/symposium-report/gallery";
import { hasLeadPhoto, hasPairedPhotos, pagePhoto, photoPreset, photoRowHeight, portraitHeight } from "../../src/lib/symposium-report/photos";
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

test("bullet takeaways and participant quotes stay editable without becoming editorial notes", () => {
  const source = "- Check AI outputs against the source.\n\n“Hands-on practice helped.” — Participant";
  const blocks = reportBlocks(source);
  assert.deepEqual(blocks.map(({ kind }) => kind), ["bullet", "quote"]);
  const updated = replaceReportBlock(source, blocks[0], "Validate AI outputs against the source.");
  assert(updated.startsWith("- Validate"));
  assert.equal(reportBlocks(updated)[1].text, blocks[1].text);
  const chart = {
    unit: "participants", source: "Checked attendance workbook",
    categories: [{ label: "Academic", count: 197 }, { label: "Industry", count: 45 }, { label: "Other", count: 2 }, { label: "Government", count: 14 }],
    audience: { trainees: 165, professionals: 93 }, percentagesOnly: true,
  };
  const document = reportSchema.parse({
    cover: { title: "Symposium", theme: "Training", date: "October 2026" },
    pages: [{ id: "at-a-glance", label: "Symposium", title: "Symposium at a glance", text: updated, frames: 1, registration: chart, showCaptions: false, fillPhotos: false }],
    back: { title: "BioHubNet", text: "Life sciences workforce." },
  });
  assert.deepEqual(document.pages[0].registration, chart);
  assert.equal(document.pages[0].showCaptions, false);
  assert.equal(document.pages[0].fillPhotos, false);
});


test("single and paired photo rows keep landscape proportions instead of narrow strips", () => {
  assert.equal(portraitHeight(0), 0);
  for (const count of [1, 2, 3, 4, 5]) {
    const width = (684 - 10 * (count - 1)) / count;
    const height = width * portraitHeight(count) / 684;
    assert.ok(height >= 144);
    assert.ok(width / height <= 1.50001);
    assert.ok(Math.abs(height - photoRowHeight(count)) < .001);
  }
  const page = { id: "annual-symposium", label: "Symposium", title: "Annual Symposium", text: "Opening remarks", frames: 1,
    photos: { "photo-0-1": photoPreset("welcome-1.webp") } };
  assert.equal(hasPairedPhotos(page, 0), true);
  assert.equal(hasPairedPhotos(page, 1), false);
  const removed = { ...page, photos: { ...page.photos, "0": { ...photoPreset("keynote.jpg"), hidden: true as const } } };
  assert.equal(reportSchema.safeParse({ cover: { title: "T", theme: "T", date: "D" }, pages: [removed], back: { title: "B", text: "B" } }).success, true);
  assert.equal(hasPairedPhotos(removed, 0), false, "a removed main photo leaves the extra photo on its own row");
  assert.equal(hasLeadPhoto(removed, 0), false);
  assert.equal(hasLeadPhoto(page, 0), true);
});


test("four workshop photographs remain valid and swappable with bounded slot IDs", () => {
  const photo = photoPreset("microbix.jpg");
  const draft = { cover: { title: "Report", theme: "Training", date: "October" },
    pages: [{ id: "training-week", label: "Training", title: "Workshops", text: "Workshop\n[[photos:4]]", frames: 1,
      photos: Object.fromEntries([1, 2, 3, 4].map((n) => [`workshop-4-${n}`, photo])) }],
    back: { title: "BioHubNet", text: "Connect" } };
  assert.equal(reportSchema.safeParse(draft).success, true);
  for (const invalid of ["workshop-4-5", "workshop-8-1", "workshop-0-1", "workshop-4-0"]) {
    assert.equal(reportSchema.safeParse({ ...draft, pages: [{ ...draft.pages[0], photos: { [invalid]: photo } }] }).success, false);
  }
});


test("a workshop description, participant quote and photo row stay with their heading", () => {
  const source = "Earlier copy.\n\n## Workshop\n\nWorkshop description.\n\n“Participant reflection.” — Participant\n[[photos:1]]";
  const blocks = reportBlocks(source);
  const pages = paginate(blocks, 1, (candidate) => candidate.length <= 3);
  assert.deepEqual(pages.map((page) => page.map((block) => block.kind)), [["paragraph"], ["heading", "paragraph", "quote"]]);
  assert.equal(pages[1][2].photoRow, "1");
  assert.deepEqual(pages.flat().map((block) => block.text), blocks.map((block) => block.text));
});
