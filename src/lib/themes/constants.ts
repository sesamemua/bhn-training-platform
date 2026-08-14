/**
 * Server-safe shadow of the THEMES registry in
 * src/components/ui/ThemeProvider.tsx.
 *
 * Kept here (rather than imported from the client module) so API
 * routes and server components can validate theme IDs without
 * pulling in a "use client" boundary. Whenever a new theme is
 * registered in ThemeProvider, append its id here too — the two
 * lists must stay in sync.
 */

export const VALID_THEME_IDS = [
  // Classic
  "light",
  "rosalind",
  "mist",
  "hitech",
  // Flavours
  "coldbrew",
  "icecream",
  "dryice",
  "salty",
  "chilli",
  "greenwood",
  "atompunk",
  "aurora",
  // Limited-time
  "sakura",
  "artdeco",
  "canada",
  "endofsummer",
] as const;

export type ThemeId = (typeof VALID_THEME_IDS)[number];

export function isValidThemeId(id: string): id is ThemeId {
  return (VALID_THEME_IDS as readonly string[]).includes(id);
}

export const VOTE_SENTIMENTS = ["favorite", "least_favorite"] as const;
export type VoteSentiment = (typeof VOTE_SENTIMENTS)[number];

export function isValidSentiment(s: string): s is VoteSentiment {
  return (VOTE_SENTIMENTS as readonly string[]).includes(s);
}

/** Pretty labels for the two sentiments — drives UI copy. */
export const SENTIMENT_LABELS: Record<VoteSentiment, string> = {
  favorite: "Favourite",
  least_favorite: "Least favourite",
};

/**
 * Maximum votes per (user, sentiment) — users can pick up to this
 * many favourites AND up to this many least-favourites. Enforced at
 * the POST /api/themes/vote layer; the schema only enforces that
 * the same (user, sentiment, themeId) triple isn't duplicated.
 *
 * Keep in sync with the cap copy in the user-facing voting UI.
 */
export const MAX_VOTES_PER_SENTIMENT = 3;

export const THEME_PROPOSAL_STATUSES = [
  "submitted",
  "under_review",
  "building",
  "shipped",
  "declined",
] as const;
export type ThemeProposalStatus = (typeof THEME_PROPOSAL_STATUSES)[number];

export function isValidProposalStatus(s: string): s is ThemeProposalStatus {
  return (THEME_PROPOSAL_STATUSES as readonly string[]).includes(s);
}

/** Status → user-facing label + RAG bucket. */
export const PROPOSAL_STATUS_META: Record<
  ThemeProposalStatus,
  { label: string; rag: "grey" | "amber" | "sky" | "green" | "rose"; description: string }
> = {
  submitted: {
    label: "Submitted",
    rag: "grey",
    description: "We've got it. Admin hasn't reviewed yet.",
  },
  under_review: {
    label: "Under review",
    rag: "amber",
    description: "An admin is deciding whether to build this.",
  },
  building: {
    label: "Building",
    rag: "sky",
    description: "We liked it. The theme is being built right now.",
  },
  shipped: {
    label: "Shipped",
    rag: "green",
    description: "Your theme is live on the platform.",
  },
  declined: {
    label: "Not this time",
    rag: "rose",
    description: "We aren't building this one. The reviewer note explains why.",
  },
};

/**
 * Proposal-form size limits — used by both client form (UX) and
 * server validation (defence). Keep them in sync.
 */
export const PROPOSAL_LIMITS = {
  title: { min: 5, max: 100 },
  description: { min: 20, max: 2000 },
  inspiration: { min: 0, max: 500 },
  reviewerNote: { min: 0, max: 1000 },
} as const;
