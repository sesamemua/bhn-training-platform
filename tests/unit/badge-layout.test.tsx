import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { badgeLayout } from "../../src/lib/events/badge-layout";
import { BadgePreview } from "../../src/components/admin/events/BadgePreview";
import { buildPrintPdf } from "../../src/lib/events/print-pdf";
import { PrintBoardSchema, type PrintJob } from "../../src/lib/events/print-jobs";

const sample = { name: "Alexandra Chen", position: "Research Scientist", organization: "University of Toronto", extra: "", reviewed: true };

test("badge information is individually centered, single-line and slightly lower", () => {
  const lines = badgeLayout(sample);
  assert.deepEqual(lines.map(l => l.size), [12, 20, 12.5, 11.5]);
  assert.deepEqual(lines.map(l => l.font), ["bold", "bold", "bold", "regular"]);
  assert.ok(lines.every(l => Math.abs(l.x + l.width / 2 - 144) < 0.001));
  assert.deepEqual(lines.slice(1).map(l => l.y), [129.365, 143.8, 156.2]);
  assert.ok(lines[1].y > 34.6 * 72 / 25.4);
  assert.ok(lines[2].y > 40.8 * 72 / 25.4);
  assert.ok(lines[3].y > 46.4 * 72 / 25.4);
  assert.equal(lines[2].color, "#00596C");
});

test("long fields shrink independently without wrapping, overlap or truncation", () => {
  const badge = { ...sample, name: "Élodie Lévesque", position: "Senior Director, Strategic Partnerships and Research", organization: "University of Toronto, Faculty of Chemical Engineering", extra: "HQP Representative" };
  const lines = badgeLayout(badge);
  assert.equal(lines.length, 5);
  assert.equal(lines[1].text, badge.name);
  assert.equal(lines[2].text, badge.position);
  assert.equal(lines[3].text, badge.organization);
  assert.equal(lines[4].text, badge.extra);
  assert.ok(lines[2].size < 12.5);
  assert.ok(lines[3].size < 11.5);
  for (const line of lines) {
    assert.ok(line.x >= 5.67 && line.x + line.width <= 282.33);
    assert.ok(Math.abs(line.x + line.width / 2 - 144) < 0.001);
    assert.ok(line.y + line.size * 0.25 < 160.33, `${line.text} overlaps artwork`);
  }
  const words = lines.slice(1).map(l => l.text).join(" ");
  assert.equal(words, [badge.name, badge.position, badge.organization, badge.extra].join(" "));
  assert.throws(() => badgeLayout({ ...sample, name: "X".repeat(160) }), /too long/);
  assert.throws(() => badgeLayout({ ...sample, position: "Director ".repeat(25) }), /Title \/ role is too long for one line/);
  assert.throws(() => badgeLayout({ ...sample, organization: "University ".repeat(25) }), /Organization is too long for one line/);
  assert.equal(badgeLayout({ ...sample, position: "Research\n  Scientist" })[2].text, "Research Scientist");
});

test("Greek and Cyrillic keep the existing Noto font fallback and unsupported glyphs are rejected", () => {
  for (const name of ["Νίκος Παπαδόπουλος", "Александра Петрова"]) assert.equal(badgeLayout({ ...sample, name })[1].font, "fallback");
  assert.throws(() => badgeLayout({ ...sample, name: "李明" }), /font support/);
});

test("SVG preview uses the prepared artwork, print coordinates and escaped attendee text", () => {
  const badge = { ...sample, name: "<Alex & Chen>" };
  const html = renderToStaticMarkup(createElement(BadgePreview, { badge }));
  assert.match(html, /viewBox="0 0 288 216"/);
  assert.match(html, /\/print\/badge-v19-background-1.png/);
  assert.match(html, /&lt;Alex &amp; Chen&gt;/);
  for (const line of badgeLayout(badge)) assert.ok(html.includes(`x="${line.x}" y="${line.y}" font-size="${line.size}"`));
  assert.match(renderToStaticMarkup(createElement(BadgePreview, { badge: { ...sample, name: "X".repeat(160) } })), /role="alert"/);
});

test("prepared artwork records the left nudge and has no hidden example attendee text", async () => {
  const metadata = JSON.parse(await readFile("public/print/badge-v18-source.json", "utf8"));
  assert.equal(metadata.bhnShiftLeftMm, 1);
  assert.equal(metadata.originalLogoPixelsPreserved, true);
  assert.equal(metadata.footerRemainsVector, true);
  const source = new Uint8Array(await readFile("public/print/badge-v18-background.pdf"));
  assert.deepEqual((await PDFDocument.load(source)).getPage(0).getSize(), { width: 288, height: 216 });
  assert.equal((await extractText(source, { mergePages: true })).text.trim(), "");
});

test("paired v19 backgrounds preserve logos, omit attendee text and fit exact badge dimensions", async () => {
  const metadata = JSON.parse(await readFile("public/print/badge-v19-source.json", "utf8"));
  assert.equal(metadata.originalLogoPixelsPreserved, true);
  assert.equal(metadata.rightFooterMirrored, true);
  assert.deepEqual(metadata.pages, ["left", "right"]);
  const bytes = new Uint8Array(await readFile("public/print/badge-v19-background.pdf"));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 288, height: 216 });
  assert.equal((await extractText(bytes, { mergePages: true })).text.trim(), "");
});

test("PDF and preview preserve the same text and partly-used-sheet offsets without example names", async () => {
  const job: PrintJob = { id: "design-proof", kind: "badges", label: "Badge design proof", createdAt: "2026-10-26T12:00:00.000Z", createdBy: "Test", status: "ready", printedAt: null, printedBy: null, badges: [{ id: "sample", ...sample, name: "Élodie Lévesque", extra: "HQP Representative" }], copies: 1, assignedTo: "", notes: "", printedIds: [], skip: 5, offsetX: 1, offsetY: -1 };
  const board = PrintBoardSchema.parse({ guests: [], edits: {}, jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null });
  const bytes = await buildPrintPdf(job, board);
  const pdf = await PDFDocument.load(bytes);
  const text = (await extractText(bytes, { mergePages: true })).text;
  for (const line of badgeLayout(job.badges[0])) assert.ok(text.includes(line.text), line.text);
  assert.doesNotMatch(text, /Alexandra Chen|AGENDA|Future Workforce/);
  assert.equal(pdf.getPageCount(), 1);
});
