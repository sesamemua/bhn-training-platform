import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseFeedbackEvent, reviewerPreferenceHistory, type FeedbackEvent } from './feedback-memory';

/** Page through the append-only history instead of silently truncating older evidence. */
export async function loadFeedbackHistory(reviewId?: string) {
  const events: FeedbackEvent[] = [];
  for (let offset=0;;offset+=500) {
    const rows = await prisma.$queryRaw<{id:string;detail:string}[]>(Prisma.sql`
      SELECT id, detail FROM "ReviewFeedbackMemory"
      ${reviewId ? Prisma.sql`WHERE "reviewId"=${reviewId}` : Prisma.empty}
      ORDER BY "recordedAt" ASC, id ASC LIMIT 500 OFFSET ${offset}`);
    for (const row of rows) { const event = parseFeedbackEvent(row.detail); if (event) events.push(event); }
    if (rows.length < 500) break;
  }
  return { events, reviewers: reviewerPreferenceHistory(events) };
}
