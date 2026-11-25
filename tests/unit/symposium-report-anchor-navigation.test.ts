import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import type { showReportAnchor } from '../../src/components/workspace/PageReviewClient';
test('workspace Show me uses the same verified passage and refuses an unrelated fallback', async () => {
 const bundle = await build({ stdin: { contents: 'export {showReportAnchor} from "./src/components/workspace/PageReviewClient";', loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', plugins: [{ name: 'next-router', setup(b) { b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useRouter=()=>({refresh(){}});' })); } }] });
 const mod = { exports: {} as { showReportAnchor: typeof showReportAnchor } }; new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
 const dom = new JSDOM('<main data-report-paper><div id="report-frame-training-week-2"><article data-section="training-week"><p id="ccrm">CCRM text.</p></article></div><div id="report-frame-training-week-3"><article data-section="training-week"><p id="communication" data-report-field="page:training-week:text" data-report-text-start="200" data-report-text-end="250">Current communication workshop description.</p></article></div></main>', { pretendToBeVisual: true });
 const previous = { document: globalThis.document, window: globalThis.window }; const scrolled: string[] = [];
 Object.assign(globalThis, { document: dom.window.document, window: dom.window });
 dom.window.matchMedia = (() => ({ matches: true })) as unknown as typeof dom.window.matchMedia;
 dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
 try {
  assert.equal(mod.exports.showReportAnchor('#report-frame-training-week-2', 'Old communication description.', { field:'page:training-week:text', start:200, end:250, quote:'Current communication workshop description.' }), true);
  assert.equal(scrolled.at(-1), 'communication');
  assert.equal(mod.exports.showReportAnchor('#report-frame-training-week-2', 'Deleted quotation with no reliable target.'), false); assert.equal(scrolled.length, 1);
 } finally { dom.window.close(); Object.assign(globalThis, previous); }
});
