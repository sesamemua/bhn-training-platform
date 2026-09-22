/**
 * What a registrant is told when the roster does not have them.
 *
 * Its own module because check.ts imports Prisma, and these strings
 * have to be testable — and readable by the form — without a database.
 *
 * Nobody is turned away any more. A missing address means the lists are
 * behind, not that the person is ineligible: the exports are periodic,
 * and somebody accepted this morning is on none of them. So the form
 * says so, offers to tell us, and lets them register. A coordinator
 * settles it before seats are offered, which is where the decision
 * belonged all along.
 *
 * Deliberately says nothing about WHICH list they are missing from.
 * Naming it would turn the form into a way to find out who applied to
 * EQUIP by typing addresses at it.
 */
export const NOT_ON_LIST_MESSAGE =
  "We can't find that address on the programme lists for Training Week. " +
  "That is usually our lists being behind rather than anything about you — " +
  "you can carry on and register, and a coordinator will check it by hand.";

/** Toronto, because that is where the week is and where the lists are kept. */
const WHEN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "long",
  timeStyle: "short",
});

/**
 * The sentence that says how out of date the lists are.
 *
 * The date is the point of it: somebody who was accepted last week can
 * tell at a glance whether our lists could possibly know, which turns
 * "am I not eligible?" into "they have not re-exported yet". Null when
 * nothing has ever been imported — then nothing is enforced anyway and
 * a date would only confuse.
 */
export function listUpdatedSentence(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  // Not "on {when}. If…": the formatted time ends in "p.m." and brings
  // its own full stop, which reads as a typo doubled up.
  return (
    `Our programme lists were last updated on ${WHEN.format(when)} — ` +
    "so if you were accepted into ENGAGE or EXPERIENCE, or submitted an EQUIP application, " +
    "after that, tell us here and we will approve you by hand."
  );
}
