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
    const qr = doc.querySelector('img[src="/symposium-report-feedback.svg"]');
    assert(qr, 'printed copies need the respondent survey QR');
    assert.equal(qr.closest('a')?.href, doc.querySelector('a')?.href);
    assert.equal(doc.querySelectorAll('footer').length, 1);
  }
});

test('team funding stays editable outside profile cards and back cover has one website label', async () => {
  const bundle = await build({ stdin: { contents: 'export {ReportPaper} from "./src/components/workspace/symposium-report/ReportPaper";', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/*'], plugins: [{ name: 'styles', setup(b) { b.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export default {publicationProfile:"profile",fundingAcknowledgement:"funding",backLinks:"back-links"}' })); } }] });
  const mod = { exports: {} as { ReportPaper: typeof ReportPaper } };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const funding = 'BioHubNet is funded by the Canada Biomedical Research Fund (CBRF). Find out more.';
  const text = '## Leadership Team\n\nLeadership Person\nScientific Director\n\n## Program Team\n\nProgram Person\nProgram Lead\n\n' + funding;
  const page: ReportPage = { id: 'publication-leadership', title: 'Team', label: 'People', text, frames: 1 };
  const report: Report = { cover: { title: 'Report', theme: 'Theme', date: 'October' }, pages: [page], back: { title: 'Connect', text: 'Community' } };
  const doc = new JSDOM(renderToStaticMarkup(React.createElement(mod.exports.ReportPaper, { report, layout: [{ page, columns: 1, frames: [reportBlocks(text)], photoHeights: [0], hasWorkshops: false }], active: { id: page.id, index: 0 }, ready: false, edit: null, recommendations: {}, onSelect() {}, onTyping() {}, onTextChange() {} }))).window.document;
  assert.equal(doc.querySelectorAll('.profile').length, 2);
  const acknowledgement = doc.querySelector('.funding')!;
  assert.equal(acknowledgement.closest('.profile'), null);
  assert.equal(acknowledgement.querySelector('[contenteditable]')?.textContent, funding);
  assert.equal(acknowledgement.querySelector('a')?.href, 'https://sshrc-crsh.canada.ca/funding-financement/cbrf-frbc/index-eng.aspx');
  const links = doc.querySelector('.back-links')!;
  assert.equal(links.querySelectorAll('a[href="https://biohubnet.ca"]').length, 1);
  assert.equal(links.querySelector('a[href="https://biohubnet.ca"] span')?.textContent, 'biohubnet.ca');
  assert(links.querySelector('a[href="https://www.linkedin.com/company/biohubnet/"]'));
});
