/**
 * Text in the application PDF, each character in a built-in font that has it.
 *
 * The packet uses PDF's built-in fonts (no font files to ship). Helvetica
 * only covers Western European text, so anything else used to print as "?":
 * the Greek letter in "IFN-γ", a bullet pasted from Word, a ✓, a Chinese
 * file name. Now each character is drawn in the first font that has it —
 * Helvetica, then Symbol (Greek, maths, arrows), then ZapfDingbats (ticks,
 * shapes). Accented letters Helvetica lacks lose the accent ("ễ" → "e",
 * "Ł" → "L"); a run of a script none of them can draw becomes a label such
 * as "[Chinese text]"; emoji and stray marks are left out.
 */
import type { PDFFont, PDFPage, RGB } from "pdf-lib";

export interface FontSet {
  base: PDFFont;
  symbol: PDFFont;
  dingbats: PDFFont;
}

export interface Run { text: string; font: PDFFont }

/** Characters that are really something simpler. */
const SAME_AS: Record<string, string> = {
  "": "✓", // Word's tick (Wingdings, private-use code point)
  "": "➢", // Word's arrow bullet (Wingdings)
  "‐": "-", "‑": "-", // hyphen, non-breaking hyphen
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "ı": "i", // letters with no accent-free form
};
/** Invisible characters that only get in the way. */
const DROP = /[​-‍⁠︎️﻿­]/g;
/** Bullet-like marks no built-in font has. Any other private-use character is a Word bullet too. */
const BULLET = /[\p{Co}‣⁃∙▪▫▸▹►◦⦁⦾⦿⬝⬥]/u;

const charSets = new WeakMap<PDFFont, Set<number>>();
function fontFor(fonts: FontSet, character: string): PDFFont | undefined {
  return [fonts.base, fonts.symbol, fonts.dingbats].find((font) => {
    let set = charSets.get(font);
    if (!set) charSets.set(font, (set = new Set(font.getCharacterSet())));
    return set.has(character.codePointAt(0) ?? -1);
  });
}

/** The character as something a built-in font can draw ("" = leave it out), or null. */
function drawable(fonts: FontSet, character: string): string | null {
  if (fontFor(fonts, character)) return character;
  if (BULLET.test(character)) return "•";
  // "ễ" → "e", "₅" → "5", "ﬁ" → "fi"; a lone accent mark → "".
  const bare = character.normalize("NFKD").replace(/\p{M}/gu, "");
  if (bare !== character && Array.from(bare).every((c) => fontFor(fonts, c))) return bare;
  return null;
}

/** What to call text no built-in font can draw; "" leaves it out (emoji, symbols). */
function label(text: string): string {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "[Japanese text]";
  if (/\p{Script=Hangul}/u.test(text)) return "[Korean text]";
  if (/\p{Script=Han}/u.test(text)) return "[Chinese text]";
  return /\p{L}/u.test(text) ? "[non-Latin text]" : "";
}

/** Split one line of text into runs, each in a font that can draw it. */
export function runsOf(fonts: FontSet, value: string): Run[] {
  const runs: Run[] = [];
  const add = (text: string, font: PDFFont) => {
    const last = runs.at(-1);
    if (last?.font === font) last.text += text;
    else runs.push({ text, font });
  };
  // Undrawable text, kept together across spaces so "项目 与 团队" is one label.
  let missing = "";
  const flush = () => {
    const name = label(missing);
    if (name) add(name, fonts.base);
    if (/\s$/.test(missing)) add(" ", fonts.base);
    missing = "";
  };

  const text = value.replace(DROP, "").replace(/\s/g, " ").normalize("NFC");
  for (const character of Array.from(text, (c) => SAME_AS[c] ?? c).join("")) {
    const shown = drawable(fonts, character);
    if (shown === null || (missing && character === " ")) {
      missing += character;
      continue;
    }
    if (missing) flush();
    for (const c of shown) add(c, fontFor(fonts, c)!);
  }
  if (missing) flush();
  return runs;
}

export const widthOf = (fonts: FontSet, value: string, size: number) =>
  runsOf(fonts, value).reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, size), 0);

/** Draw one line, switching fonts where it needs to. */
export function drawRuns(
  page: PDFPage,
  value: string,
  options: { x: number; y: number; size: number; fonts: FontSet; color: RGB },
): void {
  let x = options.x;
  for (const run of runsOf(options.fonts, value)) {
    page.drawText(run.text, { x, y: options.y, size: options.size, font: run.font, color: options.color });
    x += run.font.widthOfTextAtSize(run.text, options.size);
  }
}
