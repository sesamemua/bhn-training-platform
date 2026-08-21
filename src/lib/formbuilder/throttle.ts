/**
 * Keeping an open form from being filled in by a script.
 *
 * The registration form is reachable by anyone with the link, which is
 * the point — a would-be EQUIP applicant has no platform account and
 * should not need one to register. That also means the only thing
 * between it and a bored script is this.
 *
 * Deliberately small. Not a general rate limiter: one rule, counted in
 * the database so it survives a serverless function being recycled
 * between requests, which an in-memory counter does not.
 *
 * Pure decision logic; the caller does the counting query.
 */

/** How many a single sender may file before we stop taking them. */
export const PER_SENDER = 3;
/** And over what window. */
export const WINDOW_MINUTES = 60;

export interface Recent {
  /** Submissions from this email in the window. */
  byEmail: number;
  /** Submissions from anywhere in the window. */
  total: number;
}

/**
 * A ceiling for the whole form, not only per sender.
 *
 * An attacker who varies the address defeats a per-sender rule
 * entirely. This is set well above a real burst — a link going out to
 * forty people at once is normal, three hundred in an hour is not.
 */
export const PER_HOUR = 300;

export function tooMany(recent: Recent): string | null {
  if (recent.byEmail >= PER_SENDER) {
    return `That address has already registered ${recent.byEmail} times in the last hour. If that was not you, or you need to change something, reply to the confirmation email rather than filling this in again.`;
  }
  if (recent.total >= PER_HOUR) {
    // Said without detail on purpose: the number is not a target.
    return "The form is taking more registrations than usual right now. Please try again in a few minutes — nothing you typed has been lost.";
  }
  return null;
}

export const since = (now: Date) => new Date(now.getTime() - WINDOW_MINUTES * 60_000);
