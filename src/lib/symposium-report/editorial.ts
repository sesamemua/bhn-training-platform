import { reportBlocks, type Block } from './paginate';
import type { ReportPage } from './document';

export const publicationPage = (page: ReportPage) => page.id === 'publication-leadership' || page.id === 'publication-team';
export const pairedProfile = (page: ReportPage) => page.id === 'venturelift' || publicationPage(page);
export function editorialParts(page: ReportPage, block: Block): { text: string; kind: string }[] {
  if (page.id === 'career-conversations' && block.kind === 'paragraph') {
    return block.text.split(/(?<=\n)/).map((text, i) => ({ text, kind: i === 0 ? 'profileName' : i === 1 ? 'profileTitle' : 'profileAffiliation' }));
  }
  if (block.kind === 'quote' && block.text.includes('\n— ')) {
    const at = block.text.indexOf('\n— ');
    return [{ text: block.text.slice(0, at + 1), kind: 'quoteBody' }, ...block.text.slice(at + 1).split(/(?<=\n)/).map((text, i) => ({ text, kind: i === 0 ? 'quoteName' : 'quoteAttribution' }))];
  }
  return [{ text: block.text, kind: '' }];
}
export function quotePosition(page: ReportPage, block: Block) {
  if (page.id !== 'structured-networking' || block.kind !== 'quote') return undefined;
  const quotes = reportBlocks(page.text).filter(b => b.kind === 'quote');
  const current = quotes.find(b => b.start <= block.start && b.start + b.text.length >= block.start + block.text.length) ?? block;
  if (!/— (Alex Kamp|Jasmine Hamilton|Morty Soley|Sunny Peiwei|Xunuo Cao|Maidah|Anonymous)/.test(current.text)) return undefined;
  const role = /— (Alex Kamp|Jasmine Hamilton|Morty Soley)/.test(current.text) ? 'Mentor' : /— (Sunny Peiwei|Xunuo Cao|Maidah)/.test(current.text) ? 'HQP' : 'Program staff';
  const same = quotes.filter(b => role === 'Mentor' ? /— (Alex Kamp|Jasmine Hamilton|Morty Soley)/.test(b.text) : role === 'HQP' ? /— (Sunny Peiwei|Xunuo Cao|Maidah)/.test(b.text) : /— Anonymous/.test(b.text));
  return { role, column: role === 'Mentor' ? '1' : role === 'HQP' ? '2' : '1 / -1', row: role === 'Program staff' ? '6' : String(same.indexOf(current) + 3) };
}
