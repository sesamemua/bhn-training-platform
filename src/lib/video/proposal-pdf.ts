/**
 * The equipment proposal as a PDF — two pages, written for someone who
 * approves it and reads nothing else.
 *
 * Page one answers the only two questions that matter: what is being
 * asked for, and is it reasonable. Page two is the evidence — the three
 * quotes that were turned down, each with its vendor reference so any
 * figure can be checked against the document it came from.
 *
 * Every number comes from src/lib/video/proposal.ts, which derives the
 * four sections from the budget page's own cost groups. Nothing is
 * retyped here.
 *
 * Drawing is pdf-lib plus the same text helpers the EQUIP packet uses,
 * so a character the base font cannot draw falls back rather than
 * silently disappearing.
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type RGB } from "pdf-lib";
import { drawRuns, widthOf, type FontSet } from "@/lib/equip/pdf-text";
import {
  ALTERNATIVES, CAMART_INCIDENTAL, PROPOSAL_SECTIONS, PROPOSAL_TOTALS, VENDOR_TOTALS, cad,
} from "./proposal";

const PAGE = { w: 612, h: 792 };
const M = { left: 54, right: 54, top: 58, bottom: 52 };
const CONTENT = PAGE.w - M.left - M.right;

const INK = rgb(0.09, 0.13, 0.17);
const MUTED = rgb(0.38, 0.45, 0.51);
const RULE = rgb(0.85, 0.88, 0.9);
const ACCENT = rgb(0.09, 0.41, 0.47);
const GOOD = rgb(0.13, 0.45, 0.27);
const WASH = rgb(0.96, 0.97, 0.98);

interface Fonts { regular: FontSet; bold: FontSet }

/** Split text to fit a width, in the font it will actually be drawn in. */
function wrap(fonts: FontSet, value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(fonts, candidate, size) <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

/** A page with a cursor, so the callers read as a document not as geometry. */
class Sheet {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private fonts: Fonts) {
    this.page = doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - M.top;
  }
  private set(fonts: FontSet, text: string, size: number, color: RGB, x = M.left) {
    drawRuns(this.page, text, { x, y: this.y, size, fonts, color });
  }
  gap(n: number) { this.y -= n; return this; }
  eyebrow(text: string) {
    // 20, not 14: a 19pt title's cap height is ~13.6pt, so a smaller gap
    // lets the next line's capitals touch this one's baseline.
    this.set(this.fonts.bold, text.toUpperCase(), 8, MUTED);
    return this.gap(20);
  }
  title(text: string) {
    for (const line of wrap(this.fonts.bold, text, 19, CONTENT)) { this.set(this.fonts.bold, line, 19, INK); this.gap(23); }
    return this;
  }
  heading(text: string) {
    this.set(this.fonts.bold, text, 12, INK);
    return this.gap(8).rule().gap(11);
  }
  para(text: string, size = 9.5, color = MUTED) {
    for (const line of wrap(this.fonts.regular, text, size, CONTENT)) { this.set(this.fonts.regular, line, size, color); this.gap(size + 3.5); }
    return this;
  }
  rule() {
    this.page.drawLine({ start: { x: M.left, y: this.y }, end: { x: PAGE.w - M.right, y: this.y }, thickness: 0.7, color: RULE });
    return this;
  }
  /** label left, amount right, on one baseline. */
  row(label: string, amount: string, opts: { bold?: boolean; size?: number; note?: string; color?: RGB } = {}) {
    const size = opts.size ?? 10;
    const fonts = opts.bold ? this.fonts.bold : this.fonts.regular;
    const color = opts.color ?? INK;
    this.set(fonts, label, size, color);
    drawRuns(this.page, amount, {
      x: PAGE.w - M.right - widthOf(fonts, amount, size), y: this.y, size, fonts, color,
    });
    this.gap(size + 4);
    if (opts.note) {
      for (const line of wrap(this.fonts.regular, opts.note, 8, CONTENT - 70)) { this.set(this.fonts.regular, line, 8, MUTED); this.gap(11); }
      this.gap(1);
    }
    return this;
  }
  /**
   * The ask, and beside it what it saves — deliberately the smaller of the
   * two. The reader approves one number; the other is the reason it is a
   * good one. Equal cells made them argue for the same attention.
   */
  headline(left: { label: string; value: string }, right: { label: string; value: string }) {
    const gap = 12, h = 62, top = this.y - h + 14;
    const leftW = (CONTENT - gap) * 0.62, rightW = CONTENT - gap - leftW;
    const rightX = M.left + leftW + gap;
    this.page.drawRectangle({ x: M.left, y: top, width: leftW, height: h, color: WASH });
    this.page.drawRectangle({ x: rightX, y: top, width: rightW, height: h, color: WASH });
    const cell = (x: number, cellLabel: string, value: string, color: RGB, size: number, width: number) => {
      const label = cellLabel.toUpperCase();
      // Shrink rather than run past the cell: the right label is the longer
      // of the two and sits in the narrower box.
      const labelSize = widthOf(this.fonts.bold, label, 7.5) <= width - 24 ? 7.5 : 6.5;
      drawRuns(this.page, label, { x: x + 12, y: top + h - 20, size: labelSize, fonts: this.fonts.bold, color: MUTED });
      drawRuns(this.page, value, { x: x + 12, y: top + 16, size, fonts: this.fonts.bold, color });
    };
    cell(M.left, left.label, left.value, INK, 21, leftW);
    cell(rightX, right.label, right.value, GOOD, 15, rightW);
    this.y = top - 22;
    return this;
  }
  footer(text: string) {
    drawRuns(this.page, text, { x: M.left, y: M.bottom - 16, size: 7.5, fonts: this.fonts.regular, color: MUTED });
    return this;
  }
}

