import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { headCropRisk, headSafeCrop, primaryHead, projectImagePoint, type HeadRegion } from "../../src/lib/images/head-crop";
import { reportSchema } from "../../src/lib/symposium-report/document";
import { reportBlocks } from "../../src/lib/symposium-report/paginate";
import { editorialAction } from "../../src/lib/symposium-report/editorial";

const image = { width: 1600, height: 1069 };
const molly: HeadRegion = { x: .51, y: .185, width: .17, height: .26, source: "manual" };
test("projection head is clipped in the old shallow frame and safe in the taller corrected frame", () => {
  assert.equal(headCropRisk(molly, image, { width: 337, height: 118 }, { x: 49, y: 59, fit: "cover", zoom: 120 }).clipped, true);
  assert.equal(headCropRisk(molly, image, { width: 337, height: 337 * 350 / 684 }, { x: 49, y: 32, fit: "cover", zoom: 100 }).clipped, false);
});
test("primary-subject selection ignores larger incidental faces at the sides and bottom", () => {
  const central = { x: .4, y: .18, width: .16, height: .2 };
  const side = { x: 0, y: .1, width: .12, height: .6 };
  const bottom = { x: .3, y: .68, width: .4, height: .32 };
  const sideBystander = { x: .75, y: .2, width: .23, height: .4 };
  assert.deepEqual(primaryHead([side, sideBystander, bottom, central]), central);
  assert.equal(primaryHead([side, bottom]), undefined);
});
test("crop checks account for fit, zoom, mirror and quarter-turn coordinates", () => {
  const square = { width: 100, height: 100 };
  const point = { x: .2, y: .3 };
  assert.deepEqual(projectImagePoint(point, square, square, { x: 50, y: 50, fit: "cover" }), { x: 20, y: 30 });
  assert.deepEqual(projectImagePoint(point, square, square, { x: 50, y: 50, fit: "cover", flip: true }), { x: 80, y: 30 });
  const turned = projectImagePoint(point, square, square, { x: 50, y: 50, fit: "cover", rotate: 90 });
  assert.ok(Math.abs(turned.x - 70) < .001 && Math.abs(turned.y - 20) < .001);
  const head = { x: .1, y: .1, width: .2, height: .2 };
  assert.equal(headCropRisk(head, square, square, { x: 50, y: 50, fit: "cover", zoom: 300 }).clipped, true);
  assert.equal(headCropRisk(head, image, { width: 300, height: 100 }, { x: 50, y: 50, fit: "whole" }).clipped, false);
});
test("head-safe suggestion returns a checked crop and reports when a frame cannot contain the protected region", () => {
  const placement = { x: 49, y: 59, fit: "cover" as const, zoom: 120 };
  const frame = { width: 337, height: 172 };
  const safe = headSafeCrop(molly, image, frame, placement);
  assert.ok(safe); assert.equal(headCropRisk(molly, image, frame, safe).clipped, false);
  assert.equal(headSafeCrop({ x: 0, y: 0, width: 1, height: 1 }, image, { width: 300, height: 20 }, placement), null);
});
test("saved crop protection is optional and validated; ten-person photo rows retain their anchors", () => {
  const report = { cover: { title: "Report", theme: "Theme", date: "2026" }, pages: [{ id: "people", label: "Team", title: "People", text: "Ruilin Yuan\nMarketing & Communications\n[[photos:10]]", frames: 1,
    photos: { "workshop-10-1": { file: "team-placeholder.webp", x: 50, y: 50, fit: "cover", zoom: 82, subject: molly } } }], back: { title: "Back", text: "Text" } };
  assert.equal(reportSchema.safeParse(report).success, true);
  const invalid = structuredClone(report); invalid.pages[0].photos["workshop-10-1"].subject.x = .95;
  assert.equal(reportSchema.safeParse(invalid).success, false);
  const block = reportBlocks(report.pages[0].text)[0]; assert.equal(block.photoRow, "10"); assert.equal(block.text, "Ruilin Yuan\nMarketing & Communications");
});
test("editor uses actual frame geometry, a full source view and manual keyboard-accessible controls", () => {
  const editor = readFileSync("src/components/workspace/symposium-report/ReportEditor.tsx", "utf8");
  const photo = readFileSync("src/components/workspace/symposium-report/ReportPhoto.tsx", "utf8");
  const detector = readFileSync("src/lib/images/detect-heads.ts", "utf8");
  assert.match(editor, /actual\.height \/ actual\.width/);
  assert.match(photo, /Full source · choose the main subject/); assert.match(photo, /Actual report frame/);
  assert.match(photo, /Protected head box · source image percent/); assert.match(photo, /type="number"/);
  assert.match(detector, /\/vendor\/mediapipe-face/); assert.doesNotMatch(detector, /https:\/\/|fetch\([^)]*image/);
});
test("feedback CTA uses the verified respondent-facing form, without a response spreadsheet or tracking link", () => {
  const page = { id: "symposium-feedback", label: "Feedback", title: "Feedback", text: "", frames: 1 };
  const url = editorialAction(page, { kind: "paragraph", text: "Complete the Annual Symposium feedback form", start: 0 });
  assert.match(url!, /^https:\/\/docs\.google\.com\/forms\/d\/e\/.+\/viewform$/);
  assert.doesNotMatch(url!, /safelinks|spreadsheets|luma\.link/);
});
