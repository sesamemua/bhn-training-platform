/**
 * Slightly richer text for forms that ask for it.
 *
 * linkify.ts is deliberately narrow, and stays so: every form that has
 * not opted in keeps it. This is the opt-in (a form's
 * `presentation.richText`) for copy that genuinely needs more — an
 * intro in paragraphs, a link that reads "BioHubNet 2026 Annual
 * Symposium · Luma" instead of a raw address, a "PLEASE NOTE:" that is
 * bold because the coordinators wrote it that way.
 *
 * Three things and no more:
 *   - a line break starts a new paragraph;
 *   - [label](https://…) is a link with its own words;
 *   - **words** are bold.
 * Bare addresses still link through linkify. Anything that does not
 * match exactly — an unclosed bracket, a javascript: link, a lone pair
 * of asterisks — is left as the literal text, so a typo shows up as a
 * typo rather than swallowing the sentence after it.
 *
 * Pure module: no React, no I/O.
 */
import { linkify } from "./linkify";

export type RichPiece =
  | { text: string }
  | { text: string; href: string }
  | { text: string; bold: true };

export type RichParagraph = RichPiece[];

// http(s) only: a label link is typed by a coordinator and rendered on
// a public page, and any other scheme is a way to run something.
const INLINE = /\[([^\[\]\n]{1,200})\]\((https?:\/\/[^\s()<>]+)\)|\*\*([^*\n]{1,300})\*\*/g;

/** Split into paragraphs of text, links and bold runs. */
export function parseRich(text: string): RichParagraph[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLine);
}

function parseLine(line: string): RichParagraph {
  const out: RichPiece[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...linkify(line.slice(last, at)));
    if (m[1] !== undefined && m[2] !== undefined) out.push({ text: m[1], href: m[2] });
    else if (m[3] !== undefined) out.push({ text: m[3], bold: true });
    last = at + m[0].length;
  }
  if (last < line.length) out.push(...linkify(line.slice(last)));
  return out.length > 0 ? out : [{ text: line }];
}

/** The words a reader sees, markup removed — for tests and plain-text fallbacks. */
export function plainRich(text: string): string {
  return parseRich(text).map((p) => p.map((piece) => piece.text).join("")).join("\n");
}

/** True when there is at least one link, labelled or bare. */
export const hasRichLink = (text: string) =>
  parseRich(text).some((p) => p.some((piece) => "href" in piece));
