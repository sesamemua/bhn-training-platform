import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {editorialParts} from '../../src/lib/symposium-report/editorial';
import {reportBlocks} from '../../src/lib/symposium-report/paginate';
import type {ReportPaper} from '../../src/components/workspace/symposium-report/ReportPaper';
import type {ReportPage} from '../../src/lib/symposium-report/document';

test('panel labels format without altering text, names or editable block offsets',()=>{
 const text='Moderator: Dr. Moderator (Institute).\nPanelists: First Person (Company), Second Person (Organization).';
 const page:ReportPage={id:'panels',label:'Discussion',title:'Panel',text,frames:1};const block=reportBlocks(text)[0];
 const parts=editorialParts(page,block);assert.equal(parts.map(p=>p.text).join(''),text);assert.deepEqual(parts.filter(p=>p.kind==='panelLabel').map(p=>p.text.trim()),['Moderator:','Panelists:']);assert.equal(block.start,0);assert.equal(block.text,text);
});

test('all printed heading variants omit number/slash prefixes while folios and editing stay available',async()=>{
 const bundle=await build({stdin:{contents:'export {ReportPaper} from "./src/components/workspace/symposium-report/ReportPaper";',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-dom/*'],plugins:[{name:'styles',setup(b){b.onResolve({filter:/\.css$/},()=>({path:'styles',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default {}'}));}}]});
 const mod={exports:{} as {ReportPaper:typeof ReportPaper}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const text='Moderator: A Name\nPanelists: B Name and C Name';
 const page={id:'panels',label:'Annual Symposium',title:'2026 Panel',text,frames:2,fillPhotos:false};
 const report={cover:{title:'Report',theme:'Theme',date:'October'},pages:[page],back:{title:'Connect',text:'Community'}};
 for(const editing of [false,true]){
  const html=renderToStaticMarkup(React.createElement(mod.exports.ReportPaper,{report,layout:[{page,columns:1,frames:[reportBlocks(text),[{kind:'paragraph',text:'Continuation text',start:0}]],photoHeights:[0,0],hasWorkshops:false}],active:{id:'cover',index:0},ready:false,edit:null,recommendations:{},onSelect(){},onTyping(){},onTextChange:editing?()=>{}:undefined}));
  const doc=new JSDOM(html).window.document;const headers=[...doc.querySelectorAll('[data-print-page] header')].map(n=>n.textContent);
  assert.deepEqual(headers,['Annual Symposium2026 Panel','2026 Panel  · continued']);assert(headers.every(t=>!/^\s*\d+\s*\//.test(t!)));assert.equal(doc.querySelector('[data-report-field="page:panels:label"]')?.textContent,'Annual Symposium');assert.equal(doc.querySelectorAll('footer').length,2);assert.match(doc.querySelector('footer')!.textContent!,/02$/);
  assert.equal(doc.querySelectorAll('[contenteditable]').length>0,editing);assert.match(doc.querySelector('[data-report-text-start]')!.textContent!,/Moderator: A Name\nPanelists: B Name and C Name/);
 }
});
