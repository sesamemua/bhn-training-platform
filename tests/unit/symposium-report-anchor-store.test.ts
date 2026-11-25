import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import type { commentsWithReportTargets } from '../../src/lib/symposium-report/comment-anchor-store';
import type { Report } from '../../src/lib/symposium-report/document';

test('current-round edits recover source context from existing before-text audits without writing comments', async () => {
 const bundle = await build({ stdin: { contents: 'export {commentsWithReportTargets} from "./src/lib/symposium-report/comment-anchor-store";', loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'prisma-fixture', setup(b) { b.onResolve({ filter: /lib\/prisma$/ }, () => ({ path: 'prisma', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const prisma={auditLog:{findMany:async args=>{onQuery(args);return auditRows;}}};' })); } }] });
 const before = '## Communication Workshop\n\nOriginal workshop learning outcomes.';
 const after = '## Communication Workshop\n\nRevised workshop learning outcomes.';
 const report: Report = { cover: { title: 'Report', theme: 'Theme', date: 'October' }, pages: [{ id: 'training-week', title: 'Training', label: 'Training', text: after, frames: 1 }], back: { title: 'Connect', text: 'Community' } };
 const comments = [{ id: 'comment', parentId: null, round: 9, anchorKey: '#report-frame-training-week-0', anchorPath: '#stale-paragraph', anchorQuote: 'Original workshop learning outcomes.' }];
 const calls: unknown[] = [];
 const auditRows = [{ detail: JSON.stringify({ round: 9, changes: [{ key: 'page:training-week:text', before, after }] }) }];
 const mod = { exports: {} as { commentsWithReportTargets: typeof commentsWithReportTargets } };
 new Function('module', 'exports', 'require', 'auditRows', 'onQuery', bundle.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url), auditRows, (args: unknown) => calls.push(args));
 const original = JSON.stringify(comments);
 const result = await mod.exports.commentsWithReportTargets(comments, report, 9, []);
 assert.equal(result[0].anchorTarget?.quote, 'Revised workshop learning outcomes.'); assert.equal(JSON.stringify(comments), original); assert.equal(calls.length, 1);
 calls.length = 0;
 const snapshot = { ...report, pages: [{ ...report.pages[0], text: before }] };
 const archived = await mod.exports.commentsWithReportTargets(comments, report, 9, [{ round: 9, html: JSON.stringify(snapshot) }]);
 assert.equal(archived[0].anchorTarget?.quote, 'Revised workshop learning outcomes.'); assert.equal(calls.length, 0, 'snapshot resolution avoids the audit read');
});
