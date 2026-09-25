/**
 * Whether the eligibility check means anything yet.
 *
 * The interlock. A check against a list that does not exist matches
 * nobody, so on the morning registration opens — because somebody
 * forgot to run an import — every registrant would be marked as
 * unknown, which is the same as marking none of them.
 *
 * So the rule is: check only when there is something to check against.
 * Nobody is refused either way; an address on no list registers anyway
 * and arrives flagged for a coordinator. What the gate decides is
 * whether that flag carries any information.
 *
 * Pure decision logic; the caller does the counting query.
 */

/** Past this, an admin is told the list is old. It does not stop the
 *  check — a stale list still recognises more people than no list. */
export const STALE_AFTER_HOURS = 72;

export interface RosterState {
  /** Rows across every source. */
  total: number;
  /** The most recent successful import, across every source. */
  lastImportAt: Date | null;
}

export interface Gate {
  /** True when a non-match means something: there is a list to miss. */
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
        "No eligibility list has been imported yet, so every registration arrives unrecognised. " +
        "Registration is using the self-declared answer to question one until a list is loaded.",
      stale: false,
    };
  }

  const ageMs = state.lastImportAt ? now.getTime() - state.lastImportAt.getTime() : Infinity;
  const stale = ageMs > STALE_AFTER_HOURS * 3600_000;

  return {
    enforcing: true,
    reason: stale
      ? `Checking against ${state.total} people, but the newest list is more than ${STALE_AFTER_HOURS} hours old. Anyone accepted since then arrives flagged as not on a list.`
      : `Checking against ${state.total} people. Anyone whose address is on none of them still registers, and is flagged here.`,
    stale,
  };
}