export interface ProposalPdfInput {
  projectTitle: string;
  preparedBy?: string | null;
}

/**
 * The film's name, not the platform's row for it. Projects are stored as
 * "BHN Promo Video Project"; a proposal that says "Video Project \u2014 camera,
 * lens" reads like a database record, so the trailing noun comes off.
 */
const filmName = (title: string) => title.replace(/\s+Project$/i, "").trim() || title;

export async function buildProductionProposalPdf(input: ProposalPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const symbol = await doc.embedFont(StandardFonts.Symbol);
  const dingbats = await doc.embedFont(StandardFonts.ZapfDingbats);
  const fonts: Fonts = {
    regular: { base: await doc.embedFont(StandardFonts.Helvetica), symbol, dingbats },
    bold: { base: await doc.embedFont(StandardFonts.HelveticaBold), symbol, dingbats },
  };
  const t = PROPOSAL_TOTALS;
  const film = filmName(input.projectTitle);

  doc.setTitle(`${film} — camera, lens, lighting and sound`);
  doc.setSubject("Equipment and crew budget proposal");

  // ── Page 1 — the ask ────────────────────────────────────────────────
  const one = new Sheet(doc, fonts);
  one.eyebrow("BioHubNet · Video production")
    .title(`${film} — camera, lens, lighting and sound`)
    .gap(2)
    .para("Budget proposal. Shoot day Tuesday 6 October 2026, 144 College Street. All amounts in Canadian dollars, HST included.", 9)
    .gap(14)
    .headline(
      { label: "Approval requested", value: cad(t.chosen) },
      { label: "Saving from alternative quote", value: cad(t.saved) },
    );

  one.heading("In short");
  for (const point of [
    "The camera package comes from 2D House rather than the one rental house that offered to supply everything. Same shoot, less than half the price.",
    "One lens is rented separately, from William White: the Caldwell Chameleon 75 mm anamorphic. No other house in the city carries it, so we take that line from their quote and nothing else.",
    "CamArt brings sound and lighting on one quote, for the same $1,100 that a sound recordist quoted for sound alone. The lighting effectively comes free.",
  ]) {
    drawRuns(one.page, "•", { x: M.left, y: one.y, size: 9.5, fonts: fonts.bold, color: ACCENT });
    for (const line of wrap(fonts.regular, point, 9.5, CONTENT - 14)) {
      drawRuns(one.page, line, { x: M.left + 14, y: one.y, size: 9.5, fonts: fonts.regular, color: INK });
      one.gap(13);
    }
    one.gap(4);
  }

  one.gap(8).heading("What the money buys");
  for (const section of PROPOSAL_SECTIONS) {
    one.row(section.title, cad(section.total), { bold: true });
    for (const line of section.lines) one.row(`   ${line.label}`, cad(line.amount), { size: 8.5, color: MUTED });
    one.row("   HST", cad(section.tax), { size: 8.5, color: MUTED }).gap(4);
  }
  one.row(CAMART_INCIDENTAL.label, cad(CAMART_INCIDENTAL.amount), { size: 8.5, color: MUTED });
  one.gap(4).rule().gap(14).row("Total requested, taxes in", cad(t.chosen), { bold: true, size: 13 });

  one.gap(10).para(
    VENDOR_TOTALS.map((v) => `${v.vendor} ${cad(v.total)}`).join("    ·    "), 8,
  );
  one.footer(`Page 1 of 2 · ${film}${input.preparedBy ? ` · prepared by ${input.preparedBy}` : ""}`);

  // ── Page 2 — the evidence ───────────────────────────────────────────
  const two = new Sheet(doc, fonts);
  two.eyebrow("The quotes we compared")
    .title("What it would have cost the obvious way")
    .gap(4)
    .para("Three quotes were sought and turned down. Each is listed with the vendor's own reference so any figure can be checked against the document.", 9)
    .gap(16);

  for (const alt of ALTERNATIVES) {
    two.row(alt.covers, cad(alt.total), { bold: true, size: 11 });
    two.para(`${alt.vendor} · ${alt.ref}${alt.tax === null ? " · tax not stated" : ""}`, 8.5);
    two.gap(3);
    two.para(`Instead: ${alt.instead}.`, 9, INK);
    two.para(alt.why, 9);
    two.gap(10).rule().gap(14);
  }

  two.row("Turned down, added up", cad(t.alternative), { bold: true });
  two.row("This proposal", cad(t.chosen), { bold: true });
  two.gap(2).rule().gap(14);
  two.row("Saved", cad(t.saved), { bold: true, size: 13, color: GOOD });
  two.gap(14).para(
    "The comparison is like for like: the three quotes cover the same camera, lens, lighting and sound as this proposal. Mileage, parking, insurance and catering appear in the full budget on the platform and are not counted on either side here.",
    8.5,
  );
  two.footer(`Page 2 of 2 · ${film}`);

  return doc.save();
}
