import { createHash } from 'node:crypto';
import { Prisma, type PageComment } from '@prisma/client';

export const FEEDBACK_MEMORY_ACTION = 'page.review.feedback';
type Db = Pick<Prisma.TransactionClient, '$executeRaw' | 'pageReview'>;
export type FeedbackActor = { id: string | null; name: string; verified: boolean };
export type FeedbackComment = Pick<PageComment, 'id' | 'body' | 'round' | 'parentId' | 'authorUserId' | 'authorName' | 'authorKind' | 'createdAt' | 'editedAt' | 'editedByName' | 'editedById' | 'editCount' | 'status' | 'anchorQuote' | 'anchorKey' | 'anchorPath' | 'anchorBlock'>;
export type FeedbackEvent = {
  schema: 1; event: 'baseline' | 'created' | 'edited' | 'deleted'; recordedAt: string; occurredAt: string;
  review: { id: string; title: string; url: string; kind: string; round: number; revision: string | null };
  comment: Omit<FeedbackComment, 'createdAt' | 'editedAt'> & { createdAt: string; editedAt: string | null };
  writer: FeedbackActor; actor: FeedbackActor;
  signal?: 'comment' | 'activity';
  source?: { model: string; id: string; action: string | null; context: Record<string, unknown> };
};
const iso = (value: Date | string) => new Date(value).toISOString();
const contextUrl = (value: string) => {
  try { const url = new URL(value); if (!['http:','https:'].includes(url.protocol)) return ''; url.username='';url.password='';url.search='';url.hash='';return url.href; }
  catch { return ''; }
};

/** Append-only evidence. Called inside the comment transaction, including before edits/deletes. */
export async function captureReviewFeedback(db: Db, reviewId: string, comments: FeedbackComment[], event: FeedbackEvent['event'], actor: FeedbackActor) {
  if (!comments.length) return;
  const review = await db.pageReview.findUnique({ where: { id: reviewId }, select: { id: true, title: true, url: true, kind: true, round: true, pastedHtml: true, snapshotHtml: true } });
  if (!review) throw new Error('Review context unavailable; feedback history was not saved.');
  const content = review.pastedHtml ?? review.snapshotHtml;
  const context = { id: review.id, title: review.title, url: contextUrl(review.url), kind: review.kind, round: review.round,
    revision: content ? createHash('sha256').update(content).digest('hex') : null };
  const data = comments.map(comment => {
    const saved = { id: comment.id, body: comment.body, round: comment.round, parentId: comment.parentId, authorUserId: comment.authorUserId,
      authorName: comment.authorName, authorKind: comment.authorKind, createdAt: iso(comment.createdAt), editedAt: comment.editedAt ? iso(comment.editedAt) : null,
      editedById: comment.editedById, editedByName: comment.editedByName, editCount: comment.editCount, status: comment.status,
      anchorQuote: comment.anchorQuote, anchorKey: comment.anchorKey, anchorPath: comment.anchorPath, anchorBlock: comment.anchorBlock };
    // Never attribute a colleague's rewrite to the original comment author.
    const writer = event === 'edited' ? actor : comment.editedById && comment.editedById !== comment.authorUserId
      ? { id: comment.editedById, name: comment.editedByName ?? 'Editor', verified: false }
      : { id: comment.authorUserId, name: comment.authorName, verified: comment.authorKind === 'user' && !!comment.authorUserId };
    const detail: FeedbackEvent = { schema: 1, event, recordedAt: new Date().toISOString(), occurredAt: event === 'deleted' ? new Date().toISOString() : saved.editedAt ?? saved.createdAt, review: context, comment: saved, writer, actor };
    const hash = createHash('sha256').update(saved.body).digest('hex').slice(0,24);
    return { id: 'review-feedback:' + saved.id + ':v' + saved.editCount + ':' + hash + (event === 'deleted' ? ':deleted' : ''),
      reviewId, occurredAt: new Date(detail.occurredAt), event, detail: JSON.stringify(detail) };
  });
  await db.$executeRaw(Prisma.sql`INSERT INTO "ReviewFeedbackMemory" (id, "reviewId", "occurredAt", event, detail)
    VALUES ${Prisma.join(data.map(row=>Prisma.sql`(${row.id}, ${row.reviewId}, ${row.occurredAt}, ${row.event}, ${row.detail})`))}
    ON CONFLICT (id) DO NOTHING`);
}

