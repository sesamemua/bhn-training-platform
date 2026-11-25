import { reportBlocks, type Block } from './paginate';
import type { ReportPage } from './document';

export const publicationPage = (page: ReportPage) => page.id === 'publication-leadership' || page.id === 'publication-team';
export const pairedProfile = (page: ReportPage) => page.id === 'venturelift' || page.id === 'program-impact' || publicationPage(page);
export function editorialParts(page: ReportPage, block: Block): { text: string; kind: string }[] {
  if (/^(Moderator|Panelists|Discussion Leads?):/.test(block.text)) {
    return block.text.split(/((?:^|\n)(?:Moderator|Panelists|Discussion Leads?):)/).filter(Boolean).map(text => ({ text, kind: /^(Moderator|Panelists|Discussion Leads?):$/.test(text.trim()) ? 'panelLabel' : '' }));
  }
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
  if(!/— (Alex Kamp|Jasmine Hamilton|Morty Soley|Sunny Peiwei|Xunuo Cao|Maidah|Anonymous|Administrative staff)/.test(current.text))return undefined;
  const role = /— (Alex Kamp|Jasmine Hamilton|Morty Soley)/.test(current.text) ? 'Mentor' : /— (Sunny Peiwei|Xunuo Cao|Maidah)/.test(current.text) ? 'HQP' : 'Participant';
  const same = quotes.filter(b => role === 'Mentor' ? /— (Alex Kamp|Jasmine Hamilton|Morty Soley)/.test(b.text) : role === 'HQP' ? /— (Sunny Peiwei|Xunuo Cao|Maidah)/.test(b.text) : !/— (Alex Kamp|Jasmine Hamilton|Morty Soley|Sunny Peiwei|Xunuo Cao|Maidah)/.test(b.text));
  return { role, column: role === 'Mentor' ? '1' : '2', row: role === 'Participant' ? String(same.indexOf(current) + 6) : String(same.indexOf(current) + 3) };
}
export function teamGroup(page: ReportPage, block: Block) {
  if(page.id !== 'publication-leadership' || !page.text.startsWith('## Leadership Team') || block.kind === 'heading')return undefined;
  const heading=reportBlocks(page.text).findLast(b=>b.kind==='heading'&&b.start<block.start)?.text;
  return heading==='Leadership Team'?'leadership':heading==='Program Team'?'program':'partners';
}

/** Requested publication links; report text stays the editable source. */
export const editorialAction = (page: ReportPage, block: Block) => page.id === 'program-impact' && block.text.trim() === 'BioHubNet Online Training Platform' ? 'https://app.biohubnet.ca/userlogin/'
  : page.id === 'symposium-feedback' && block.text.trim() === 'Complete the Annual Symposium feedback form' ? 'https://docs.google.com/forms/d/e/1FAIpQLSeDtLSMZESQ849RL-pA4NU5TihYwxojHrdW5jMnSyVCfUdZKg/viewform'
  : publicationPage(page) && block.text.startsWith('BioHubNet is funded by the Canada Biomedical Research Fund (CBRF).') ? 'https://sshrc-crsh.canada.ca/funding-financement/cbrf-frbc/index-eng.aspx' : undefined;

/** Venture titles belong to the same row as their description and swappable photo. */
export const ventureHeading = (page: ReportPage, blocks: Block[], index: number) => page.id === 'venturelift' && blocks[index]?.photoRow && blocks[index - 1]?.kind === 'heading' ? blocks[index - 1] : undefined;
