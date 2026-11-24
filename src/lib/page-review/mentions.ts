import { prisma } from '@/lib/prisma';
import { staffReviewRecipients } from '@/lib/workspace-review-invites';

type Colleague = { id: string; name: string | null; email: string };
export type ReviewMentionJob = { reviewId: string; commentId: string; round: number; title: string; url: string; body: string; previousBody?: string; actor: { id: string; name: string; email?: string | null } };
const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Match full staff names, never arbitrary addresses or guessed identities. */
export function mentionedColleagues(body: string, people: Colleague[], actorId: string): Colleague[] {
  const counts = new Map<string, number>();
  for (const p of people) if (p.name) counts.set(normalized(p.name), (counts.get(normalized(p.name)) ?? 0) + 1);
  return people.filter(p => p.id !== actorId && p.name && counts.get(normalized(p.name)) === 1 &&
    new RegExp('(?:^|\\s)@' + escaped(p.name.trim()).replace(/\s+/g, '\\s+') + '(?=$|[\\s.,!?;:)])', 'iu').test(body));
}

export async function reviewMentionPeople() {
  const people = await prisma.user.findMany({ where: staffReviewRecipients, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } });
  const names = new Map<string, number>();
  for (const p of people) if (p.name) names.set(normalized(p.name), (names.get(normalized(p.name)) ?? 0) + 1);
  return people.filter(p => p.name && names.get(normalized(p.name)) === 1).map(p => ({ id: p.id, label: p.name! }));
}

/** Persist after the comment commits. Review mentions never send email. */
export async function notifyReviewMentions(job: ReviewMentionJob) {
  if (!job.body.includes('@')) return { sent: 0 };
  try {
    const people = await prisma.user.findMany({ where: staffReviewRecipients, select: { id: true, name: true, email: true } });
    const previous = new Set(mentionedColleagues(job.previousBody ?? '', people, job.actor.id).map(p => p.id));
    const recipients = mentionedColleagues(job.body, people, job.actor.id).filter(p => !previous.has(p.id));
    if (!recipients.length) return { sent: 0 };
    const result = await prisma.auditLog.createMany({ data: recipients.map(recipient => ({
      id: 'review-mention:' + job.commentId + ':' + recipient.id,
      actorId: job.actor.id, action: 'page.review.mention', targetType: 'pageReview', targetId: job.reviewId,
      detail: JSON.stringify({ round: job.round, commentId: job.commentId, recipientId: recipient.id, recipientName: recipient.name, delivery: 'in_app' }),
    })), skipDuplicates: true });
    return { sent: result.count };
  } catch (error) {
    console.error('Review mention notification failed', error);
    return { sent: 0, warning: 'Comment saved, but the in-page notification could not be created.' };
  }
}

type MentionReceipt = { commentId: string; recipientId: string; recipientName?: string; readAt?: string };
function receiptDetail(detail: string | null): MentionReceipt | null {
  try { const value = JSON.parse(detail ?? ''); return typeof value.commentId === 'string' && typeof value.recipientId === 'string' ? value : null; }
  catch { return null; }
}
const recipientScope = (reviewId: string, userId: string) => ({
  action: 'page.review.mention', targetType: 'pageReview', targetId: reviewId,
  detail: { contains: JSON.stringify({ recipientId: userId }).slice(1, -1) },
});

/** Only the signed-in recipient's unread tags in this review; includes pre-existing receipts. */
export async function reviewMentionNotifications(reviewId: string, userId: string) {
  const receipts = await prisma.auditLog.findMany({
    where: { ...recipientScope(reviewId, userId), NOT: { detail: { contains: '"readAt":' } } },
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, detail: true, createdAt: true, actor: { select: { name: true } } },
  });
  const valid = receipts.flatMap(receipt => {
    const detail = receiptDetail(receipt.detail);
    return detail && detail.recipientId === userId && !detail.readAt ? [{ ...receipt, parsed: detail }] : [];
  });
  if (!valid.length) return [];
  const comments = await prisma.pageComment.findMany({
    where: { reviewId, id: { in: valid.map(r => r.parsed.commentId) } },
    select: { id: true, parentId: true, round: true, body: true },
  });
  return valid.flatMap(receipt => {
    const comment = comments.find(c => c.id === receipt.parsed.commentId);
    if (!comment) return [];
    if (receipt.parsed.recipientName && !mentionedColleagues(comment.body, [{ id: userId, name: receipt.parsed.recipientName, email: '' }], '').length) return [];
    return [{ id: receipt.id, commentId: comment.id, threadId: comment.parentId ?? comment.id, round: comment.round,
      body: comment.body, authorName: receipt.actor?.name ?? 'A colleague', createdAt: receipt.createdAt }];
  });
}

/** Acknowledge only this recipient's own receipt; never alter the comment or round. */
export async function acknowledgeReviewMentions(reviewId: string, userId: string, ids: string[]) {
  const receipts = await prisma.auditLog.findMany({ where: { ...recipientScope(reviewId, userId), id: { in: ids } }, select: { id: true, detail: true } });
  let read = 0;
  for (const receipt of receipts) {
    const detail = receiptDetail(receipt.detail);
    if (!detail || detail.recipientId !== userId || detail.readAt) continue;
    const result = await prisma.auditLog.updateMany({ where: { ...recipientScope(reviewId, userId), id: receipt.id }, data: { detail: JSON.stringify({ ...detail, readAt: new Date().toISOString() }) } });
    read += result.count;
  }
  return { read };
}
