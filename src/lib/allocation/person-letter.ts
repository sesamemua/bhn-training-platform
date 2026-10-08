/**
 * One letter per person for a round of decisions.
 *
 * Somebody who asked for three sessions and has just had all three
 * decided gets ONE email saying where each stands — not three arriving
 * a minute apart. Each seat is written about only if what they were
 * last told differs from where it stands now (the same rule as the
 * single-seat letters), so a seat already reported is not repeated.
 * Approval is final; reminders never require another attendance response.
 *
 * Pure module: no Prisma, no mail.
 */
import { letterDue, type Decision } from "./decisions";

export interface LetterSeat {
  bookingId: string;
  session: string;
  start: Date;
  end: Date;
  venue: string | null;
  /** Where it stands now. */
  status: string;
  /** What they were last told (null = never told anything). */
  told: string | null;
  note: string | null;
  /** The team's note for everyone at this workshop, if they wrote one. */
  workshopNote?: string | null;
  /** "I can't make it" for this seat — set when the pass exists. */
  cantAttendLink?: string;
  /** For the calendar entry's version number. */
  bookedAt?: Date;
  decidedAt?: Date;
}

export interface PersonLetter {
  subject: string;
  body: string;
  /** The seats this letter tells them about — marked told once it goes. */
  seats: LetterSeat[];
  /** What each seat's calendar entry does: added for a new place, removed for a place taken away. */
  calendar: { seat: LetterSeat; action: "add" | "remove" }[];
  /** A place is in it, so it carries the pass link. */
  hasPlace: boolean;
  /** Links the HTML letter draws as buttons: one "cancel" per place. */
  buttons: { url: string; label: string }[];
}

const EVENT = "BioHubNet Training Week 2026";
const tz = "America/Toronto";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
// No room in these lines: locations are sent closer to the date, once they are settled.
const line = (s: LetterSeat) => `  • ${s.session} — ${day(s.start)}, ${clock(s.start)}–${clock(s.end)}`;
export const LOCATION_LATER = "Location information will be provided in future communications.";
export const cancelLabel = (session: string) => `Cancel my place — ${session}`;

/** The seats that owe a letter, of all a person has. */
export const owed = (seats: LetterSeat[]) => seats.filter((s) => letterDue(s.told, s.status));

/**
 * The letter for one person, or null when nothing is owed.
 * `all` is every seat they have (for "your other places stand"); the
 * letter is about the ones that owe it.
 */
export function personLetter(p: { name: string; seats: LetterSeat[]; passLink?: string }): PersonLetter | null {
  const due = owed(p.seats);
  if (!due.length) return null;
  const first = p.name.split(/\s+/)[0] || "there";
  const by = (d: Decision) => due.filter((s) => s.status === d).sort((a, b) => a.start.getTime() - b.start.getTime());
  const placed = by("confirmed");
  const waiting = by("waitlist");
  const noPlace = by("cancelled");
  const released = noPlace.filter((s) => s.told === "confirmed");
  const declined = noPlace.filter((s) => s.told !== "confirmed");
  // Anything they still hold that this letter is not about.
  const stillHeld = p.seats.filter((s) => s.status === "confirmed" && !due.includes(s));

  const out: string[] = [`Hello ${first},`, ""];
  out.push(due.length > 1 ? `Here is where your sessions at ${EVENT} stand.` : `An update on your registration for ${EVENT}.`, "");

  if (placed.length) {
    out.push("You have a place at:", ...placed.map(line), "", LOCATION_LATER, "");
    for (const s of placed) if (s.workshopNote?.trim()) out.push(`${s.session}: ${s.workshopNote.trim()}`, "");
    if (p.passLink) out.push("Your Training Week pass, with your sessions:", p.passLink, "");
    out.push(`Please put ${placed.length > 1 ? "them" : "it"} in your calendar now. Your attendance is confirmed. No reply or further confirmation is required to keep your seat.`, "");
    const links = placed.filter((s) => s.cantAttendLink);
    if (links.length) {
      out.push(`Not coming to ${placed.length > 1 ? "one of them" : "it"} after all? Please cancel ${placed.length > 1 ? "that session" : "your place"}, so it can go to somebody else:`);
      for (const s of links) out.push(`  ${cancelLabel(s.session)}: ${s.cantAttendLink}`);
      out.push("");
    }
    out.push("A no-show may affect your eligibility for future BioHubNet training and programmes.", "");
  }
  if (waiting.length) {
    out.push(`${waiting.length > 1 ? "These sessions are" : "This session is"} full, so you are on the waitlist:`, ...waiting.map(line), "");
    out.push("If a place becomes available because someone cancels, we will write to you. You do not need to do anything.", "");
  }
  if (released.length) {
    out.push(`Your place at ${released.length > 1 ? "these sessions has" : "this session has"} been released, so it can go to somebody who is waiting for one:`, ...released.map(line), "");
  }
  if (declined.length) {
    out.push(`We are not able to offer you a place at:`, ...declined.map(line), "");
    if (placed.length || waiting.length || stillHeld.length) {
      out.push(`${declined.length > 1 ? "These sessions are" : "This session is"} either full, or overlap${declined.length > 1 ? "" : "s"} with a session you have been approved for. Where your choices overlap, we can only approve one, based on your ranking.`, "");
      out.push("This decision is final. Your other sessions are unaffected.", "");
    } else {
      out.push("We had more registrations than the rooms hold, and priority went to current BioHubNet trainees. This is not a judgement of your application — if you are not yet a BioHubNet trainee, applying to ENGAGE, EXPERIENCE or EQUIP is the thing that changes the outcome next time.", "");
      out.push("This decision is final.", "");
    }
  }
  for (const s of due) if (s.note?.trim()) out.push(`About ${s.session}: ${s.note.trim()}`, "");
  out.push("The BioHubNet team");

  const subject =
    placed.length && !waiting.length && !noPlace.length ? `Your place${placed.length > 1 ? "s" : ""} at ${EVENT}`
    : placed.length ? `Your sessions at ${EVENT}`
    : waiting.length && !noPlace.length ? `You are on the waitlist — ${EVENT}`
    : `About your registration for ${EVENT}`;

  return {
    subject,
    body: out.join("\n"),
    seats: due,
    calendar: [
      ...placed.map((seat) => ({ seat, action: "add" as const })),
      ...due.filter((s) => s.told === "confirmed" && s.status !== "confirmed").map((seat) => ({ seat, action: "remove" as const })),
    ],
    hasPlace: placed.length > 0,
    buttons: placed.filter((s) => s.cantAttendLink).map((s) => ({ url: s.cantAttendLink!, label: cancelLabel(s.session) })),
  };
}

/** A line for the mailbox list: what the letter will say, in a few words. */
export function letterSummary(seats: LetterSeat[]): { label: string; sessions: string[] }[] {
  const due = owed(seats);
  const group = (label: string, f: (s: LetterSeat) => boolean) => ({ label, sessions: due.filter(f).map((s) => s.session) });
  return [
    group("Approved", (s) => s.status === "confirmed"),
    group("Waitlisted", (s) => s.status === "waitlist"),
    group("Released", (s) => s.status === "cancelled" && s.told === "confirmed"),
    group("Declined", (s) => s.status === "cancelled" && s.told !== "confirmed"),
  ].filter((g) => g.sessions.length);
}
