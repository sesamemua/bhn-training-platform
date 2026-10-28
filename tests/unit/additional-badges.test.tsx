import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { AdditionalBadges } from "../../src/components/admin/events/AdditionalBadges";
import { BadgePreview } from "../../src/components/admin/events/BadgePreview";
import { badgeLayout } from "../../src/lib/events/badge-layout";
import { applyPrintAction, PrintActionSchema, PrintBoardSchema, type AdditionalBadge, type PrintBoard } from "../../src/lib/events/print-jobs";
import { buildPrintPdf } from "../../src/lib/events/print-pdf";

const badge: AdditionalBadge = { name: "Alex Chen", position: "Scientist", organization: "University of Toronto", extra: "Volunteer", fontSizes: { name: 18, position: 10, organization: 10, extra: 8 } };
const version = "2026-10-28T15:00:00.000Z", id = "00000000-0000-4000-8000-000000000012";
const board = (): PrintBoard => PrintBoardSchema.parse({ guests: [{ id: "real-guest", name: "Alex Chen", organization: "Original institution", email: "alex@example.org", source: "luma", status: "approved", tickets: 1 }], edits: {}, jobs: [], syncedAt: version, tentText: "Unchanged", agendaText: "Unchanged", tentTemplate: null, agendaTemplate: null });
const action = (badges = [badge]) => {
  const parsed = PrintActionSchema.parse({ action: "additional_badges", badges, label: "Walk-in badges", assignedTo: "Colleague", notes: "100% actual size", skip: 0, offsetX: 0, offsetY: 0 });
  assert.ok(parsed.action === "additional_badges");
  return parsed;
};

test("additional badges are print-only immutable snapshots, not guest registrations or source edits", () => {
  const original = board(), before = structuredClone(original);
  const result = applyPrintAction(original, [], action(), "Admin", id, version);
  assert.deepEqual(original, before);
  assert.deepEqual(result.board.guests, original.guests);
  assert.deepEqual(result.board.edits, original.edits);
  assert.equal(result.board.jobs.length, 1);
  assert.equal(result.job?.kind, "badges");
  assert.equal(result.job?.createdBy, "Admin");
  assert.equal(result.job?.status, "ready");
  assert.deepEqual(result.job?.printedIds, []);
  assert.deepEqual(result.job?.badges[0].fontSizes, badge.fontSizes);
  assert.equal(result.job?.badges[0].id, `additional:${id}:1`);
  const printed = applyPrintAction(result.board, [], { action: "printed", jobId: id, ids: result.job!.badges.map(b => b.id) }, "Colleague", "unused", version).board;
  assert.equal(printed.jobs[0].status, "printed");
  assert.deepEqual(printed.guests, original.guests);
  assert.deepEqual(printed.edits, original.edits);
});

test("the request boundary limits batches, calibrations and font sizes and ignores forged guest IDs", () => {
  assert.throws(() => action([]));
  assert.throws(() => action(Array(61).fill(badge)));
  for (const fontSizes of [{ name: 9 }, { name: 33 }, { organization: 7 }, { extra: 19 }, { position: NaN }, { name: Infinity }]) assert.throws(() => action([{ ...badge, fontSizes }]));
  assert.throws(() => action([{ ...badge, name: "" }]));
  const input = { ...action(), skip: 6 };
  assert.equal(PrintActionSchema.safeParse(input).success, false);
  assert.equal(PrintActionSchema.safeParse({ ...input, skip: 0, offsetX: 6 }).success, false);
  const result = applyPrintAction(board(), [], action([{ ...badge, id: "real-guest", sourceFingerprint: "forged" } as AdditionalBadge]), "Admin", id, version);
  assert.notEqual(result.job?.badges[0].id, "real-guest");
  assert.equal(result.job?.badges[0].sourceFingerprint, undefined);
});

test("font overrides are exact in both preview and layout; oversize text cannot cover the template", () => {
  assert.deepEqual(badgeLayout(badge).slice(1).map(l => l.size), [18, 10, 10, 8]);
  assert.deepEqual(badgeLayout({ ...badge, fontSizes: undefined }).slice(1).map(l => l.size), [20, 12.5, 11.5, 10]);
  const html = renderToStaticMarkup(createElement(BadgePreview, { badge: { ...badge, reviewed: true } }));
  for (const line of badgeLayout(badge)) assert.ok(html.includes(`font-size="${line.size}"`));
  assert.throws(() => badgeLayout({ ...badge, name: "Alexandria ".repeat(10), fontSizes: { name: 32 } }), /does not fit/);
  assert.throws(() => applyPrintAction(board(), [], action([{ ...badge, name: "Alex", position: "CEO", organization: "ABC", extra: "Host", fontSizes: { name: 32, position: 22, organization: 22, extra: 18 } }]), "Admin", id, version), /too tall/);
});

test("additional PDF uses exact custom font sizes and continues correctly on a partly used Avery sheet", async () => {
  const input = { ...action(Array.from({ length: 2 }, () => structuredClone(badge))), skip: 5, offsetX: 0.5, offsetY: -0.5 };
  const result = applyPrintAction(board(), [], input, "Admin", id, version);
  const bytes = await buildPrintPdf(result.job!, result.board);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const content = await (await pdf.getPage(1)).getTextContent();
  for (const line of badgeLayout(badge).slice(1)) {
    const item = content.items.find(item => "str" in item && item.str === line.text);
    assert.ok(item && "transform" in item, `Missing ${line.text}`);
    assert.ok(Math.abs(Math.hypot(item.transform[2], item.transform[3]) - line.size) < 0.01, `Wrong PDF size for ${line.text}`);
  }
  await pdf.destroy();
  const text = (await extractText(new Uint8Array(bytes), { mergePages: true })).text;
  for (const value of [badge.name, badge.position!, badge.organization, badge.extra]) assert.equal(text.split(value).length - 1, 2);
});

test("the new tab editor has named size controls, the current artwork and an initially disabled print action", () => {
  const html = renderToStaticMarkup(createElement(AdditionalBadges, { busy: false, onCreate: async () => true }));
  for (const label of ["Full name font size", "Position title font size", "Organization font size", "Additional line font size"]) assert.ok(html.includes(`aria-label="${label}"`));
  assert.ok(html.includes("/print/badge-v19-background-1.png"));
  assert.ok(html.includes("Start at sheet position"));
  assert.match(html, /type="submit"[^>]*disabled/);
});
