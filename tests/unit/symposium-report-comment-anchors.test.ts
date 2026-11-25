import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { reportCommentTargets, findReportTarget } from '../../src/lib/symposium-report/comment-anchors';
import { reportBlocks } from '../../src/lib/symposium-report/paginate';
import type { Report } from '../../src/lib/symposium-report/document';
const document = (text: string): Report => ({ cover: { title: 'Report', theme: 'Theme', date: 'October' }, pages: [{ id: 'training-week', title: 'Training', label: 'Training', text, frames: 1 }], back: { title: 'Connect', text: 'Community' } });
const comment = { id: 'original', round: 8, parentId: null, anchorQuote: 'The old communication workshop description.', anchorKey: '#report-frame-training-week-2' };
const before = document('## CCRM tour\n\nThe old CCRM description.\n\n## Communication workshop\n\nThe old communication workshop description.\n\n## Negotiation\n\nThe old negotiation description.');
const after = document('## New workshop\n\nA new page and event.\n\n## CCRM tour\n\nRevised CCRM text.\n\n## Communication workshop\n\nRevised communication text.\n\n## Negotiation\n\nRevised negotiation text.');
test('rewritten comments relocate by original heading context, preserving exact evidence and reply identity', () => {
 const input = [comment, { ...comment, id: 'reply', parentId: 'original' }]; const unchanged = JSON.stringify(input);
 const result = reportCommentTargets(input, after, [{ round: 8, report: before }]);
 assert.equal(result[0].anchorTarget?.quote, 'Revised communication text.'); assert.equal(result[0].anchorTarget?.start, after.pages[0].text.indexOf('Revised communication text.'));
 assert.deepEqual(result[1].anchorTarget, result[0].anchorTarget); assert.equal(result[1].id, 'reply'); assert.equal(result[0].anchorKey, comment.anchorKey); assert.equal(result[0].anchorQuote, comment.anchorQuote); assert.equal(JSON.stringify(input), unchanged);
});
test('repeated Challenges and Opportunities headings retain their unique discussion topic context', () => {
 const old = document('## Topic one\n\n## Challenges\n\nFirst old text.\n\n## Opportunities\n\nFirst opportunity.\n\n## Topic two\n\n## Challenges\n\nSecond old text.\n\n## Opportunities\n\nSecond opportunity.');
 const current = document(old.pages[0].text.replace('First old text.', 'First revised text.').replace('Second old text.', 'Second revised text.'));
 const result = reportCommentTargets([{ ...comment, anchorQuote: 'Second old text.' }], current, [{ round: 8, report: old }]); assert.equal(result[0].anchorTarget?.quote, 'Second revised text.');
});
test('deleted or ambiguous passages remain unresolved rather than guessing by old position', () => {
 for (const text of ['## CCRM tour\n\nRevised CCRM text.', '## Communication workshop\n\nNew first paragraph.\n\nNew second paragraph.']) {
  assert.equal(reportCommentTargets([comment], document(text), [{ round: 8, report: before }])[0].anchorTarget, null);
 }
 assert.equal(reportCommentTargets([comment], after, [])[0].anchorTarget, null);
});
test('an unchanged quote is found after moving and report snapshots do not override a current exact match', () => {
 const current = document('## New workshop\n\nNew intro.\n\n## Communication workshop\n\n' + comment.anchorQuote);
 assert.equal(reportCommentTargets([comment], current, [{ round: 8, report: before }])[0].anchorTarget?.start, current.pages[0].text.indexOf(comment.anchorQuote));
});
test('DOM verification accepts matching continuation fragments but rejects stale or forged ranges', () => {
 const block = reportBlocks(after.pages[0].text).find(block => block.text === 'Revised communication text.')!;
 const resolved = reportCommentTargets([comment], after, [{ round: 8, report: before }])[0].anchorTarget!;
 const doc = new JSDOM(`<main data-report-paper><p id="correct" data-report-field="page:training-week:text" data-report-text-start="${block.start}" data-report-text-end="${block.start + block.text.length}">${block.text}</p></main>`).window.document;
 assert.equal(findReportTarget(doc, resolved)?.id, 'correct'); assert.equal(findReportTarget(doc, { ...resolved, field: 'page:other:text' }), null);
 doc.querySelector('p')!.textContent = 'Another colleague replaced this passage.'; assert.equal(findReportTarget(doc, resolved), null);
});

test('two rewritten paragraphs are not matched merely because the count stayed equal', () => {
 const old = document('## Communication workshop\n\nThe old communication workshop description.\n\nAnother original paragraph.');
 const current = document('## Communication workshop\n\nA replacement paragraph.\n\nA rewritten paragraph possibly reordered.');
 assert.equal(reportCommentTargets([comment], current, [{ round: 8, report: old }])[0].anchorTarget, null);
});
