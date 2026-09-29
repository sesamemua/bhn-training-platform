/**
 * Highlights: an admin flags a registrant for a reason, and everybody
 * else can see who flagged them and why.
 *
 * "Keep an eye on this one", "sponsor's student", "asked about
 * accessibility on the phone" — context that belongs to a person rather
 * than to a seat, so it lives on their registration and follows them to
 * every session, every screen and the door. More than one admin may
 * highlight the same person, each with their own reason; nobody's note
 * is overwritten by somebody else's.
 *
 * Kept on the registration's data under a reserved key, like the other
 * platform-written facts there (__eligibility, __ootAccepted): nothing
 * in a submitted form can write a key that is not one of its questions.
 *
 * Pure module: no Prisma, no React.
 */
import { z } from "zod";

export const HIGHLIGHTS_KEY = "__highlights";
export const HIGHLIGHT_REASON_MAX = 300;

export const HighlightSchema = z.object({
  id: z.string().min(1).max(40),
  /** Who highlighted them — kept as a name so the note still reads if the account goes. */
  byId: z.string().max(40).nullable(),
  byName: z.string().max(120),
  reason: z.string().trim().min(1).max(HIGHLIGHT_REASON_MAX),
  at: z.string(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

/** The highlights on a registration's data; anything unreadable is dropped. */
export function highlightsOf(data: unknown): Highlight[] {
  const raw = (data as Record<string, unknown> | null | undefined)?.[HIGHLIGHTS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h) => {
    const r = HighlightSchema.safeParse(h);
    return r.success ? [r.data] : [];
  });
}

/** Why a reason cannot be saved, or null. */
export function highlightProblem(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "Say why — the reason is what the highlight is for.";
  if (r.length > HIGHLIGHT_REASON_MAX) return `Keep it under ${HIGHLIGHT_REASON_MAX} characters.`;
  return null;
}
