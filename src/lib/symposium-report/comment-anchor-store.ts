import { prisma } from '@/lib/prisma';
import { reportSchema, type Report } from './document';
import { reportCommentTargets, type AnchorSource } from './comment-anchors';
import { REPORT_EDIT_ACTION } from './changes';

type Comment = { id: string; parentId: string | null; round: number; anchorQuote: string | null; anchorKey: string | null; anchorPath: string | null };
/** Enrich reads only: original comment quotes/selectors and historical snapshots remain evidence. */
export async function commentsWithReportTargets<T extends Comment>(comments: T[], current: Report, round: number, versions: { round: number; html: string }[]) {
  const sources: AnchorSource[] = versions.flatMap(version => {
    try { const parsed = reportSchema.safeParse(JSON.parse(version.html)); return parsed.success ? [{ round: version.round, report: parsed.data }] : []; } catch { return []; }
  });
  let resolved = reportCommentTargets(comments, current, sources);
  // In-round rewrites may predate the next snapshot. Existing edit audits retain their before-text.
  const missing = resolved.some(comment => !comment.parentId && comment.round === round && comment.anchorQuote && !comment.anchorTarget && !/img|figure|svg|footer|header/.test(comment.anchorPath ?? ''));
  if (missing) {
    const edits = await prisma.auditLog.findMany({
      where: { action: REPORT_EDIT_ACTION, targetType: 'pageReview', targetId: 'symposium-2026-event-report', detail: { contains: `"round":${round},` } },
      orderBy: { createdAt: 'desc' }, take: 300, select: { detail: true },
    });
    for (const edit of edits) {
      try {
        const detail = JSON.parse(edit.detail ?? '');
        if (!Array.isArray(detail.changes)) continue;
        for (const change of detail.changes) {
          const id = /^page:([a-z0-9-]+):text$/.exec(change.key ?? '')?.[1];
          const page = current.pages.find(page => page.id === id);
          if (!page) continue;
          for (const text of [change.before, change.after]) if (typeof text === 'string' && text.length <= 16000) sources.push({ round, report: { ...current, pages: [{ ...page, text }] } });
        }
      } catch { /* An old malformed audit cannot turn a stale selector into a valid target. */ }
    }
    resolved = reportCommentTargets(comments, current, sources);
  }
  return resolved;
}
