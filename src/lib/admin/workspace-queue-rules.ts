/**
 * Workspace queue rules — the pure half of "waiting on you".
 *
 * Every rule that decides whether a row is waiting on a person lives here,
 * with no Prisma client in scope, so the sidebar badge, the lane on
 * /admin/workspace and the unit tests all read the SAME predicate. The
 * fetcher (workspace-queue.ts) only runs these against the database.
 *
 * Counterpart to queue-counts.ts, which badges the LMS half (credits,
 * enrolments, role requests). Kept apart so that module can go when the
 * LMS half does.
 *
 * What counts as a queue: something a person has to DO — review, approve,
 * decide, send. A closing deadline is a date, not a debt, so it goes in
 * "Coming up"; a stale eligibility list is a signal, so it goes in
 * "Needs a look" and never on a badge. A badge that never clears trains
 * people to ignore badges.
 *
 * Relative imports on purpose: tests load this file through Node's
 * runner, and the modules it leans on are pure too.
 */
import type { Prisma } from "@prisma/client";
import { EVENT_SLUG as SYMPOSIUM_EVENT_SLUG } from "../allocation/symposium-2026";
import { eligibilityGate, type RosterState } from "../eligibility/gate";

export { SYMPOSIUM_EVENT_SLUG };

/** BhnEvent slug seeded by scripts/seed-industry-insights-event.ts. The
 *  Sidebar's Industry Insights item links to it by the same literal. */
export const INSIGHTS_EVENT_SLUG = "2026-industry-insights";

export type WorkspaceBadgeKey =
  | "equip-review"
  | "social-attention"
  | "speakers-new-symposium"
  | "speakers-new-insights"
  | "training-bookings-pending"
  | "newsletter-attention"
  | "brain-picks-open"
  | "workspace-total";

export const WORKSPACE_BADGE_KEYS: readonly WorkspaceBadgeKey[] = [
  "equip-review",
  "social-attention",
  "speakers-new-symposium",
  "speakers-new-insights",
  "training-bookings-pending",
  "newsletter-attention",
  "brain-picks-open",
  "workspace-total",
];

export type WorkspaceQueueCounts = Partial<Record<WorkspaceBadgeKey, number>>;

/** "YYYY-MM-DD" on the Toronto calendar — the one the newsletter's
 *  milestone strings are written in. Same expression the daily
 *  maintenance cron uses; `toISOString().slice(0, 10)` would be UTC and
 *  a day ahead every evening. */
