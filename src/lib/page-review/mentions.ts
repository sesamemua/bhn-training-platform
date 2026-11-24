import { prisma } from '@/lib/prisma';
import { mailConfigured, sendMail } from '@/lib/mail';
import { staffReviewRecipients } from '@/lib/workspace-review-invites';
import { SOCIAL_COPY_REVIEW_PREFIX, socialCopyReviewPath } from '@/lib/social/copy-review';
import { REPORT_ID, REPORT_REVIEW_PATH } from '@/lib/symposium-report/document';

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

/** Called after the comment transaction commits; mail failure never loses the comment. */
export async function notifyReviewMentions(job: ReviewMentionJob) {
  if (!job.body.includes('@')) return { sent: 0 };
  try {
    const people = await prisma.user.findMany({ where: staffReviewRecipients, select: { id: true, name: true, email: true } });
    const previous = new Set(mentionedColleagues(job.previousBody ?? '', people, job.actor.id).map(p => p.id));
    const recipients = mentionedColleagues(job.body, people, job.actor.id).filter(p => !previous.has(p.id));
    if (!recipients.length) return { sent: 0 };
    if (!mailConfigured()) return { sent: 0, warning: 'Comment saved. Mention emails are unavailable because email is not configured.' };
    const path = job.reviewId === REPORT_ID ? REPORT_REVIEW_PATH : job.reviewId.startsWith(SOCIAL_COPY_REVIEW_PREFIX) ? socialCopyReviewPath(job.reviewId.slice(SOCIAL_COPY_REVIEW_PREFIX.length)) : '/admin/workspace/website-review';
    const link = new URL(path, process.env.NEXTAUTH_URL || 'https://bhn-training-platform.vercel.app');
    link.searchParams.set('review', job.reviewId); link.searchParams.set('comment', job.commentId);
    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      // Stable receipt prevents reloads, repeated edits and concurrent requests from emailing twice.
      const receipt = 'review-mention:' + job.commentId + ':' + recipient.id;
      const detail = { round: job.round, commentId: job.commentId, recipientId: recipient.id, delivery: 'pending' };
      const claim = await prisma.auditLog.createMany({ data: [{ id: receipt, actorId: job.actor.id, action: 'page.review.mention', targetType: 'pageReview', targetId: job.reviewId, detail: JSON.stringify(detail) }], skipDuplicates: true });
      if (!claim.count) continue;
      try {
        await sendMail({ to: recipient.email, replyTo: job.actor.email ?? undefined,
          subject: `${job.actor.name} mentioned you: ${job.title}`.replace(/[\r\n]+/g, ' '),
          text: `Hello ${recipient.name},\n\n${job.actor.name} tagged you in a Round ${job.round} review comment on ${job.title}:\n\n${job.body}\n\nOpen the review:\n${link.href}\n\nSign in with your BioHubNet staff account. If the round is locked, wait until the next round opens to reply.` });
        sent++; detail.delivery = 'sent';
      } catch { failed++; detail.delivery = 'failed'; }
      await prisma.auditLog.update({ where: { id: receipt }, data: { detail: JSON.stringify(detail) } });
    }
    return { sent, ...(failed ? { warning: 'Comment saved, but some mention emails could not be delivered.' } : {}) };
  } catch (error) { console.error('Review mention notification failed', error); return { sent: 0, warning: 'Comment saved, but mention emails could not be delivered.' }; }
}
