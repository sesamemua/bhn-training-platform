import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { reportSchema, type Report, type ReportPhoto } from '../../src/lib/symposium-report/document';
import { photoCaption, photoLabel, photoPreset } from '../../src/lib/symposium-report/photos';
import { reportReviewSnapshot } from '../../src/lib/symposium-report/review-snapshot';
import { mergeReports } from '../../src/lib/symposium-report/merge';
import type { PhotoFigure } from '../../src/components/workspace/symposium-report/ReportPhoto';

const photo: ReportPhoto = { file: `final.${'a'.repeat(24)}.webp`, x: 50, y: 30, fit: 'cover', caption: 'A useful caption' };
const document: Report = { cover: { title: 'Report', theme: 'Theme', date: 'October' }, pages: [{ id: 'panels', title: 'Panels', label: 'Symposium', text: 'Original copy.', frames: 1, photos: { '0': photo } }], back: { title: 'Connect', text: 'Community' } };

test('cleared captions survive JSON save/reload and merging a colleague’s text edit', () => {
  for (const caption of ['', '   ']) {
    const mine = reportSchema.parse({ ...document, pages: [{ ...document.pages[0], photos: { '0': { ...photo, caption } } }] });
    const reloaded = reportSchema.parse(JSON.parse(JSON.stringify(mine)));
    assert.equal(reloaded.pages[0].photos!['0'].caption, '');
    const theirs = { ...document, pages: [{ ...document.pages[0], text: 'Colleague’s updated copy.' }] };
    const merged = reportSchema.parse(mergeReports(document, reloaded, theirs));
    assert.equal(merged.pages[0].photos!['0'].caption, '');
    assert.equal(merged.pages[0].text, theirs.pages[0].text);
  }
  assert.equal(reportSchema.safeParse({ ...document, cover: { ...document.cover, photo: { ...photo, caption: 'x'.repeat(121) } } }).success, false);
});

test('blank or absent printed captions do not remove useful accessible image labels', () => {
  for (const caption of ['', undefined]) {
    assert.equal(photoCaption({ ...photo, caption }), '');
    assert.equal(photoLabel({ ...photo, caption }), 'Symposium photograph');
    const preset = { ...photoPreset('keynote.jpg'), caption };
    assert.equal(photoCaption(preset), '');
    assert.equal(photoLabel(preset), 'Christopher Procyshyn · keynote');
  }
  assert.equal(photoCaption(photo), photo.caption);
});

test('live figures and review snapshots keep cleared captions blank while preserving other captions', async () => {
  const bundle = await build({ stdin: { contents: 'export {PhotoFigure} from "./src/components/workspace/symposium-report/ReportPhoto";', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/*'], plugins: [{ name: 'styles', setup(b) { b.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default {}' })); } }] });
  const mod = { exports: {} as { PhotoFigure: typeof PhotoFigure } };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  for (const caption of ['', undefined, '<Actual caption>']) {
    const current = { ...photo, caption };
    const doc = new JSDOM(renderToStaticMarkup(React.createElement(mod.exports.PhotoFigure, { photo: current, height: 300, slot: '0' }))).window.document;
    assert.equal(doc.querySelector('figcaption')?.textContent, caption ?? '');
    assert.equal(doc.querySelector('img')?.alt, caption || 'Symposium photograph');
    assert.equal(doc.querySelector('figure')?.getAttribute('data-photo-slot'), '0');
    const snapshot = new JSDOM(reportReviewSnapshot({ ...document, pages: [{ ...document.pages[0], photos: { '0': current } }] }, 'https://example.test')).window.document;
    const section = snapshot.querySelectorAll('section')[1];
    assert.equal(section.querySelectorAll('figcaption').length, caption ? 1 : 0);
    if (caption) assert.match(section.querySelector('figcaption')!.textContent!, /<Actual caption>/);
    assert.equal(section.querySelector('img')?.alt, caption || 'Symposium photograph');
  }
});
