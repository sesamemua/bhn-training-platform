/* eslint-disable @typescript-eslint/no-explicit-any -- Partial transactional database fixtures. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { captureReviewFeedback, parseFeedbackEvent, reviewerPreferenceHistory, type FeedbackEvent } from '../../src/lib/page-review/feedback-memory';
const require=createRequire(import.meta.url);
const actor={id:'yoojin',name:'Yoo Jin Park',verified:true};
const review={id:'report',title:'Symposium report',url:'https://example.test/review',kind:'report',round:1,pastedHtml:'Original document',snapshotHtml:null};
const original={id:'c1',body:'Use more participant quotes',round:1,parentId:null,authorUserId:'yoojin',authorName:'Yoo Jin Park',authorKind:'user',createdAt:new Date('2026-11-01'),editedAt:null,editedByName:null,editedById:null,editCount:0,status:'open',anchorQuote:'Original paragraph',anchorKey:'#report-frame-networking',anchorPath:'main > p',anchorBlock:'Page 4 · Networking'};
function fixture(){
 const records=new Map<string,FeedbackEvent>();let fail=false;
 const db:any={pageReview:{findUnique:async()=>review},$executeRaw:async(query:any)=>{
  if(fail)throw Error('History unavailable');
  for(let i=0;i<query.values.length;i+=5){const [id,,,,detail]=query.values.slice(i,i+5);if(!records.has(id))records.set(id,JSON.parse(detail));}
 }};
 return{db,records,setFail:(value:boolean)=>fail=value};
}
test('history retains exact before/after, quote, page, round, document revision and writer; captures are idempotent',async()=>{
 const f=fixture();await captureReviewFeedback(f.db,'report',[original] as any,'created',actor);await captureReviewFeedback(f.db,'report',[original] as any,'baseline',actor);assert.equal(f.records.size,1);
 const changed={...original,body:'Shorten this quote',editCount:1,editedAt:new Date('2026-11-03'),editedById:'yeseul',editedByName:'Yeseul Lee'};
 await captureReviewFeedback(f.db,'report',[changed] as any,'edited',{id:'yeseul',name:'Yeseul Lee',verified:true});assert.equal(f.records.size,2);
 const [before,after]=[...f.records.values()];assert.equal(before.comment.body,original.body);assert.equal(before.comment.anchorQuote,'Original paragraph');assert.equal(before.comment.anchorBlock,'Page 4 · Networking');assert.equal(before.review.revision?.length,64);assert.equal(after.writer.id,'yeseul');assert.equal(after.comment.authorUserId,'yoojin');
 await captureReviewFeedback(f.db,'report',[changed] as any,'deleted',actor);assert.equal(f.records.size,3);assert.equal([...f.records.values()].at(-1)?.event,'deleted');
});
test('failed preservation rejects before a surrounding transaction can commit; raw feedback is data',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(captureReviewFeedback(f.db,'report',[original] as any,'created',actor),/History unavailable/);assert.equal(f.records.size,0);
 assert.equal(parseFeedbackEvent('invalid'),null);assert.equal(parseFeedbackEvent('{"schema":1}'),null);
});
test('preference topics stay scoped by project; edits do not inflate evidence; changes remain dated and sourced',async()=>{
 const f=fixture();await captureReviewFeedback(f.db,'report',[original] as any,'baseline',actor);
 await captureReviewFeedback(f.db,'report',[{...original,body:'Use shorter participant quotes',editCount:1,editedAt:new Date('2026-11-04'),editedById:actor.id,editedByName:actor.name}] as any,'edited',actor);
 const other=[...f.records.values()][0];const event={...other,review:{...other.review,id:'website',title:'Website'},comment:{...other.comment,id:'site1',body:'Use a large photo'}};
 const people=reviewerPreferenceHistory([...f.records.values(),event]);assert.equal(people.length,1);assert.equal(people[0].projects.length,2);
 const project=people[0].projects.find(p=>p.reviewId==='report')!;assert.equal(project.evidenceCount,1);assert.equal(project.timeline.length,2);assert(project.themes.every(t=>t.strength==='Limited evidence'));assert.equal(project.themes.find(t=>t.name==='Voices & quotations')?.count,1);
 assert.equal(project.timeline[0].comment.body,'Use shorter participant quotes');assert.equal(project.timeline[1].comment.body,original.body);
});
test('unverified names are not merged into platform people and deleted comments stay only in history',async()=>{
 const f=fixture();await captureReviewFeedback(f.db,'report',[original] as any,'created',actor);await captureReviewFeedback(f.db,'report',[original] as any,'deleted',actor);
 const people=reviewerPreferenceHistory([...f.records.values()]);assert.equal(people[0].projects[0].evidenceCount,0);assert.equal(people[0].projects[0].timeline.length,2);
 const guest={...([...f.records.values()][0]),writer:{id:null,name:'Yoo Jin Park',verified:false},comment:{...([...f.records.values()][0]).comment,id:'guest'}};
 const both=reviewerPreferenceHistory([...f.records.values(),guest]);assert.equal(both.length,2);assert.equal(both.find(p=>!p.verified)?.projects[0].themes.length,0);
});
test('internal add/edit/delete lifecycle commits evidence with the comment, and failure rolls back',async()=>{
 const compiled=ts.transpileModule(readFileSync('src/app/api/workspace/page-review/[id]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let comments:any[]=[];const records:any[]=[];let fail=false;
 const db:any={pageReview:{findUnique:async()=>({...review,status:'open',comments}),update:async()=>({})},pageComment:{
 count:async()=>comments.length,findFirst:async({where}:any)=>comments.find(c=>c.id===where.id),findMany:async()=>comments,
 create:async({data}:any)=>{const c={...original,...data};comments.push(c);return c;},
 update:async({data}:any)=>{const c=comments[0];Object.assign(c,{...data,editCount:c.editCount+1});return c;},deleteMany:async()=>({count:0}),delete:async()=>{comments=[];return{};}},
 };
 const mocks:any={'@/lib/auth':{requireRole:async()=>({user:{id:actor.id,name:actor.name,role:'admin'}})},'@/lib/prisma':{prisma:db},'@/lib/page-review/feedback-memory':{captureReviewFeedback:async(_db:any,_id:string,rows:any[],event:string)=>{if(fail)throw Error('history failure');for(const row of rows)records.push({event,body:row.body});}},'@/lib/symposium-report/store':{reportTransaction:async(run:any)=>{const saved=structuredClone(comments),length=records.length;try{return await run(db);}catch(e){comments=saved;records.length=length;throw e;}}}};
 const exports:any={};new Function('require','exports',compiled)((id:string)=>mocks[id]??require(id),exports);
 const post=(payload:any)=>exports.POST(new Request('https://test/api',{method:'POST',body:JSON.stringify(payload)}),{params:Promise.resolve({id:'report'})});
 await post({action:'addComment',body:'Use more quotes'});await post({action:'editComment',commentId:'c1',body:'Use fewer quotes'});
 assert.deepEqual(records.map(r=>r.event),['created','baseline','edited']);assert.equal(records[1].body,'Use more quotes');assert.equal(records[2].body,'Use fewer quotes');
 fail=true;await assert.rejects(post({action:'editComment',commentId:'c1',body:'Do not save'}),/history failure/);assert.equal(comments[0].body,'Use fewer quotes');
 fail=false;await post({action:'deleteComment',commentId:'c1'});assert.equal(comments.length,0);assert.equal(records.at(-1).event,'deleted');
});
test('public create/edit/delete preserve evidence in the same transaction and keep private history out of public responses',async()=>{
 const compiled=ts.transpileModule(readFileSync('src/app/api/public/page-review/[token]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let comments:any[]=[];const records:any[]=[];
 const db:any={pageReview:{findUnique:async()=>({...review,status:'open'}),update:async()=>({})},pageComment:{count:async()=>comments.length,create:async({data}:any)=>{const c={...original,...data,secret:'never public'};comments.push(c);return c;},findFirst:async()=>comments[0],findMany:async()=>comments,update:async({data}:any)=>{comments[0]={...comments[0],...data,editCount:1};return comments[0];},deleteMany:async()=>{const count=comments.length;comments=[];return{count};}}};
 const mocks:any={'@/lib/prisma':{prisma:db},'@/lib/symposium-report/store':{reportTransaction:async(run:any)=>run(db)},'@/lib/page-review/feedback-memory':{captureReviewFeedback:async(_db:any,_id:string,rows:any[],event:string,who:any)=>{assert.equal(who.verified,true);records.push({event,bodies:rows.map(r=>r.body)});}},'@/lib/page-review/viewer':{verifyPageReviewViewerToken:async()=>({userId:'reviewer',name:'Colleague',kind:'user'})}};
 const exports:any={};new Function('require','exports',compiled)((id:string)=>mocks[id]??require(id),exports);
 const call=(method:string,body:any)=>exports[method](new Request('https://test/api',{method,headers:{Authorization:'Bearer credential','Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({token:'shared'})});
 const response=await call('POST',{body:'Original feedback'});assert.equal(response.status,200);const json=await response.json();assert(!('authorUserId' in json.comment));assert(!('secret' in json.comment));assert(!('reviewId' in json.comment));
 assert.equal((await call('PATCH',{id:'c1',body:'Revised feedback'})).status,200);assert.equal((await call('DELETE',{id:'c1'})).status,200);
 assert.deepEqual(records.map(r=>r.event),['created','baseline','edited','baseline','deleted']);assert.deepEqual(records[1].bodies,['Original feedback']);assert.equal(comments.length,0);
});
test('history download rejects non-admin access before reading any evidence',async()=>{
 const compiled=ts.transpileModule(readFileSync('src/app/api/workspace/page-review/feedback-memory/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let allowed=false,reads=0;const mocks:any={'@/lib/auth':{requireRole:async(role:string)=>{assert.equal(role,'admin');return allowed?{user:{id:'admin'}}:null;}},'@/lib/page-review/feedback-history-store':{loadFeedbackHistory:async(id:string)=>{reads++;assert.equal(id,'report');return{events:[],reviewers:[]};}}};
 const exports:any={};new Function('require','exports',compiled)((id:string)=>mocks[id]??require(id),exports);
 assert.equal((await exports.GET(new Request('https://test/api?review=report'))).status,403);assert.equal(reads,0);allowed=true;
 const r=await exports.GET(new Request('https://test/api?review=report'));assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal((await r.json()).scope,'report');
});
test('review actions stay in the timeline without becoming preferences or hiding the source request',async()=>{
 const f=fixture();await captureReviewFeedback(f.db,'report',[original] as any,'created',actor);
 const evidence=[...f.records.values()][0];
 const action={...evidence,event:'edited' as const,signal:'activity' as const,recordedAt:'2026-11-04T12:00:00Z',occurredAt:'2026-11-04T12:00:00Z',comment:{...evidence.comment,body:'Review action: resolved',status:'resolved'}};
 const project=reviewerPreferenceHistory([evidence,action])[0].projects[0];assert.equal(project.timeline.length,2);assert.equal(project.evidenceCount,1);assert.equal(project.themes.find(t=>t.name==='Voices & quotations')?.count,1);
 const activitiesOnly=reviewerPreferenceHistory([action])[0].projects[0];assert.equal(activitiesOnly.evidenceCount,0);assert.equal(activitiesOnly.themes.length,0);
});
