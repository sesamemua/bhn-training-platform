/**
 * The speaker-bio length rule, in one place.
 *
 * It is counted in WORDS. That is not a detail — the rule used to be
 * 250 characters, which is about 40 words, and the difference between
 * the two is the difference between a caption and a biography.
 *
 * The rule used to live in three places as well: a const in the API
 * route, a second const typed out again in the form component, and —
 * the one that caused the complaint that shortening "makes things way
 * too short" — an implicit rule in the model's prompt that had only a
 * ceiling. A limit expressed as "250 or fewer" and nothing else
 * invites a model to answer 110 and call it a success.
 */

/** Hard maximum, in words. Longer bios are rejected on submit. */
export const BIO_MAX_WORDS = 250;

/**
 * Floor for a shortened bio, in words.
 *
 * The limit is a shelf to fill, not a score to beat: a shortened bio
 * landing under this has thrown away detail it had room to keep, and
 * is worth one more attempt.
 */
export const BIO_TARGET_MIN_WORDS = 200;

/**
 * The most text the shortener will accept as input, in words. Past
 * this it is not a biography, and asking a model to compress it costs
 * more than it returns.
 */
export const BIO_INPUT_MAX_WORDS = 1500;

/**
 * A cheap character backstop, checked BEFORE any word counting.
 *
 * countWords tokenizes the input, which allocates an array
 * proportional to the input. On a public endpoint that is a lever:
 * a few megabytes of spaces costs nothing to send and a great deal to
 * split. A string length check costs nothing and runs first.
 *
 * Sized so it can never reject something the word limit would accept —
 * 40 characters per word is generous for English prose, where the
 * average is closer to six.
 */
export const BIO_MAX_CHARS = BIO_MAX_WORDS * 40;
export const BIO_INPUT_MAX_CHARS = BIO_INPUT_MAX_WORDS * 40;

/**
 * Count words the way a person counting them would.
 *
 * Whitespace-delimited, which makes "state-of-the-art" one word and
 * "Ph.D." one word — the same answer Word and Google Docs give, and
 * the same answer the speaker gets if they paste their bio somewhere
 * to check. Tokens with no letter or digit in them (a lone em dash, a
 * bullet) are not words and are not counted. Invisible separators that
 * arrive when text is pasted from a PDF or rich-text editor are treated
 * as spaces, so a visual line cannot collapse into one giant word.
 */
export function countWords(text: string): number {
  return words(text).length;
}

/** The word tokens themselves, in order, with their original spelling. */
function words(text: string): string[] {
  return text
    .trim()
    .replace(/[\u200B\u2060\uFEFF]/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/**
 * Words a bio must not end on.
 *
 * Cutting at a word boundary is not enough. Trimming
 * "...teaches regulatory strategy at University of" to fit left a
 * dangling preposition, which reads as a bug even though every word
 * before it was correct.
 */
const DANGLING = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of",
  "on", "or", "the", "their", "to", "with", "who", "which", "that", "her",
  "his", "its", "where", "while", "including", "across", "over", "under",
]);

/**
 * Bring a model's answer inside the limit without leaving a dangling
 * connective behind. Text already inside the limit is returned
 * untouched apart from surrounding quotes and whitespace.
 *
 * Cutting on a word boundary is free now that the unit is words —
 * what is not free is cutting somewhere a sentence can actually end.
 *
 * The cut is made by character offset rather than by rejoining tokens,
 * because rejoining with a single space silently flattens the blank
 * line between two paragraphs. At forty words that never came up; at
 * two hundred and fifty it is most bios.
 */
export function tidyBio(raw: string): string {
  return tidyToWords(raw, BIO_MAX_WORDS);
}

/**
 * The same tidy pass against any word limit, so a second field does not
 * get a second, subtly different copy of the dangling-word logic.
 */
export function tidyToWords(raw: string, maxWords: number): string {
  const cleaned = raw.trim().replace(/^["“]|["”]$/g, "").trim();
  if (countWords(cleaned) <= maxWords) return cleaned;

  // Find the character offset just past the last word we may keep, so
  // every space, newline and blank line between the kept words survives
  // exactly as the speaker wrote it.
  let counted = 0;
  let cut = cleaned.length;
  for (const m of cleaned.matchAll(/\S+/g)) {
    if (!/[\p{L}\p{N}]/u.test(m[0])) continue;
    counted += 1;
    if (counted === maxWords) {
      cut = m.index + m[0].length;
      break;
    }
  }
  let out = cleaned.slice(0, cut);

  // Walk the tail back until the last word can actually end a sentence.
  for (;;) {
    out = out.replace(/[\s,;:.—-]+$/, "");
    const m = /\s\S*$/.exec(out);
    const last = (m ? out.slice(m.index + 1) : out).toLowerCase().replace(/[^\p{L}]/gu, "");
    if (!m || !DANGLING.has(last)) break;
    out = out.slice(0, m.index);
  }

  return /[.!?]$/.test(out) ? out : `${out}.`;
}
