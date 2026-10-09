/**
 * Travel follow-up letters the team has saved to use again.
 *
 * A letter is saved from the box it was edited in, where it is already
 * addressed to one person. Saving turns that person's details back into
 * merge fields ("Hello Amara," → "Hello {{first_name}},"), so the same
 * letter can be used for the next person and is filled in for them.
 *
 * Pure module: no Prisma, no React.
 */
import { z } from "zod";

export const TRAVEL_TEMPLATES_KEY = "trainingWeek.travelLetterTemplates";
export const MAX_TRAVEL_TEMPLATES = 40;

export const TravelTemplateSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
  byName: z.string().max(120).default(""),
  updatedAt: z.string().max(40).default(""),
});
export type TravelTemplate = z.infer<typeof TravelTemplateSchema>;

export function parseTravelTemplates(raw: string | null | undefined): TravelTemplate[] {
  try { const r = z.array(TravelTemplateSchema).safeParse(JSON.parse(raw ?? "[]")); if (r.success) return r.data; } catch { /* nothing saved */ }
  return [];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A letter written to one person, with their details put back as merge
 * fields. Longest values first, so a full name is not half-replaced by
 * the first name inside it; whole words only, so a first name "Al" does
 * not rewrite "also".
 */
export function toTemplate(text: string, vars: Record<string, string | undefined>): string {
  const pairs = Object.entries(vars)
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim().length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [key, value] of pairs) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}{])${escapeRe(value.trim())}(?![\\p{L}\\p{N}}])`, "gu"), `{{${key}}}`);
  }
  return out;
}
