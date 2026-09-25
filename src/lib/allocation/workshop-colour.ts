/**
 * One colour per workshop, the same colour everywhere.
 *
 * Seven sessions run across three days and every screen lists them as
 * text: the seats table, the calendar, a registrant's row of workshops.
 * Reading which is which means reading the titles, and three of them
 * begin "Company tour + Lunch & Learn". A colour is read before a word
 * is — but only if the same session is the same colour on every screen,
 * so the mapping lives here rather than in each component.
 *
 * Assigned by position in the week's schedule, so neighbouring sessions
 * get neighbouring hues and a session not in the schedule (an old one,
 * or something added by hand in Capacity) still gets a stable colour of
 * its own from its slug.
 *
 * Pure module: no React, no Prisma.
 */
import { SESSIONS } from "@/lib/training-week/schedule-2026";

export interface WorkshopTone {
  /** A filled dot beside a title. */
  dot: string;
  /** A block in the calendar: border + wash. */
  block: string;
  /** A small label carrying the title itself. */
  chip: string;
}

/*
 * Eight hues, none of them the greens, ambers and roses that already
 * mean approved, waitlisted and declined across this workspace — a
 * workshop that happens to be drawn amber would read as a full room.
 */
const PALETTE: WorkshopTone[] = [
  { dot: "bg-sky-500",     block: "border-sky-500/60 bg-sky-500/12",         chip: "bg-sky-500/12 text-sky-700" },
  { dot: "bg-violet-500",  block: "border-violet-500/60 bg-violet-500/12",   chip: "bg-violet-500/12 text-violet-700" },
  { dot: "bg-teal-500",    block: "border-teal-500/60 bg-teal-500/12",       chip: "bg-teal-500/12 text-teal-700" },
  { dot: "bg-fuchsia-500", block: "border-fuchsia-500/60 bg-fuchsia-500/12", chip: "bg-fuchsia-500/12 text-fuchsia-700" },
  { dot: "bg-blue-500",    block: "border-blue-500/60 bg-blue-500/12",       chip: "bg-blue-500/12 text-blue-700" },
  { dot: "bg-cyan-600",    block: "border-cyan-600/60 bg-cyan-600/12",       chip: "bg-cyan-600/12 text-cyan-700" },
  { dot: "bg-indigo-500",  block: "border-indigo-500/60 bg-indigo-500/12",   chip: "bg-indigo-500/12 text-indigo-700" },
  { dot: "bg-purple-600",  block: "border-purple-600/60 bg-purple-600/12",   chip: "bg-purple-600/12 text-purple-700" },
];

const SCHEDULED = new Map(SESSIONS.map((s, i) => [s.slug, i]));

/** Stable for a slug the schedule does not know; never negative. */
function hash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

export function workshopTone(slug: string): WorkshopTone {
  const at = SCHEDULED.get(slug);
  return PALETTE[(at ?? SESSIONS.length + hash(slug)) % PALETTE.length];
}

/* More sessions than hues would put two of them in the same colour,
 * which is worse than no colour: it says "these two are related". */
if (SESSIONS.length > PALETTE.length) {
  throw new Error("More sessions than colours in src/lib/allocation/workshop-colour.ts");
}
