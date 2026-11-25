import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

test('report review reads attach current targets without changing stored quotes, authors, status or round', async () => {
 const bundle = await build({ stdin: { contents:'export {GET} from "./src/app/api/workspace/symposium-2026/report/review/route";',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'services',setup(b){
  b.onResolve({filter:/lib\/prisma$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/lib\/auth$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'?'export const requireRole=async()=>authorized()?{user:{id:"reader",name:"Reader"}}:null;':'export const prisma={pageReview:{findUnique:async()=>{onRead();return row;}},auditLog:{findMany:async()=>[]}};'}));
 }}]});
 const doc = (text:string)=>({cover:{title:'Report',theme:'Theme',date:'October'},pages:[{id:'training-week',title:'Training',label:'Training',text,frames:1}],back:{title:'Connect',text:'Community'}});
 const old=doc('## Communication Workshop\n\nOriginal communication description.');
 const current=doc('## New workshop\n\nNew introduction.\n\n## Communication Workshop\n\nRevised communication description.');
 const original={id:'comment',parentId:null,round:8,anchorKey:'#report-frame-training-week-2',anchorPath:'#ccrm',anchorQuote:'Original communication description.',anchorBlock:'Training Week',anchorState:'current',authorUserId:'author',authorName:'Original reviewer',body:'Revise learning outcomes.',status:'resolved',createdAt:new Date('2026-11-24'),editedAt:null,editedByName:null};
 const row={title:'Report',round:9,status:'open',pastedHtml:JSON.stringify(current),versions:[{round:8,html:JSON.stringify(old)}],comments:[original]}; const initial=JSON.stringify(row);
 let authorized=false,reads=0; const mod={exports:{} as {GET:(request:Request)=>Promise<Response>}};
 new Function('module','exports','require','row','authorized','onRead',bundle.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url),row,()=>authorized,()=>reads++);
 assert.equal((await mod.exports.GET(new Request('https://example.test/api/workspace/symposium-2026/report/review'))).status,403);assert.equal(reads,0);
 authorized=true; const body=await(await mod.exports.GET(new Request('https://example.test/api/workspace/symposium-2026/report/review'))).json();
 assert.equal(body.comments[0].anchorTarget.quote,'Revised communication description.');assert.equal(body.comments[0].id,original.id);assert.equal(body.comments[0].anchorQuote,original.anchorQuote);assert.equal(body.comments[0].authorName,original.authorName);assert.equal(body.comments[0].authorUserId,undefined);assert.equal(body.comments[0].status,'resolved');assert.equal(body.review.round,9);assert.equal(body.review.status,'open');assert.equal(JSON.stringify(row),initial);
});
