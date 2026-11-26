/**
 * Inline edits in the full-page reviewer autosave every couple of seconds.
 * Only the first edit after an explicit save starts a new version; later
 * autosaves fold into it, so history lists saves, not keystroke checkpoints.
 */
export const INLINE_EDIT_ACTIONS = ["newsletter.review.text-edit", "newsletter.review.image-edit"];

/** Audit detail substring that marks a version as produced by an inline edit. */
export const producedByInlineEdit = (round: number) => `"nextRound":${round},`;

/** Versions that came out of an inline autosave (from the audit details). */
export function inlineEditRounds(details: (string | null)[]): Set<number> {
  const rounds = new Set<number>();
  for (const detail of details) {
    const next = /"nextRound":(\d+),/.exec(detail ?? "")?.[1];
    if (next) rounds.add(Number(next));
  }
  return rounds;
}

type Version = { round: number; savedAt: string | null; autosaves?: number; fromRound?: number };

/**
 * History rows for the version list. `archivedAt[r]` is when version r was
 * replaced, so version r was created when r−1 was archived. Consecutive
 * inline-edit versions collapse into the last one of the run.
 */
export function versionRows(archivedAt: Map<number, string>, current: number, createdAt: string, inline: Set<number>): Version[] {
  const rows: Version[] = [];
  for (let round = 1; round <= current; round++) {
    if (round < current && !archivedAt.has(round)) continue;
    const savedAt = round === 1 ? createdAt : archivedAt.get(round - 1) ?? null;
    const prev = rows[rows.length - 1];
    if (inline.has(round) && prev && prev.round === round - 1 && inline.has(prev.round)) {
      rows[rows.length - 1] = { round, savedAt, autosaves: (prev.autosaves ?? 1) + 1, fromRound: prev.fromRound ?? prev.round };
    } else rows.push(inline.has(round) ? { round, savedAt, autosaves: 1 } : { round, savedAt });
  }
  return rows;
}
