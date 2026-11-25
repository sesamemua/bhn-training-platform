import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { reportBlocks } from '../../src/lib/symposium-report/paginate';
import type { ReportPaper } from '../../src/components/workspace/symposium-report/ReportPaper';
import type { Report, ReportPage } from '../../src/lib/symposium-report/document';

test('feedback panels preserve every editable passage and comment offset', async () => {
  const bundle = await build({ stdin: { contents: 'export {ReportPaper} from "./src/components/workspace/symposium-report/ReportPaper";', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/*'], plugins: [{ name: 'styles', setup(b) { b.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export default {feedbackPrompt:"feedback-prompt"}' })); } }] });
  const mod = { exports: {} as { ReportPaper: typeof ReportPaper } };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const page: ReportPage = { id: 'symposium-feedback', title: 'Feedback', label: 'Participant survey', frames: 1, fillPhotos: false, text: 'Share your experience.\n\n## What should we keep?\n\nTell us what helped.\n\n## What could we improve?\n\nTell us what could work better.\n\n## What should we add?\n\nSuggest future topics.\n\nComplete the Annual Symposium feedback form\n\nResponses go to the planning team.' };
  const blocks = reportBlocks(page.text);
  const report: Report = { cover: { title: 'Report', theme: 'Theme', date: 'October' }, pages: [page], back: { title: 'Connect', text: 'Community' } };
  for (const editing of [false, true]) {
    const doc = new JSDOM(renderToStaticMarkup(React.createElement(mod.exports.ReportPaper, { report, layout: [{ page, columns: 1, frames: [blocks], photoHeights: [0], hasWorkshops: false }], active: { id: page.id, index: 0 }, ready: false, edit: null, recommendations: {}, onSelect() {}, onTyping() {}, onTextChange: editing ? () => {} : undefined }))).window.document;
    const passages = [...doc.querySelectorAll('[data-report-text-start]')];
    assert.deepEqual(passages.map(n => n.textContent?.replace(' ↗', '')), blocks.map(b => b.text));
    assert.deepEqual(passages.map(n => Number(n.getAttribute('data-report-text-start'))), blocks.map(b => b.start));
    assert.equal(doc.querySelectorAll('.feedback-prompt').length, 3);
    assert.equal(doc.querySelectorAll('.feedback-prompt [contenteditable]').length, editing ? 6 : 0);
    assert.equal(doc.querySelector('a')?.href, 'https://docs.google.com/forms/d/e/1FAIpQLSeDtLSMZESQ849RL-pA4NU5TihYwxojHrdW5jMnSyVCfUdZKg/viewform');
    assert.equal(doc.querySelectorAll('footer').length, 1);
  }
});
