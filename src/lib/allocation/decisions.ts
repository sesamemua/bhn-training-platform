/**
 * What a decision on a seat IS, and which letter it sends.
 *
 * Kept apart from the action that writes it so both can be read
 * without the other: this file says what the four states mean and what
 * moving between them implies, and says it once, so the admin buttons,
 * the email that goes out and the audit line cannot disagree.
 *
 * Pure module: no React, no Prisma.
 */

/**
 * The states a seat can be in.
 *
 * The same four `WorkshopBooking.status` has always had — a decision on
 * a registration is not a new concept, it is the existing one finally
 * reachable for somebody without an account.
 */
export const DECISIONS = ["pending", "confirmed", "waitlist", "cancelled"] as const;
export type Decision = (typeof DECISIONS)[number];

export const isDecision = (v: unknown): v is Decision =>
  typeof v === "string" && (DECISIONS as readonly string[]).includes(v);

export const DECISION_LABEL: Record<Decision, string> = {
  pending: "Not decided",
  confirmed: "Approved",
  waitlist: "Waitlisted",
  cancelled: "Declined",
};

/**
 * The letter each decision sends, by template id.
 *
 * `null` means no letter — going BACK to undecided is a correction, and
 * telling somebody "your place is now undecided" is worse than telling
 * them nothing. The next real decision is what they should hear about.
 */
export const LETTER_FOR: Record<Decision, string | null> = {
  pending: null,
  confirmed: "approved",
  waitlist: "waitlisted",
  cancelled: "session_declined",
};

/**
 * Is this a change worth writing to somebody about?
 *
 * Setting the same decision twice is a click, not news. Reverting is
 * silent. Everything else has a letter, INCLUDING a reversal that lands
 * on a different real decision — somebody told they had a place and
 * then moved to the waitlist has to hear it from us rather than notice.
 */
export function letterFor(from: Decision, to: Decision): string | null {
  if (from === to) return null;
  return LETTER_FOR[to];
}

/** Said in the audit log, and back to the coordinator. */
export function describe(from: Decision, to: Decision): string {
  if (from === to) return `left as ${DECISION_LABEL[to].toLowerCase()}`;
  if (to === "pending") return `taken back to undecided from ${DECISION_LABEL[from].toLowerCase()}`;
  if (from === "pending") return `${DECISION_LABEL[to].toLowerCase()}`;
  // A reversal: the word people will look for when they ask what
  // happened to somebody.
  return `changed from ${DECISION_LABEL[from].toLowerCase()} to ${DECISION_LABEL[to].toLowerCase()}`;
}

/** Does this decision take up a seat in the room? */
export const takesASeat = (d: Decision) => d === "confirmed";
/** Does it hold a place in the queue? */
export const takesAQueueSpot = (d: Decision) => d === "waitlist";
