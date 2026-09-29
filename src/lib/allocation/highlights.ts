/**
 * Highlights: an admin flags a registrant, usually with a reason, and
 * everybody else can see who flagged them and why.
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
  /** May be empty: a star with no reason is still a highlight. */
  reason: z.string().trim().max(HIGHLIGHT_REASON_MAX),
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
  if (r.length > HIGHLIGHT_REASON_MAX) return `Keep it under ${HIGHLIGHT_REASON_MAX} characters.`;
  return null;
}

/** Reasons already used on any registrant, most used first — offered again as one-click pills. */
export function reusableReasons(all: Highlight[], limit = 8): string[] {
  const count = new Map<string, { text: string; n: number }>();
  for (const h of all) {
    const text = h.reason.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const c = count.get(key);
    if (c) c.n++;
    else count.set(key, { text, n: 1 });
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((c) => c.text);
}
