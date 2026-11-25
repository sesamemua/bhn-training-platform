/* eslint-disable @typescript-eslint/no-explicit-any -- Minimal DOM/network fixture for the shared review overlay. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { overlaySource } from '../../src/lib/page-review/overlay-source';

test('the report panel announces an actual open round, never a locked or closed one', async () => {
  for (const status of ['open', 'exported', 'closed']) {
    const dom = new JSDOM('<!doctype html><div data-report-tools-host></div><main data-report-paper></main><script data-viewer="reviewer" data-round="10">' + overlaySource('/review', 'Report', true, '/comments') + '</script>', {
      url: 'https://review.test', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(window) {
        window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as any;
        window.HTMLElement.prototype.scrollIntoView = function () {};
        window.fetch = (async (url: string) => ({ ok: true, json: async () => url === '/review' ? { ok: true, review: { title: 'Report', round: 10, status }, viewer: { name: 'Reviewer' }, comments: [] } : { notifications: [], people: [] } })) as any;
      },
    });
    try {
      await new Promise(resolve => setTimeout(resolve, 80));
      const open = dom.window.document.querySelector('[aria-label="Round 10 open for review"]');
      assert.equal(!!open, status === 'open');
      if (open) {
        assert.match(open.textContent!, /Round 10 is open for review/);
        assert.equal(dom.window.document.querySelector('.bhn-rv-lock-state'), null);
      } else assert(dom.window.document.querySelector('.bhn-rv-lock-state'));
    } finally { dom.window.close(); }
  }
});