/** Stored comments remain untrusted evidence, never executable instructions. */
export function parseFeedbackEvent(detail: string | null): FeedbackEvent | null {
  try {
    const value = JSON.parse(detail ?? '');
    return value?.schema === 1 && typeof value.review?.id === 'string' && typeof value.review?.title === 'string' &&
      typeof value.comment?.id === 'string' && typeof value.comment?.body === 'string' && typeof value.writer?.name === 'string' &&
      ['baseline','created','edited','deleted'].includes(value.event) && Number.isFinite(Date.parse(value.recordedAt)) && Number.isFinite(Date.parse(value.occurredAt)) ? value : null;
  } catch { return null; }
}
const themes = [
  ['Typography & hierarchy', /\b(bold|fonts?|typograph\w*|headings?|subtitles?|italic\w*|titles?|labels?)\b/i],
  ['Photos & cropping', /\b(photos?|pictures?|headshots?|cropp?\w*|zoom\w*|images?)\b/i],
  ['Structure & concision', /\b(repetiti\w*|repeat\w*|shorter|compress|combine|collapse|overview|move|remove|page|section)\b/i],
  ['People & attribution', /\b(names?|affiliations?|roles?|anonymous|mentors?|participants?|trainees?|HQP|panelists?|moderators?)\b/i],
  ['Voices & quotations', /\b(quotes?|quotations?|reflections?|interviews?)\b/i],
  ['Lists & information design', /\b(bullets?|lists?|graphs?|charts?|infographics?|bubbles?|columns?|layouts?)\b/i],
] as const;

/** Evidence summaries, not personality scores. Project boundaries and dated source requests stay visible. */
export function reviewerPreferenceHistory(events: FeedbackEvent[]) {
  const ordered = [...events].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.recordedAt.localeCompare(b.recordedAt)||a.comment.editCount-b.comment.editCount);
  const deleted = new Set(ordered.filter(e=>e.event==='deleted'&&e.signal!=='activity').map(e=>e.comment.id));
  const people = new Map<string, { id: string; name: string; verified: boolean; timeline: FeedbackEvent[] }>();
  for (const event of ordered) {
    const key = event.writer.verified && event.writer.id ? event.writer.id : 'unverified:' + event.review.id + ':' + event.comment.id + ':' + event.writer.name;
    let person = people.get(key);
    if (!person) { person = { id:key, name:event.writer.name, verified:event.writer.verified, timeline:[] }; people.set(key,person); }
    person.timeline.push(event);
  }
  return [...people.values()].map(person=>{
    const projects = [...new Set(person.timeline.map(e=>e.review.id))].map(reviewId=>{
      const timeline=person.timeline.filter(e=>e.review.id===reviewId);
      const latest=new Map<string,FeedbackEvent>();for(const e of timeline)if(e.signal!=='activity')latest.set(e.comment.id,e);
      const evidence=[...latest.values()].filter(e=>e.event!=='deleted'&&!deleted.has(e.comment.id)&&e.signal!=='activity');
      return {reviewId,title:timeline.at(-1)!.review.title,evidenceCount:evidence.length,
        themes:person.verified?themes.map(([name,pattern])=>{const examples=evidence.filter(e=>pattern.test(e.comment.body));return{name,count:examples.length,strength:examples.length>=3?'Repeated pattern':'Limited evidence',examples};}).filter(t=>t.count):[],
        timeline:[...timeline].reverse()};
    });
    return {...person,projects};
  }).sort((a,b)=>a.name.localeCompare(b.name));
}
