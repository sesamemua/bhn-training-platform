/**
 * Registration open or shut, per workshop: each session is Open, Full or
 * Closed, with a message the team writes. One setting, read by the
 * registration form (a Full or Closed session cannot be picked, and a
 * submission that picks one is refused) and by the public feed that
 * biohubnet.ca draws its Training Week page from — so the two always
 * say the same thing.
 *
 * Kept by session slug (the Workshop.slug), so a rename or a time change
 * does not lose a session's status.
 *
 * Pure module: no Prisma.
 */
import { z } from "zod";
import { SESSIONS, optionLabel, sessionForOption } from "@/lib/training-week/schedule-2026";
import { sessionParts } from "@/lib/formbuilder/calendar";
import type { BuiltForm } from "@/lib/formbuilder/types";

export const WORKSHOP_STATUS_KEY = "trainingWeek.workshopStatus";
export const STATES = ["open", "paused", "full", "closed"] as const;
export type WorkshopState = (typeof STATES)[number];
export const STATE_LABEL: Record<WorkshopState, string> = { open: "Open", paused: "Paused", full: "Full", closed: "Closed" };
/** What a session says when the team has not written its own message. */
export const DEFAULT_MESSAGE: Record<Exclude<WorkshopState, "open">, string> = {
  paused: "Registration for this session is temporarily paused.",
  full: "This session is full.",
  closed: "Registration for this session is closed.",
};

const Entry = z.object({ state: z.enum(STATES), message: z.string().trim().max(300).default("") });
export const StatusMapSchema = z.record(z.string().min(1).max(80), Entry);
export type StatusEntry = z.infer<typeof Entry>;
export type StatusMap = z.infer<typeof StatusMapSchema>;

export function parseStatusMap(raw: string | null | undefined): StatusMap {
  try { const r = StatusMapSchema.safeParse(JSON.parse(raw ?? "{}")); if (r.success) return r.data; } catch { /* nothing saved */ }
  return {};
}

/** A session's status; anything not set is Open. */
export const statusOf = (map: StatusMap, slug: string): StatusEntry => map[slug] ?? { state: "open", message: "" };
/** The message shown for a shut session: the team's own, else the default. */
export const messageOf = (e: StatusEntry) => (e.state === "open" ? "" : e.message || DEFAULT_MESSAGE[e.state]);

export interface Shut { label: string; message: string }
/** For a form's options: which of them are Full or Closed, keyed by the option string. */
export function shutOptions(options: string[], map: StatusMap): Record<string, Shut> {
  const out: Record<string, Shut> = {};
  for (const o of options) {
    const s = sessionForOption(o);
    if (!s) continue;
    const e = statusOf(map, s.slug);
    if (e.state !== "open") out[o] = { label: STATE_LABEL[e.state], message: messageOf(e) };
  }
  return out;
}

/** The sessions the switch covers, in schedule order — the bookable ones. */
export const switchable = () => SESSIONS.map((s) => ({ slug: s.slug, title: s.title, option: optionLabel(s) }));

/** Every option offered by a form's session questions (multi-choice with a calendar). */
export const sessionOptionsOf = (doc: BuiltForm) => doc.fields.filter((f) => f.type === "multi" && f.slots.length > 0).flatMap((f) => f.options);

/** One line per chosen session that is Full or Closed — the submission is refused with these. */
export function shutProblems(doc: BuiltForm, answers: Record<string, unknown>, map: StatusMap): string[] {
  const shut = shutOptions(sessionOptionsOf(doc), map);
  const chosen = doc.fields.filter((f) => f.type === "multi" && f.slots.length > 0).flatMap((f) => {
    const v = answers[f.key];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  });
  return chosen.filter((o) => shut[o]).map((o) => `${sessionParts(o).name} — ${shut[o].message} Please take it off your choices.`);
}
