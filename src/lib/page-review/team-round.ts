export type TeamRoundState = { id: string; status: string; teamRound?: number | null; teamRoundStartedAt?: Date | null };

export function versionsSeparateFromTeamRounds(id: string): boolean {
  return id.startsWith("newsletter-") || id.startsWith("social-copy-");
}

export function visibleTeamRound(review: TeamRoundState): number | null {
  if (!versionsSeparateFromTeamRounds(review.id)) return null;
  // Where the historical evidence is missing, use the first tracked pass.
  // Never infer additional handoffs from saves or comment counts.
  return review.teamRound ?? (review.status === "pending" ? null : 1);
}

export function teamRoundMetadata(review: TeamRoundState) {
  if (!versionsSeparateFromTeamRounds(review.id)) return {};
  return { teamRound: visibleTeamRound(review), teamRoundStartedAt: review.teamRoundStartedAt?.toISOString() ?? null };
}

export function isCurrentTeamFeedback(review: TeamRoundState & { round: number }, comment: { round: number; createdAt: Date }) {
  return versionsSeparateFromTeamRounds(review.id) && review.teamRoundStartedAt
    ? +comment.createdAt >= +review.teamRoundStartedAt
    : comment.round === review.round;
}
