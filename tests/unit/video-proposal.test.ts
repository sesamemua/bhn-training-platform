/**
 * The proposal sheet agrees with the budget page, and with the quotes.
 *
 * The point of these checks: the PDF derives its four sections from the
 * page's cost groups, so a change on the page must either flow through or
 * fail here — never quietly leave the PDF stating an old number.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { COST_GROUPS, groupTotal, subtotal } from "../../src/lib/video/production-cost";
import {
  ALTERNATIVES, CAMART_INCIDENTAL, LIGHTING_LABELS, PROPOSAL_SECTIONS, PROPOSAL_TOTALS, SOUND_LABELS,
} from "../../src/lib/video/proposal";
import { PDFDocument } from "pdf-lib";
import { buildProductionProposalPdf } from "../../src/lib/video/proposal-pdf";

const section = (key: string) => PROPOSAL_SECTIONS.find((s) => s.key === key)!;
const group = (key: string) => COST_GROUPS.find((g) => g.key === key)!;

test("the sheet shows camera, lens, sound and lighting — and nothing else", () => {
  assert.deepEqual(PROPOSAL_SECTIONS.map((s) => s.key), ["camera", "lens", "sound", "lighting"]);
});

test("camera and lens are the page's groups, to the cent", () => {
  for (const key of ["camera", "lens"] as const) {
    assert.equal(section(key).pre, subtotal(group(key)), `${key} before tax`);
    assert.equal(section(key).total, groupTotal(group(key)), `${key} all in`);
  }
  assert.equal(section("camera").total, 227784, "2D House quote 263434");
  assert.equal(section("lens").total, 57715, "the Chameleon, rented on its own");
});

test("the CamArt quote splits into sound, lighting and one incidental", () => {
  const sound = group("sound");
  const kept = sound.lines.filter((l) => !l.removed);
  const covered = [...SOUND_LABELS, ...LIGHTING_LABELS, CAMART_INCIDENTAL.label];
  assert.deepEqual(kept.map((l) => l.label).filter((l) => !covered.includes(l)), [], "no line left behind");

  assert.equal(section("sound").pre + section("lighting").pre + CAMART_INCIDENTAL.amount, subtotal(sound));
  assert.equal(section("sound").total, 101700, "$600 mixer + $300 gear, HST in");
  assert.equal(section("lighting").total, 22600, "$100 softbox + $100 Aputure, HST in");
  // Parking is neither, so the four sections plus it are what CamArt is paid.
  assert.equal(section("sound").total + section("lighting").total + CAMART_INCIDENTAL.amount, groupTotal(sound));
});

test("the proposal total is the four sections plus parking", () => {
  const sections = PROPOSAL_SECTIONS.reduce((s, x) => s + x.total, 0);
  assert.equal(PROPOSAL_TOTALS.chosen, sections + CAMART_INCIDENTAL.amount);
  assert.equal(PROPOSAL_TOTALS.chosen, 411999);
});

test("the turned-down quotes add up, and the saving is the difference", () => {
  assert.deepEqual(ALTERNATIVES.map((a) => a.total), [632237, 88349, 110000]);
  assert.equal(PROPOSAL_TOTALS.alternative, 830586);
  assert.equal(PROPOSAL_TOTALS.saved, PROPOSAL_TOTALS.alternative - PROPOSAL_TOTALS.chosen);
  assert.equal(PROPOSAL_TOTALS.saved, 418587);
  // Each figure is checkable: the vendor's own reference is on the sheet.
  for (const a of ALTERNATIVES) assert.match(a.ref, /\d{4}/, `${a.key} carries a reference`);
});

/**
 * The claim the sheet makes, checked on the basis that makes it true.
 * James quoted $1,100 with no tax stated, so the comparison is pre-tax —
 * where it is exact, and where the argument is strongest.
 */
test("James quoted sound alone for what CamArt charged for sound and lighting", () => {
  const james = ALTERNATIVES.find((a) => a.key === "james-sound")!;
  assert.equal(section("sound").pre + section("lighting").pre, james.pre, "$1,100 either way");
  assert.equal(james.tax, null, "he did not state tax, so the saving is understated not inflated");
});

test("the PDF renders two pages", async () => {
  const bytes = await buildProductionProposalPdf({ projectTitle: "BHN Promo Video", preparedBy: "Ruilin Yuan" });
  assert.ok(bytes.byteLength > 2000, "not an empty document");
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
});
