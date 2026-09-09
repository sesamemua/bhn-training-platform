/**
 * Workspace queue fetcher — runs the rules in workspace-queue-rules.ts
 * against the database. Same contract as queue-counts.ts: one
 * Promise.all of indexed counts, every failure swallowed to 0 so a
 * one-table problem never takes the sidebar down, no auth check here
 * (the layout gates on role before calling).
 */
import { prisma } from "@/lib/prisma";
import { currentCycle } from "@/lib/newsletter/currentIssue";
import {
  INSIGHTS_EVENT_SLUG,
  SYMPOSIUM_EVENT_SLUG,
  equipOpenWhere,
  piecesSubmittedWhere,
  remindersAttentionWhere,
  brainPicksOpenWhere,
  socialAttentionWhere,
  speakersNewWhere,
  speakersSeenKey,
  torontoToday,
  trainingBookingsPendingWhere,
  workspaceTotal,
  type WorkspaceQueueCounts,
} from "./workspace-queue-rules";

/** When an admin last opened each event's Headshots & Bios page. Null =
 *  never, so every intake submission counts as new until the first visit. */
export async function speakersSeenAt(slugs: readonly string[]): Promise<Record<string, Date | null>> {
  const rows = await prisma.platformSetting
    .findMany({ where: { key: { in: slugs.map(speakersSeenKey) } }, select: { key: true, value: true } })
    .catch(() => [] as { key: string; value: string }[]);
  const out: Record<string, Date | null> = {};
  for (const slug of slugs) {
    const value = rows.find((r) => r.key === speakersSeenKey(slug))?.value;
    out[slug] = value ? new Date(value) : null;
  }
  return out;
}

/** Clears an event's speakers badge until newer submissions land. Called
 *  by POST /api/admin/speakers/[slug]/seen, which the Headshots & Bios
 *  pages fire from the browser once they are on screen — never from a
 *  render, which prefetches and previews also trigger. */
export async function markSpeakersSeen(slug: string, now = new Date()): Promise<void> {
  const key = speakersSeenKey(slug);
  const value = now.toISOString();
  await prisma.platformSetting
    .upsert({ where: { key }, update: { value }, create: { key, value } })
    .catch(() => {});
}

/**
 * @param viewerId  Who is looking. Only the Brain Picker badge needs it —
 *   an open question is open for one person, not for the team — so it is
 *   optional and that one count is simply absent without it.
 */
export async function getWorkspaceQueueCounts(
  now = new Date(),
  viewerId?: string | null,
): Promise<WorkspaceQueueCounts> {
  const today = torontoToday(now);
  // Two lookups the counts depend on: when each speakers page was last
  // opened, and which newsletter issue is the one being produced.
  // currentCycle() is read-only (resolveCurrentIssue is the one that writes).
  const [seen, cycle] = await Promise.all([
    speakersSeenAt([SYMPOSIUM_EVENT_SLUG, INSIGHTS_EVENT_SLUG]),
    currentCycle(today).catch(() => null),
  ]);
  const piecesWhere = piecesSubmittedWhere(cycle?.issueId ?? null);

  const [equip, social, speakersSymposium, speakersInsights, bookings, reminders, pieces, brainPicks] = await Promise.all([
    prisma.equipApplication.count({ where: equipOpenWhere() }).catch(() => 0),
    prisma.socialPost.count({ where: socialAttentionWhere(now) }).catch(() => 0),
    prisma.speaker.count({ where: speakersNewWhere(SYMPOSIUM_EVENT_SLUG, seen[SYMPOSIUM_EVENT_SLUG]) }).catch(() => 0),
    prisma.speaker.count({ where: speakersNewWhere(INSIGHTS_EVENT_SLUG, seen[INSIGHTS_EVENT_SLUG]) }).catch(() => 0),
    prisma.workshopBooking.count({ where: trainingBookingsPendingWhere() }).catch(() => 0),
    prisma.newsletterReminder.count({ where: remindersAttentionWhere(today) }).catch(() => 0),
    piecesWhere ? prisma.newsletterPiece.count({ where: piecesWhere }).catch(() => 0) : Promise.resolve(0),
    viewerId
      ? prisma.brainPick.count({ where: brainPicksOpenWhere(viewerId) }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  const counts: WorkspaceQueueCounts = {
    "equip-review":              equip,
    "social-attention":          social,
    "speakers-new-symposium":    speakersSymposium,
    "speakers-new-insights":     speakersInsights,
    "training-bookings-pending": bookings,
    "newsletter-attention":      reminders + pieces,
    "brain-picks-open":          brainPicks,
  };
  counts["workspace-total"] = workspaceTotal(counts);
  return counts;
}
