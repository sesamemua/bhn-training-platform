/**
 * What the decision model knows about each person asking for a seat.
 *
 * Most seats now come from the public registration form, with no account
 * behind them — so the facts come from the form's own answers and the
 * trainee roster, not from a profile:
 *
 *   • out of town — the form's "one-way travel over 2 hours?" answer;
 *     an account's country only when there is no form answer;
 *   • trainee — the email matched against the eligibility roster (which
 *     also gives the name people are known by);
 *   • applied at — when the registration was submitted;
 *   • seats held — their other confirmed seats this week.
 *
 * Unknown stays unknown. A blank answer is not "local" and a missing
 * roster is not "not a trainee": the rule simply cannot tell, and the
 * next rule decides.
 *
 * Pure module: no React, no Prisma, no I/O.
 */
import type { Applicant, Ranked } from "./model";

export type Travel = "far" | "near" | "unknown";
export type RosterMatch = "on" | "off" | "unknown";

export interface ApplicantInfo extends Applicant {
  email: string;
  travel: Travel;
  roster: RosterMatch;
  /** Their own ranking of this session: 1 is their first choice. */
  preference: number | null;
  /** Current state of the seat: pending | confirmed | waitlist | cancelled. */
  status: string;
}

export interface BookingFacts {
  bookingId: string;
  status: string;
  bookedAt: string;
  preference: number | null;
  seatsHeld: number;
  user?: { name: string | null; email: string | null; organization: string | null; country: string | null } | null;
  submission?: { data: Record<string, unknown>; email: string | null; createdAt: string } | null;
  /**
   * The roster entry for an email: `{ name }` on it, `null` not on it,
   * `undefined` when there is no roster to check against.
   */
  roster: (email: string) => { name: string | null } | null | undefined;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Out of town from an account's country — the fallback when the form did not say. */
export const outOfTownFromCountry = (country: string | null | undefined): boolean | undefined => {
  if (!country || !country.trim()) return undefined;
  return country.trim().toLowerCase() !== "canada";
};

export function applicantFor(f: BookingFacts): ApplicantInfo {
  const a = f.submission?.data ?? {};
  const email = str(a.trainee_email) || str(f.submission?.email) || str(f.user?.email);

  const travelAnswer = str(a.travel_over_2h).toLowerCase();
  const byCountry = outOfTownFromCountry(f.user?.country);
  const travel: Travel =
    travelAnswer === "yes" ? "far"
    : travelAnswer === "no" ? "near"
    : byCountry === true ? "far"
    : byCountry === false ? "near"
    : "unknown";

  const entry = email ? f.roster(email) : undefined;
  const roster: RosterMatch = entry === undefined ? "unknown" : entry ? "on" : "off";

  const formName = [str(a.first_name), str(a.last_name)].filter(Boolean).join(" ") || str(a.trainee_name);
  const name = entry?.name?.trim() || formName || str(f.user?.name) || email || "Unnamed";

  return {
    id: f.bookingId,
    name,
    email,
    travel,
    roster,
    preference: f.preference,
    status: f.status,
    isOutOfTown: travel === "far" ? true : travel === "near" ? false : undefined,
    isCurrentTrainee: roster === "on",
    organizationType: f.user?.organization ?? null,
    appliedAt: f.submission?.createdAt ?? f.bookedAt,
    seatsHeld: f.seatsHeld,
  };
}

export type Suggestion = "approve" | "waitlist" | null;

/**
 * What the model would do with the seats still open.
 *
 * Confirmed seats stand — the model never suggests taking a place back.
 * The open seats (capacity minus confirmed) go down the ranking to
 * whoever is still undecided or on the waitlist; everyone undecided below
 * that line is suggested for the waitlist. Someone already waitlisted
 * who does not reach a seat gets no suggestion — they are where the
 * model would put them.
 */
export function suggestSeats<T extends ApplicantInfo>(ranked: Ranked<T>[], capacity: number): Map<string, Suggestion> {
  const live = ranked.filter((r) => r.applicant.status !== "cancelled");
  let open = Math.max(0, capacity - live.filter((r) => r.applicant.status === "confirmed").length);
  const out = new Map<string, Suggestion>();
  for (const r of live) {
    const s = r.applicant.status;
    if (s === "confirmed") { out.set(r.applicant.id, null); continue; }
    if (open > 0) { out.set(r.applicant.id, "approve"); open--; continue; }
    out.set(r.applicant.id, s === "pending" ? "waitlist" : null);
  }
  return out;
}