export function torontoToday(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

// ── Speakers: "new since an admin last opened the page" ────────────────
// Speaker has no reviewed column and the manager has no per-row review
// action to hang one on, so "new" is the pattern employer-intake already
// uses: a PlatformSetting timestamp per event, bumped when the page is
// opened. A resubmission is a new row with a new submittedAt, so it
// badges again.

export function speakersSeenKey(slug: string): string {
  return `speakersSeenAt:${slug}`;
}

export function speakersNewWhere(slug: string, seenAt: Date | null): Prisma.SpeakerWhereInput {
  return { event: { slug }, submittedAt: seenAt ? { gt: seenAt } : { not: null } };
}

// ── EQUIP ──────────────────────────────────────────────────────────────

/** The review queue — what isOpenForReview() in equip/types.ts calls open,
 *  and the line /admin/equip's Open tab draws. pre_screen_approved is the
 *  applicant's turn (Stage 2 is theirs to write), so it is not our debt;
 *  the overview's "in flight" figure includes it because that is a
 *  pipeline count, not a queue. */
export const EQUIP_OPEN_STATUSES = ["submitted", "under_review"] as const;

export function equipOpenWhere(): Prisma.EquipApplicationWhereInput {
  return { status: { in: [...EQUIP_OPEN_STATUSES] } };
}

export const EQUIP_STALLED_SUBMITTED_DAYS = 7;
export const EQUIP_STALLED_REVIEW_DAYS = 14;

/** Untouched for too long — a signal, not a count on a badge. */
export function equipStalledWhere(now: Date): Prisma.EquipApplicationWhereInput {
  const day = 86_400_000;
  return {
    OR: [
      { status: "submitted", submittedAt: { lt: new Date(now.getTime() - EQUIP_STALLED_SUBMITTED_DAYS * day) } },
      { status: "under_review", reviewedAt: { lt: new Date(now.getTime() - EQUIP_STALLED_REVIEW_DAYS * day) } },
    ],
  };
}

// ── Social ─────────────────────────────────────────────────────────────
// Nothing publishes itself (the cron drafts, a person posts), so a post
// that is approved or scheduled and past its send time is a human miss,
// not a machine one. Drafts always need a person.

export function socialNeedsAttention(post: { status: string; scheduledFor: Date }, now: Date): boolean {
  if (post.status === "draft") return true;
  if (post.status === "approved" || post.status === "scheduled") {
    return post.scheduledFor.getTime() < now.getTime();
  }
  return false;
}

export function socialAttentionWhere(now: Date): Prisma.SocialPostWhereInput {
  return {
    OR: [
      { status: "draft" },
      { status: { in: ["approved", "scheduled"] }, scheduledFor: { lt: now } },
    ],
  };
}

// ── Training Week ──────────────────────────────────────────────────────
// The registration form's reviewStatus never leaves "pending" — seats are
// decided on workshop bookings (TrainingAdmin's pendingOf), so that is
// the queue.

export function trainingBookingsPendingWhere(): Prisma.WorkshopBookingWhereInput {
  return { status: "pending", workshop: { event: { slug: SYMPOSIUM_EVENT_SLUG } } };
}

// ── Newsletter ─────────────────────────────────────────────────────────
// Reminder dates are calendar strings, compared as strings against
// torontoToday(). A failed send always needs a person; a pending one
// only once its day has come.

export function reminderNeedsAttention(r: { status: string; scheduledFor: string }, today: string): boolean {
  if (r.status === "failed") return true;
  return r.status === "pending" && r.scheduledFor <= today;
}

export function remindersAttentionWhere(today: string): Prisma.NewsletterReminderWhereInput {
  return { OR: [{ status: "failed" }, { status: "pending", scheduledFor: { lte: today } }] };
}

/** Contributions dropped into the issue being produced that no Generate
 *  run has folded in yet. Scoped to that one issue: the workshop only
 *  ever opens the current issue, so a piece left "submitted" in a sent
 *  one can never be normalised and would count forever. No current
 *  issue → nothing to count. */
export function piecesSubmittedWhere(issueId: string | null): Prisma.NewsletterPieceWhereInput | null {
  return issueId ? { status: "submitted", issueId } : null;
}

// ── Brain Picker ───────────────────────────────────────────────────────
// The one per-viewer badge on the board: everything else counts work the
// team owes, this counts what somebody has asked of YOU. A shared count
// would be meaningless — an open question is open for exactly one person.

export function brainPicksOpenWhere(viewerId: string): Prisma.BrainPickWhereInput {
  return { askedOfId: viewerId, status: "open" };
}

// ── Eligibility (a signal, never a badge) ──────────────────────────────

export function rosterStale(state: RosterState, now: Date): boolean {
  return eligibilityGate(state, now).stale;
}

// ── Totals and windows ─────────────────────────────────────────────────

/** Sum of every lane; excludes itself so it can be stored in the map. */
export function workspaceTotal(counts: WorkspaceQueueCounts): number {
  return WORKSPACE_BADGE_KEYS.filter((k) => k !== "workspace-total").reduce(
    (n, k) => n + (counts[k] ?? 0),
    0,
  );
}

export function comingUpWindow(now: Date, days = 30): { from: Date; to: Date } {
  return { from: now, to: new Date(now.getTime() + days * 86_400_000) };
}
