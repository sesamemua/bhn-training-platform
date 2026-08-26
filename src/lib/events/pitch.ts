/**
 * The session-pitch length rule — "a brief description of the advice you
 * plan to share, or who would benefit most from attending".
 *
 * Counted in WORDS, like the bio, because a form that counts characters
 * in one box and words in the next is a form that gets one of them
 * wrong. The machinery is the bio module's; only the numbers differ.
 *
 * Why 120 and not the bio's 250: these are different jobs. The bio is a
 * biography and is read once, beside a photograph. The pitch is read by
 * somebody standing in a corridor deciding which room to walk into, and
 * at 250 words it stops being scannable. 120 words is four to six
 * sentences — enough to answer both halves of the question actually
 * asked (what will be shared, and who should come) and no more.
 *
 * It is also not a cut: the field was 600 characters, which is about 90
 * to 100 words, so anybody who already drafted against the old rule
 * gains room rather than losing it.
 */
import { countWords, tidyToWords } from "./bio";

/** Hard maximum, in words. Longer pitches are rejected on submit. */
export const PITCH_MAX_WORDS = 120;

/**
 * Floor for a shortened pitch. As with the bio, the limit is a shelf to
 * fill: a 40-word answer to a 120-word question has thrown away detail
 * it had room to keep.
 */
export const PITCH_TARGET_MIN_WORDS = 80;

/** The pitch is optional, so there is no minimum on submit — only this
 *  ceiling and the input cap below. */
export const PITCH_INPUT_MAX_WORDS = 900;

/** Character backstops, checked before any word counting, for the same
 *  reason the bio has them: splitting on whitespace allocates. */
export const PITCH_MAX_CHARS = PITCH_MAX_WORDS * 40;
export const PITCH_INPUT_MAX_CHARS = PITCH_INPUT_MAX_WORDS * 40;

/** Bring a model's answer inside the pitch limit. */
export function tidyPitch(raw: string): string {
  return tidyToWords(raw, PITCH_MAX_WORDS);
}

export { countWords };
