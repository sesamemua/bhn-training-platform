import widths from "./badge-font-widths.json";
import type { BadgeEdit } from "./print-jobs";

export const BADGE_DESIGN = "v18 · BHN logo 1 mm left";
type Font = keyof typeof widths;
export type BadgeLine = { text: string; x: number; y: number; size: number; width: number; font: Font; color: string };
const tables = widths as Record<Font, Record<string, number>>;
const NAVY = "#07143B", TEAL = "#00596C", WIDTH = 244;
const fontFor = (text: string, bold: boolean): Font => Array.from(text).every(c => tables[bold ? "bold" : "regular"][String(c.codePointAt(0))] !== undefined) ? bold ? "bold" : "regular" : "fallback";

function measure(text: string, size: number, font: Font) {
  return Array.from(text).reduce((sum, c) => {
    const width = tables[font][String(c.codePointAt(0))];
    if (width === undefined) throw new Error("Check font support for this badge before printing.");
    return sum + width * size / 1000;
  }, 0);
}

function wrap(text: string, size: number, font: Font): string[] | null {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (measure(word, size, font) > WIDTH) return null;
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size, font) <= WIDTH) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** One measured layout for the SVG preview and the printed PDF, in 4 x 3-inch points. */
export function badgeLayout(badge: Pick<BadgeEdit, "name" | "position" | "organization" | "extra">): BadgeLine[] {
  const title = "2026 Annual Symposium";
  const titleFont = fontFor(title, true), titleWidth = measure(title, 12, titleFont);
  const heading: BadgeLine = { text: title, x: (288 - titleWidth) / 2, y: 26.4 * 72 / 25.4, size: 12, width: titleWidth, font: titleFont, color: NAVY };
  const fields = [
    { text: badge.name.trim(), size: 16.5, min: 12, bold: true, color: NAVY, y: 34.6 },
    { text: badge.position?.trim() ?? "", size: 13, min: 9.5, bold: true, color: TEAL, y: 40.8 },
    { text: badge.organization.trim(), size: 12.5, min: 9, bold: false, color: NAVY, y: 46.4 },
    { text: badge.extra.trim(), size: 10, min: 8, bold: true, color: TEAL, y: 49 },
  ].filter(field => field.text).map(field => ({ ...field, font: fontFor(field.text, field.bold) }));
  if (!badge.extra.trim() && fields.every(f => !/[\r\n]/.test(f.text) && measure(f.text, f.size, f.font) <= WIDTH)) {
    const left = (288 - Math.max(0, ...fields.map(f => measure(f.text, f.size, f.font)))) / 2;
    return [heading, ...fields.map(f => ({ text: f.text, x: left, y: f.y * 72 / 25.4, size: f.size, width: measure(f.text, f.size, f.font), font: f.font, color: f.color }))];
  }
  for (let step = 0; step <= 12; step++) {
    const rows = fields.map(f => {
      const size = Math.max(f.min, f.size - step * (f.size === 16.5 ? 0.75 : 0.5));
      return { ...f, size, lines: wrap(f.text, size, f.font) };
    });
    if (rows.some(r => r.lines === null)) continue;
    const height = rows.reduce((n, r) => n + r.lines!.length * r.size * 1.02, 0) + Math.max(0, rows.length - 1) * 1.1;
    if (height > 62) continue;
    const left = (288 - Math.max(0, ...rows.flatMap(r => r.lines!.map(line => measure(line, r.size, r.font))))) / 2;
    let top = 79 + (62 - height) / 2;
    const lines = rows.flatMap(row => {
      const result = row.lines!.map(text => {
        const line = { text, x: left, y: top + row.size * 0.84, size: row.size, width: measure(text, row.size, row.font), font: row.font, color: row.color };
        top += row.size * 1.02;
        return line;
      });
      top += 1.1;
      return result;
    });
    return [heading, ...lines];
  }
  throw new Error("This badge line is too long to print legibly. Shorten it before creating the batch.");
}
