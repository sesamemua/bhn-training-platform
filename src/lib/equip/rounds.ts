/**
 * Which funding round an application landed in.
 *
 * Nothing on the application records it — a row carries the moment it
 * was submitted, and the rounds are the deadline windows in
 * EquipDeadline. The round is therefore worked out rather than stored:
 * the first published window for that stream whose deadline had not yet
 * passed when they pressed submit.
 *
 * Derived rather than stamped on purpose. A deadline that gets extended
 * moves the boundary for everybody, and a stored round number would
 * then be wrong in exactly the situation that made somebody move it.
 *
 * The two streams number their rounds differently, so this does not
 * invent a numbering of its own:
 *
 *   VentureLift  names them — "Round 5 · Pre-screening deadline" — and
 *                runs TWO windows per round, so the number is read out
 *                of the label and both windows resolve to Round 5.
 *   VentureConnect runs monthly windows labelled "September 2026".
 *                There is no number in that, and counting the rows
 *                would invent one: the table starts at May 2026 because
 *                that is when these were entered, not because it was
 *                the first round ever run.
 *
 * Pure module: no Prisma, no React.
 */

export interface DeadlineLike {
  stream: string;
  deadlineAt: string | Date;
  cycleLabel: string | null;
}

export interface Round {
  /** What to show: "Round 5", or "September 2026", or the date. */
  label: string;
  /** Only when the round names itself. Never counted from the rows. */
  number: number | null;
  /** The deadline that closes it. */
  deadlineAt: string;
}

const NUMBERED = /\bround\s*(\d+)/i;
const at = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

const dated = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", day: "numeric", month: "short", year: "numeric" })
    .format(d instanceof Date ? d : new Date(d));

function labelOf(row: DeadlineLike): { label: string; number: number | null } {
  const raw = row.cycleLabel?.trim();
  if (!raw) return { label: dated(row.deadlineAt), number: null };

  const m = NUMBERED.exec(raw);
  // "Round 5 · Pre-screening deadline" is one round with two windows;
  // which of the two closed first is not the reviewer's question.
  if (m) return { label: `Round ${m[1]}`, number: Number(m[1]) };
  return { label: raw, number: null };
}

/**
 * The round an application submitted at `submittedAt` belongs to.
 *
 * Null when it was filed after the last published window — real, and
 * worth showing as such rather than as the most recent round: it means
 * somebody submitted into a round nobody has opened yet.
 */
export function roundFor(
  stream: string,
  submittedAt: string | Date | null,
  deadlines: DeadlineLike[],
): Round | null {
  if (!submittedAt) return null;
  const when = at(submittedAt);

  const next = deadlines
    .filter((d) => d.stream === stream && at(d.deadlineAt) >= when)
    .sort((a, b) => at(a.deadlineAt) - at(b.deadlineAt))[0];
  if (!next) return null;

  const { label, number } = labelOf(next);
  return { label, number, deadlineAt: new Date(at(next.deadlineAt)).toISOString() };
}
