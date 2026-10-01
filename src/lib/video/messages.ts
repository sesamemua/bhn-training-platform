/**
 * Message templates for the people being filmed — the scientific
 * directors first. One template per project, saved; the {fields} are
 * filled per person from the Filming day (their times, who meets them,
 * where). Nothing is sent from here: the team copies the message or
 * opens it in their own email and sends it themselves.
 *
 * Pure module: no React, no Prisma.
 */
import { z } from "zod";
import { clock, filmStart, longDate } from "@/lib/video/filming";

export const messagesKey = (projectId: string) => `video.messages.${projectId}`;

const Message = z.object({
  subject: z.string().trim().min(1, "Give the message a subject.").max(200),
  body: z.string().trim().min(1, "Write the message.").max(8000),
});
export const TemplateSchema = Message.extend({
  /** A person's message edited by hand, by FilmingPerson id — it no longer follows the template. */
  people: z.record(z.string().max(40), Message).default({}),
});
export type Template = z.infer<typeof TemplateSchema>;

export const DEFAULT_TEMPLATE: Template = {
  people: {},
  subject: "BioHubNet promo video — your filming on {date}",
  body: `Hi {first_name},

Thank you again for taking part in the BioHubNet promo video. Here are the details for the day.

WHEN AND WHERE
• {date}, {location}
• Your scheduled time: {time}
• We encourage you to arrive {prep_minutes} minutes before your scheduled time to settle in, get camera-ready, and meet {facilitators} from our team to go over the questions and the script

WHAT TO WEAR
Business attire. Solid colours work best on camera; please avoid fine stripes, small checks and large logos.

HAIR AND MAKE-UP
We will have setting powder, hairspray and lint rollers on set. You are welcome to bring your own make-up and tools if you prefer.

CATERING
Catering will be provided. Please reply with any allergies or dietary restrictions so we can plan for them.

If you have any questions before the day, just reply to this email.

Best regards,
{sender}`,
};

/** The fields a template can use, with what each one is. */
export const FIELDS: [string, string][] = [
  ["first_name", "Their first name"],
  ["name", "Their full name"],
  ["date", "The shoot date"],
  ["location", "Where — from the Filming day"],
  ["time", "Their scheduled time: when they are on camera, start to end"],
  ["arrive", "When to arrive: the start of their slot, preparation included"],
  ["prep_minutes", "How long the preparation is"],
  ["facilitators", "Who from the team meets them"],
  ["camera", "When filming starts"],
  ["end", "When their slot ends"],
  ["other_slots", "Anything else they are on that day, one line each"],
  ["sender", "Your name"],
];

export interface Slot { kind: string; title: string; start: string; end: string; prepMinutes: number; people: string[]; facilitators: string[] }
export interface Recipient { id: string; name: string; email: string }

const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** One person's {fields}, from their interview (or else their first slot) on the Filming day. */
export function fieldsFor(p: Recipient, day: { date: string; location: string }, slots: Slot[], nameOf: (id: string) => string, sender: string) {
  const mine = slots.filter((s) => s.people.includes(p.id)).sort((a, b) => a.start.localeCompare(b.start));
  const main = mine.find((s) => s.kind === "interview") ?? mine[0];
  const rest = mine.filter((s) => s !== main);
  const missing: string[] = [];
  if (!main) missing.push("a slot on the Filming day");
  if (main && !main.facilitators.length) missing.push("a facilitator");
  if (!p.email) missing.push("an email address");
  return {
    missing,
    fields: {
      first_name: p.name.trim().split(/\s+/)[0] ?? p.name,
      name: p.name.trim(),
      date: longDate(day.date),
      location: day.location || "[location]",
      arrive: main ? clock(main.start) : "[time]",
      prep_minutes: main ? String(main.prepMinutes) : "[prep]",
      facilitators: main?.facilitators.length ? and(main.facilitators.map((id) => nameOf(id).replace(/\s*\(.*?\)\s*$/, ""))) : "[someone]",
      camera: main ? clock(new Date(filmStart(main)).toISOString()) : "[time]",
      end: main ? clock(main.end) : "[time]",
      time: main ? `${clock(new Date(filmStart(main)).toISOString())}–${clock(main.end)}` : "[time]",
      other_slots: rest.map((s) => `• We will also film ${s.title.replace(/\s*—.*$/, "").toLowerCase()} with you, ${clock(s.start)}–${clock(s.end)}\n`).join(""),
      sender,
    } as Record<string, string>,
  };
}

/** {field} → its value; unknown fields are left as typed, so a typo shows. */
export const fill = (text: string, fields: Record<string, string>) =>
  text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in fields ? fields[k] : m));

export function parseTemplate(raw: string | null | undefined): Template {
  try { const r = TemplateSchema.safeParse(JSON.parse(raw ?? "")); if (r.success) return r.data; } catch { /* nothing saved */ }
  return DEFAULT_TEMPLATE;
}
