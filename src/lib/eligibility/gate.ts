/**
 * Whether the eligibility check is allowed to turn anybody away.
 *
 * The interlock. Registration blocks on a non-match, which is only a
 * sane thing to do against a list that exists: an empty roster would
 * refuse every applicant on the planet, and it would do it silently,
 * on the morning registration opened, because somebody forgot to run
 * an import.
 *
 * So the rule is: enforce only when there is something to enforce
 * against. With no rows loaded the form falls back to the behaviour it
 * had before this feature — the four-way self-declaration — which lets
 * people through and is recoverable. Blocking everybody is not.
 *
 * Pure decision logic; the caller does the counting query.
 */

/** Past this, an admin is told the list is old. It does not stop the
 *  check — a stale list still turns away fewer people than no list. */
export const STALE_AFTER_HOURS = 72;

export interface RosterState {
  /** Rows across every source. */
  total: number;
  /** The most recent successful import, across every source. */
  lastImportAt: Date | null;
}

export interface Gate {
  /** True when a non-match may block a registration. */
  enforcing: boolean;
  /** Why, in words an admin banner can print. */
  reason: string;
  /** True when the roster is loaded but old enough to warn about. */
  stale: boolean;
}

export function eligibilityGate(state: RosterState, now: Date): Gate {
  if (state.total <= 0) {
    return {
      enforcing: false,
      reason:
        "No eligibility list has been imported yet, so nobody is being turned away. " +
        "Registration is using the self-declared answer to question one until a list is loaded.",
      stale: false,
    };
  }

  const ageMs = state.lastImportAt ? now.getTime() - state.lastImportAt.getTime() : Infinity;
  const stale = ageMs > STALE_AFTER_HOURS * 3600_000;

  return {
    enforcing: true,
    reason: stale
      ? `Checking against ${state.total} people, but the newest list is more than ${STALE_AFTER_HOURS} hours old. Anyone accepted since then will be refused.`
      : `Checking against ${state.total} people.`,
    stale,
  };
}
