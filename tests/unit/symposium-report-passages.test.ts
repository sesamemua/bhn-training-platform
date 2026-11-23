import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrief } from '../../src/lib/page-review/brief';
import { changePassages } from '../../src/lib/symposium-report/change-passages';
import { paginate, reportBlocks, replaceReportBlock } from '../../src/lib/symposium-report/paginate';

test('paragraph comparisons preserve complete before/after copy and locate the changed current paragraph', () => {
  const before='An unchanged paragraph.\n\nThe old result.\n\nA final paragraph.';
  const after='An unchanged paragraph.\n\nThe revised result, with context.\n\nA final paragraph.';
  const changes=changePassages('page:summary:text','Summary',before,after);
  assert.equal(changes.length,1); assert.equal(changes[0].before,'The old result.');assert.equal(changes[0].after,'The revised result, with context.');
  assert.equal(after.slice(changes[0].start,changes[0].end),changes[0].after);
  assert(changes[0].marks.some(m=>m.kind==='del'));assert(changes[0].marks.some(m=>m.kind==='ins'));
});
test('a removed paragraph retains a nearby surviving anchor and pure insertions retain their full text',()=>{
  const removed=changePassages('page:a:text','A','First.\n\nRemove this.\n\nLast.','First.\n\nLast.');
  assert.equal(removed.length,1);assert.equal(removed[0].before,'Remove this.');assert.equal(removed[0].after,'');assert.equal(removed[0].start,'First.\n\n'.length);
  const inserted=changePassages('page:a:text','A','First.','First.\n\nA new paragraph.');assert.equal(inserted[0].before,'');assert.equal(inserted[0].after,'A new paragraph.');
});
test('a bullet spanning three pages remains one source item; continuation edits preserve the marker and every other character',()=>{
  const source='- '+('Engineering and organ-on-chip research. '.repeat(14))+'\n\n- A distinct second item.';
  const blocks=reportBlocks(source), frames=paginate(blocks,1,items=>items.reduce((n,b)=>n+b.text.length,0)<=145);
  const parts=frames.flat().filter(b=>b.kind==='bullet'&&b.start<source.indexOf('- A distinct'));
  assert(parts.length>=3);assert.equal(parts[0].continued,undefined);assert(parts.slice(1).every(b=>b.continued));
  assert.equal(parts.map(b=>b.text).join(''),blocks[0].text);
  const next=replaceReportBlock(source,parts[1],parts[1].text.replace('research','development'));
  assert.equal(reportBlocks(next).filter(b=>b.kind==='bullet').length,2);assert(next.startsWith('- '));
});

test('copied review briefs retain circle and line geometry and their comments',()=>{
  const comments=['circle','line'].map((shape,i)=>({id:String(i),parentId:null,round:5,body:'Revise the marked '+shape+' area.',authorName:'Reviewer',authorKind:'user',editedByName:null,status:'open',anchorQuote:'A marked paragraph.',anchorKey:'#report-frame-summary-0',anchorPath:'#report-frame-summary-0 article p',anchorBlock:'Page 2 · [draw:'+shape+':0.1,0.2,0.3,0.4]',anchorState:'current',createdAt:new Date('2026-11-23T22:00:00Z')}));
  const brief=buildBrief({url:'/review/symposium-2026/report',title:'Report',round:5,comments});
  assert(brief.includes('[draw:circle:0.1,0.2,0.3,0.4]'));assert(brief.includes('[draw:line:0.1,0.2,0.3,0.4]'));
  assert(brief.includes('Revise the marked circle area.'));assert(brief.includes('#report-frame-summary-0'));
});
