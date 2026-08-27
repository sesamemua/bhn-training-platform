/**
 * What a registrant is told when the roster does not have them.
 *
 * Its own module because check.ts imports Prisma, and this string has
 * to be testable — and readable by the form — without a database.
 *
 * Deliberately says nothing about WHICH list they are missing from.
 * Naming it would turn the form into a way to find out who applied to
 * EQUIP by typing addresses at it. And it ends with somewhere to go:
 * a dead end with no next step is how a real applicant gives up.
 */
export const BLOCKED_MESSAGE =
  "We can't find that address on the programme lists for Training Week. " +
  "If you have just been accepted, or you applied under a different email, " +
  "reply to your programme coordinator and they can add you — it takes a minute. " +
  "Nothing you have typed here is lost.";
