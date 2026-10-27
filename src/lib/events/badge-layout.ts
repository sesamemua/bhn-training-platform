import widths from "./badge-font-widths.json";
import type { BadgeEdit } from "./print-jobs";

export const BADGE_DESIGN = "v19 · centered single-line text";
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

/** One measured layout for the SVG preview and the printed PDF, in 4 x 3-inch points. */
export function badgeLayout(badge: Pick<BadgeEdit, "name" | "position" | "organization" | "extra">): BadgeLine[] {
  const title = "2026 Annual Symposium";
  const titleFont = fontFor(title, true), titleWidth = measure(title, 12, titleFont);
  const heading: BadgeLine = { text: title, x: (288 - titleWidth) / 2, y: 26.4 * 72 / 25.4, size: 12, width: titleWidth, font: titleFont, color: NAVY };
  const fields = [
    { label: "Name", text: badge.name, size: 20, min: 12, bold: true, color: NAVY, y: badge.extra.trim() ? 113.5 : 129.365 },
    { label: "Title / role", text: badge.position ?? "", size: 12.5, min: 9.5, bold: true, color: TEAL, y: badge.extra.trim() ? 130 : 143.8 },
    { label: "Organization", text: badge.organization, size: 11.5, min: 9, bold: false, color: NAVY, y: badge.extra.trim() ? 144 : 156.2 },
    { label: "Additional line", text: badge.extra, size: 10, min: 8, bold: true, color: TEAL, y: 156 },
  ].map(field => ({ ...field, text: field.text.trim().replace(/\s+/g, " ") })).filter(field => field.text);
  return [heading, ...fields.map(field => {
    const font = fontFor(field.text, field.bold);
    const size = Math.min(field.size, Math.floor(WIDTH / measure(field.text, 1, font) * 100) / 100);
    if (size < field.min) throw new Error(`${field.label} is too long for one line. Shorten it before printing.`);
    const width = measure(field.text, size, font);
    return { text: field.text, x: (288 - width) / 2, y: field.y, size, width, font, color: field.color };
  })];
}
