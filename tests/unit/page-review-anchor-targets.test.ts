/* eslint-disable @typescript-eslint/no-explicit-any -- Minimal DOM/network fixture for the shared overlay. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { overlaySource } from '../../src/lib/page-review/overlay-source';
const settle = () => new Promise(resolve => setTimeout(resolve, 70));
const oldQuote = 'Participants reflected on adapting how they communicate to the audience and situation. The workshop gave them a way to practise explaining ideas clearly across roles and levels of familiarity.';
const target = { field: 'page:training-week:text', start: 400, end: 447, quote: 'Communication workshop revised description.' };
function fixture(withTarget = true, surface: 'report' | 'social' | 'website' = 'report') {
  const scrolled: string[] = [];
  const comment = { id: 'yoojin-121', parentId: null, round: 8, status: 'resolved', body: 'Focus on the workshop learning outcomes.', anchorQuote: oldQuote, anchorKey: '#report-frame-training-week-2', anchorPath: '#ccrm', anchorBlock: 'Training Week', authorName: 'Yoo Jin Park', createdAt: '2026-11-24T22:49:00Z', ...(withTarget ? { anchorTarget: target } : {}) };
  const dom = new JSDOM('<!doctype html><div data-report-tools-host></div><main data-report-paper data-social-review><div id="report-frame-training-week-2"><article data-print-page data-copy-page><p id="ccrm" data-report-field="page:training-week:text" data-report-text-start="100" data-report-text-end="150">CCRM tour description.</p></article></div><div id="report-frame-training-week-3"><article data-print-page data-copy-page><p id="communication" data-report-field="page:training-week:text" data-report-text-start="400" data-report-text-end="447">Communication workshop revised description.</p></article></div></main><script data-viewer="reviewer">' + overlaySource('/review', 'Report', true, surface === 'website' ? null : '/comments', surface === 'social' ? 'social' : 'report') + '</script>', {
    url: 'https://review.test', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as any;
      window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
      window.HTMLElement.prototype.getBoundingClientRect = function () { const top = this.id === 'communication' ? 300 : 100; return { x: 0, y: top, top, bottom: top + 100, left: 0, right: 500, width: 500, height: 100, toJSON() {} }; };
      window.fetch = (async (url: string) => ({ ok: true, json: async () => url === '/review' ? { ok: true, review: { title: 'Report', round: 9, status: 'open' }, viewer: { name: 'Reviewer' }, comments: [comment] } : { notifications: [], people: [] } })) as any;
    },
  });
  return { dom, scrolled };
}
async function showComment(f: ReturnType<typeof fixture>) {
  await settle();
  const history = f.dom.window.document.querySelector<HTMLDetailsElement>('.bhn-rv-history')!;
  history.open = true; history.dispatchEvent(new f.dom.window.Event('toggle')); await settle();
  f.dom.window.document.querySelector<HTMLButtonElement>('.bhn-rv-thread-locate')!.click(); await settle();
}
test('Yeseul’s stale CCRM selector resolves to the rewritten Communication Chameleon passage for Show me and markers', async () => {
  const f = fixture(); try {
    await showComment(f); assert.equal(f.scrolled.at(-1), 'communication');
    const marker = f.dom.window.document.querySelector<HTMLButtonElement>('.bhn-review-marker')!;
    assert.equal(marker.style.top, '287px'); marker.click(); await settle();
    assert.equal(f.dom.window.document.querySelector('.bhn-rv-thread-active')?.getAttribute('data-thread-id'), 'yoojin-121');
  } finally { f.dom.window.close(); }
});
test('a removed quote never falls back to an unrelated selector in report or social review', async () => {
  for (const surface of ['report', 'social', 'website'] as const) {
    const f = fixture(false, surface); try {
      await showComment(f); assert.deepEqual(f.scrolled, []);
      assert.equal(f.dom.window.document.querySelector('.bhn-rv-thread-locate')?.textContent, 'Not found');
      assert.equal(f.dom.window.document.querySelectorAll('.bhn-review-marker').length, 0);
    } finally { f.dom.window.close(); }
  }
});
test('editing a connected passage invalidates cached markers without waiting for a scroll or reload', async () => {
 const f = fixture(); try {
  await showComment(f); assert(f.dom.window.document.querySelector('.bhn-review-marker'));
  f.dom.window.document.querySelector('#communication')!.textContent = 'A newly replaced paragraph requiring a fresh target.';
  await settle(); await settle(); assert.equal(f.dom.window.document.querySelectorAll('.bhn-review-marker').length, 0);
 } finally { f.dom.window.close(); }
});

test('missing report targets are cached on scroll and retried after content changes', async () => {
 const f = fixture(false); try {
  await showComment(f); const doc = f.dom.window.document; const original = doc.querySelectorAll.bind(doc); let rescans = 0;
  doc.querySelectorAll = ((selector: string) => { if (selector.includes(':is(')) rescans++; return original(selector); }) as typeof doc.querySelectorAll;
  for (let i = 0; i < 20; i++) f.dom.window.dispatchEvent(new f.dom.window.Event('scroll'));
  await settle(); assert.equal(rescans, 0, 'do not rescan unresolved passages on scrolling');
  doc.querySelector('#communication')!.textContent = oldQuote; await settle(); await settle();
  assert(rescans > 0); assert(doc.querySelector('.bhn-review-marker'), 'new matching content invalidates a cached miss');
 } finally { f.dom.window.close(); }
});
