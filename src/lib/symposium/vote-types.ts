/**
 * Shapes shared between the logo vote's server actions and its UI.
 *
 * Here rather than in the actions file because a "use server" module may
 * only export async functions — a type exported beside them fails the
 * build, and the error names the line rather than the rule.
 */
export interface Tally {
  counts: Record<string, {
    votes: number;
    /** Who, by name. A five-person team hiding this from itself is theatre. */
    voters: string[];
    notes: { who: string; note: string }[];
  }>;
  /** How many people have voted at all. */
  ballots: number;
}

export interface Ballot {
  picks: string[];
  notes: Record<string, string>;
}
