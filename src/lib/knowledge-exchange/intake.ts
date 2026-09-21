/**
 * The Knowledge Exchange awardee intake: what the public form asks, the
 * rules an answer is held to, and the two settings the team can change.
 *
 * Awardees fill it in once, from a link, without an account
 * (/knowledge-exchange/awardee). What they write is used to introduce
 * them — the "what you hope to achieve" answer is quoted as written, so
 * its word limit belongs to the team rather than to a constant here.
 *
 * The round belongs to the team too. Awardees never see it: a submission
 * is filed under the current round, and an admin can move it.
 *
 * Pure module: no React, no Prisma, no I/O.
 */
import { countWords } from "@/lib/events/bio";

/** Rounds before this ran before the form existed. */
export const FIRST_ROUND = 5;

export const QUOTE_DEFAULT_WORDS = 40;
/** How far an admin may move the quote limit. Under 10 a quote is a slogan. */
export const QUOTE_MIN_WORDS = 10;
export const QUOTE_MAX_WORDS = 200;

export const CURRENT_ROUND_KEY = "knowledgeExchange.currentRound";
export const QUOTE_WORDS_KEY = "knowledgeExchange.quoteMaxWords";

/**
 * Submissions the whole form takes per hour. It asks for no email, so
 * there is no sender to count — this caps what a script can store.
 */
export const PER_HOUR = 60;

/** Under Vercel's 4.5 MB request cap. The form shrinks phone photos to well below it. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/** The text questions, in the order the form asks them. */
export const TEXT_FIELDS = [
  { key: "fullName", label: "Full name", max: 120 },
  { key: "projectTitle", label: "Project title", max: 200 },
  { key: "projectSummary", label: "Your project in one sentence", max: 400, rows: 2 },
  { key: "homeInstitution", label: "Home institution", max: 160 },
  { key: "hostInstitution", label: "Host institution", max: 160 },
  { key: "hostDepartment", label: "Host department", max: 160 },
] as const;

type TextKey = (typeof TEXT_FIELDS)[number]["key"];
export type AwardeeAnswers = Record<TextKey, string> & { quote: string; linkedinUrl: string | null };

export interface KeSettings {
  /** The round new submissions are filed under. */
  round: number;
  quoteMaxWords: number;
}

const whole = (raw: unknown): number | null => {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) ? n : null;
};

/** A round an admin may choose: a whole number from 1 to 99. */
export function parseRound(raw: unknown): number | null {
  const n = whole(raw);
  return n !== null && n >= 1 && n <= 99 ? n : null;
}

/** The quote limit brought inside the allowed range; null when it is not a number. */
export function clampQuoteWords(raw: unknown): number | null {
  const n = whole(raw);
  if (n === null || n <= 0) return null;
  return Math.min(QUOTE_MAX_WORDS, Math.max(QUOTE_MIN_WORDS, n));
}

/** Both settings from their PlatformSetting rows; defaults where unset. */
export function settingsFrom(rows: { key: string; value: string }[]): KeSettings {
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    round: parseRound(get(CURRENT_ROUND_KEY)) ?? FIRST_ROUND,
    quoteMaxWords: clampQuoteWords(get(QUOTE_WORDS_KEY)) ?? QUOTE_DEFAULT_WORDS,
  };
}

/** Check one submission. `get` reads a posted value by name. */
export function checkAwardee(
  get: (key: string) => unknown,
  quoteMaxWords: number,
): { ok: true; answers: AwardeeAnswers } | { ok: false; error: string } {
  const text = (key: string) => {
    const v = get(key);
    return typeof v === "string" ? v.trim() : "";
  };

  const answers = {} as AwardeeAnswers;
  for (const f of TEXT_FIELDS) {
    const v = text(f.key);
    if (!v) return { ok: false, error: `Please fill in “${f.label}”.` };
    if (v.length > f.max) {
      return { ok: false, error: `“${f.label}” is a little long — please keep it under ${f.max} characters.` };
    }
    answers[f.key] = v;
  }

  const quote = text("quote");
  // Characters first: countWords splits the input, and this endpoint is public.
  if (quote.length > quoteMaxWords * 40) return { ok: false, error: "That answer is far too long." };
  const words = countWords(quote);
  if (words === 0) return { ok: false, error: "Please tell us what you hope to achieve from this placement." };
  if (words > quoteMaxWords) {
    return { ok: false, error: `Please keep your answer to ${quoteMaxWords} words — yours is ${words}.` };
  }

  // Optional and stored as typed, as on the speaker form: a person reads it.
  const linkedin = text("linkedin");
  if (linkedin.length > 200) return { ok: false, error: "That LinkedIn link is too long." };

  return { ok: true, answers: { ...answers, quote, linkedinUrl: linkedin || null } };
}

/** What the file really is, from its first bytes. A browser's content type is only a claim. */
export function photoTypeOf(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
