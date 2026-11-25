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

/** Include native review projects and retained histories of deleted reviews in the filter. */
export async function loadFeedbackProjects() {
  const [active, stored] = await Promise.all([
    prisma.pageReview.findMany({ select: { id: true, title: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.$queryRaw<{ id: string; title: string }[]>(Prisma.sql`
      SELECT DISTINCT ON ("reviewId") "reviewId" AS id, detail::jsonb->'review'->>'title' AS title
      FROM "ReviewFeedbackMemory"
      WHERE detail::jsonb->>'schema'='1' AND jsonb_typeof(detail::jsonb->'review'->'title')='string'
      ORDER BY "reviewId", "recordedAt" DESC, "ReviewFeedbackMemory".id DESC`),
  ]);
  const projects = new Map(stored.map(row=>[row.id,row]));
  for (const row of active) projects.set(row.id,row);
  return [...projects.values()].sort((a,b)=>a.title.localeCompare(b.title));
}
