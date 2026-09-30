/**
 * Trainees signing up for a filming slot through the public link.
 *
 * A slot is preparation first (make-up, going through the questions),
 * then time on camera. The rule: a trainee can start at any time in the
 * bookable window unless their time on camera would overlap a LOCKED
 * task's time on camera — there is one camera. Preparation can overlap
 * anything. Every sign-up is saved locked, so the next trainee cannot
 * take the same time; the team unlocks and moves it on the Filming day.
 *
 * Pure module: no React, no Prisma.
 */
import { z } from "zod";
import { filmStart, hhmmToMinutes, minuteOfDay } from "@/lib/video/filming";

/** Start times are offered every this many minutes. */
export const STEP = 15;
/** Sign-ups one filming day will take. */
export const MAX_SIGNUPS = 40;

export const SignupSchema = z.object({
  name: z.string().trim().min(2, "Your name, please.").max(120),
  email: z.string().trim().toLowerCase().email("An email we can reach you at.").max(160),
  /** Minutes after midnight, Toronto. */
  start: z.number().int().min(0).max(24 * 60),
  parking: z.boolean(),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export interface Span { s: number; e: number; label?: string }
export interface Offer { start: number; ok: boolean }

/** The camera time of each locked task, in minutes of the day. Titles only when given — the public page leaves them out. */
export function takenSpans(blocks: { start: string; end: string; prepMinutes: number; locked: boolean; title?: string }[]): Span[] {
  return blocks.filter((b) => b.locked)
    .map((b) => ({ s: minuteOfDay(new Date(filmStart(b)).toISOString()), e: minuteOfDay(b.end), ...(b.title ? { label: b.title } : {}) }))
    .filter((x) => x.e > x.s);
}

/** Every start time in the window, and whether it is free. */
export function offers({ from, to, slot, prep, taken }: { from: string; to: string; slot: number; prep: number; taken: Span[] }): Offer[] {
  const out: Offer[] = [];
  for (let t = hhmmToMinutes(from); t + slot <= hhmmToMinutes(to); t += STEP) out.push({ start: t, ok: isFree(t, slot, prep, taken) });
  return out;
}

export const isFree = (start: number, slot: number, prep: number, taken: Span[]) =>
  !taken.some((x) => start + prep < x.e && x.s < start + slot);
