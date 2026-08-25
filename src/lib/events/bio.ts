/**
 * The speaker-bio length rule, in one place.
 *
 * It used to live in three: a const in the API route, a second const
 * typed out again in the form component, and — the one that actually
 * caused the complaint that shortening "makes things way too short" —
 * an implicit rule in the model's prompt that had only a ceiling. A
 * limit expressed as "250 or fewer" and nothing else invites a model
 * to answer 110 and call it a success.
 */

/** Hard maximum. Longer bios are rejected on submit. */
export const BIO_LIMIT = 250;

/**
 * The floor. The limit is a shelf to fill, not a score to beat: a
 * shortened bio landing under this has thrown away detail it had room
 * to keep, and is worth one more attempt.
 */
export const BIO_TARGET_MIN = 190;

/**
 * Words a bio must not end on.
 *
 * Cutting at a word boundary is not enough. Trimming
 * "...teaches regulatory strategy at University of" to fit left a
 * dangling preposition, which reads as a bug even though every
 * character before it was correct.
 */
const DANGLING = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of",
  "on", "or", "the", "their", "to", "with", "who", "which", "that", "her",
  "his", "its", "where", "while", "including", "across", "over", "under",
]);

/**
 * Bring a model's answer inside the limit without leaving a severed
 * word or a dangling connective behind. Text already inside the limit
 * is returned untouched apart from surrounding quotes and whitespace.
 */
export function tidyBio(raw: string): string {
  let out = raw.trim().replace(/^["“]|["”]$/g, "").trim();
  if (out.length <= BIO_LIMIT) return out;

  // Leave room for the full stop this will need to end on.
  out = out.slice(0, BIO_LIMIT - 1);
  const sp = out.lastIndexOf(" ");
  if (sp > 0) out = out.slice(0, sp);

  // Walk the tail back until the last word can actually end a sentence.
  for (;;) {
    out = out.replace(/[\s,;:.—-]+$/, "");
    const sp2 = out.lastIndexOf(" ");
    const last = (sp2 === -1 ? out : out.slice(sp2 + 1)).toLowerCase();
    if (sp2 === -1 || !DANGLING.has(last)) break;
    out = out.slice(0, sp2);
  }

  return /[.!?]$/.test(out) ? out : `${out}.`;
}
