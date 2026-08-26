/**
 * The speaker-form word limits, resolved for one event.
 *
 * The platform ships defaults; an admin can override them per event on
 * the Speakers page. Null in the database means "use the default", so
 * an event nobody has touched behaves exactly as it always did and the
 * default can still be changed in one place later.
 *
 * Everything that enforces or displays a limit reads it from here. The
 * previous version had the number as a const imported in eight places,
 * which was fine right up until it needed to vary.
 */
import { BIO_MAX_WORDS } from "./bio";
import { PITCH_MAX_WORDS } from "./pitch";

/**
 * How far an admin may move a limit.
 *
 * The floor is not zero: a limit below the minimum a submission must
 * meet would make the form impossible to submit, and the admin who set
 * it would have no way to tell from the error. The ceiling is where a
 * biography stops being one — past this the shortener is doing more
 * work than the writer.
 */
export const WORD_LIMIT_MIN = 20;
export const WORD_LIMIT_MAX = 1000;

export interface SpeakerLimits {
  bio: number;
  pitch: number;
}

/** The shape any caller needs to select from BhnEvent. */
export interface EventLimitFields {
  speakerBioMaxWords: number | null;
  speakerPitchMaxWords: number | null;
}

/**
 * Bring a number typed into an admin form inside the allowed range.
 * Returns null for anything that is not a usable number, which the
 * caller stores as "use the default" rather than rejecting.
 */
export function clampWordLimit(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i <= 0) return null;
  return Math.min(WORD_LIMIT_MAX, Math.max(WORD_LIMIT_MIN, i));
}

/** The limits in force for one event. */
export function speakerLimits(event: EventLimitFields | null | undefined): SpeakerLimits {
  return {
    bio: clampWordLimit(event?.speakerBioMaxWords) ?? BIO_MAX_WORDS,
    pitch: clampWordLimit(event?.speakerPitchMaxWords) ?? PITCH_MAX_WORDS,
  };
}

/** The platform defaults, for showing an admin what null means. */
export const DEFAULT_LIMITS: SpeakerLimits = { bio: BIO_MAX_WORDS, pitch: PITCH_MAX_WORDS };

/**
 * The floor a shortened answer should not fall below, at any limit.
 *
 * Four fifths of whatever the ceiling is. The complaint that started
 * all of this — "the bio shortening function make things way too
 * short" — was a model given only an upper bound, and the fix was a
 * target range. That fix has to scale with the limit or it stops
 * working the moment somebody changes it.
 */
export function targetMinFor(maxWords: number): number {
  return Math.max(WORD_LIMIT_MIN, Math.round(maxWords * 0.8));
}

/** A cheap character bound, checked before any word counting. */
export function maxCharsFor(maxWords: number): number {
  return maxWords * 40;
}
