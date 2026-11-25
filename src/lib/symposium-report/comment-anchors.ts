import type { Report, ReportPage } from './document';
import { reportBlocks, type Block } from './paginate';

export type ReportAnchorTarget = { field: string; start: number; end: number; quote: string };
type AnchoredComment = { id: string; parentId?: string | null; round: number; anchorQuote: string | null; anchorKey: string | null };
export type AnchorSource = { round: number; report: Report };
type Entry = { page: ReportPage; block: Block; context: string; ordinal: number; count: number };
const comparable = (text: string) => text.normalize('NFKC').replace(/[·\s]+/g, ' ').trim().toLocaleLowerCase();
const heading = (text: string) => comparable(text.replace(/^\s*\d+\s*[\/—–-]\s*/, ''));
function entries(report: Report): Entry[] {
  return report.pages.flatMap(page => {
    const blocks = reportBlocks(page.text), counts = new Map<string, number>();
    for (const block of blocks) if (block.kind === 'heading') counts.set(heading(block.text), (counts.get(heading(block.text)) ?? 0) + 1);
    let topic = '', current = '';
    const ordinals = new Map<string, number>();
    const result = blocks.map(block => {
      if (block.kind === 'heading') { current = heading(block.text); if (counts.get(current) === 1) topic = current; }
      const context = JSON.stringify([topic, current, block.kind]);
      const ordinal = ordinals.get(context) ?? 0; ordinals.set(context, ordinal + 1);
      return { page, block, context, ordinal, count: 0 };
    });
    return result.map(entry => ({ ...entry, count: ordinals.get(entry.context)! }));
  });
}
function target(entry: Entry): ReportAnchorTarget {
  return { field: `page:${entry.page.id}:text`, start: entry.block.start, end: entry.block.start + entry.block.text.length, quote: entry.block.text.slice(0, 600) };
}
function matches(entry: Entry, quote: string) {
  const text = comparable(entry.block.text);
  return text === quote || text.includes(quote);
}
/** Read-only relocation using original review snapshots; never rewrites source comments. */
export function reportCommentTargets<T extends AnchoredComment>(comments: T[], current: Report, sources: AnchorSource[]) {
  const now = entries(current);
  const previous = sources.map(source => ({ round: source.round, entries: entries(source.report) }));
  const resolved = comments.map(comment => {
    let anchorTarget: ReportAnchorTarget | null = null;
    const quote = comparable(comment.anchorQuote ?? '');
    const pageId = /^#report-frame-(.+)-\d+$/.exec(comment.anchorKey ?? '')?.[1].replace(/^publication-team$/, 'publication-leadership');
    const scoped = (list: Entry[]) => pageId ? list.filter(entry => entry.page.id === pageId) : list;
    if (quote && !comment.parentId) {
      const exact = scoped(now).filter(entry => matches(entry, quote));
      if (exact.length === 1) anchorTarget = target(exact[0]);
      else if (!exact.length) {
        // Same-round evidence wins. Other saved sources cover edits made before that snapshot.
        const ordered = [...previous].sort((a, b) => Number(b.round === comment.round) - Number(a.round === comment.round) || b.round - a.round);
        for (const source of ordered) {
          const candidates = scoped(source.entries).filter(entry => matches(entry, quote));
          if (candidates.length !== 1) continue;
          const old = candidates[0];
          const current = scoped(now).filter(entry => entry.page.id === old.page.id && entry.context === old.context);
          // Only a unique passage of this kind in the original section is safe after a full rewrite.
          // Multiple rewritten paragraphs can reorder even when their counts stay equal.
          if (old.count === 1 && current.length === 1) anchorTarget = target(current[0]);
          break;
        }
      }
    }
    return { ...comment, anchorTarget };
  });
  const byId = new Map(resolved.map(comment => [comment.id, comment]));
  return resolved.map(comment => comment.parentId ? { ...comment, anchorTarget: byId.get(comment.parentId)?.anchorTarget ?? null } : comment);
}

/** DOM-side verification, shared by workspace navigation and the injected review overlay. */
export function findReportTarget(doc: Document, target: ReportAnchorTarget | null | undefined): HTMLElement | null {
  if (!target || typeof target.field !== 'string' || !Number.isInteger(target.start) || !Number.isInteger(target.end) || typeof target.quote !== 'string' || !target.quote.trim()) return null;
  const quote = target.quote.normalize('NFKC').replace(/[·\s]+/g, ' ').trim().toLocaleLowerCase();
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>('[data-report-paper] [data-report-field][data-report-text-start]'));
  return nodes.find(node => {
    if (node.getAttribute('data-report-field') !== target.field) return false;
    const start = Number(node.getAttribute('data-report-text-start')), end = Number(node.getAttribute('data-report-text-end'));
    if (start < target.start || start >= target.end || end <= target.start) return false;
    const text = (node.textContent ?? '').normalize('NFKC').replace(/[·\s]+/g, ' ').trim().toLocaleLowerCase();
    return !!text && (text.includes(quote) || (text.length >= 20 && quote.includes(text)));
  }) ?? null;
}
