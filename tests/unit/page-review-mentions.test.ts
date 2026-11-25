/* eslint-disable @typescript-eslint/no-explicit-any -- These dynamically transpiled module fixtures emulate partial Prisma delegates. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as document from '../../src/lib/symposium-report/document';
import * as social from '../../src/lib/social/copy-review';
import * as brief from '../../src/lib/page-review/brief';
import * as limits from '../../src/lib/page-review/limits';
const require = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>) {
 const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:any={};new Function('require','exports',compiled)((id:string)=>mocks[id]??require(id),exports);return exports;
}
const people=[{id:'actor',name:'Ruilin Yuan',email:'actor@example.test'},{id:'a',name:'Epshita Islam',email:'epshita@example.test'},{id:'b',name:'Yeseul Lee',email:'yeseul@example.test'},{id:'dup1',name:'Same Name',email:'x@example.test'},{id:'dup2',name:'Same Name',email:'y@example.test'}];
function fixture() {
 const receipts=new Map<string,any>(), mails:any[]=[];let fail=false;
 const matches=(r:any,w:any)=>r.action===w.action&&r.targetType===w.targetType&&r.targetId===w.targetId&&r.detail.includes(w.detail.contains)&&(!w.NOT||!r.detail.includes(w.NOT.detail.contains))&&(!w.id||(typeof w.id==='string'?r.id===w.id:w.id.in.includes(r.id)));
 const db={user:{findMany:async()=>people},pageComment:{findMany:async()=>[{id:'c1',parentId:null as string|null,round:6,body:'Please check @Epshita Islam. Ask @Yeseul Lee too.'}]},auditLog:{
 createMany:async({data}:any)=>{if(fail)throw Error('DB unavailable');let count=0;for(const r of data)if(!receipts.has(r.id)){receipts.set(r.id,{...r,createdAt:new Date(),actor:{name:'Ruilin Yuan'}});count++;}return{count};},
 findMany:async({where,take,cursor,skip=0}:any)=>{let rows=[...receipts.values()].filter(r=>matches(r,where));if(cursor){const i=rows.findIndex(r=>r.id===cursor.id);rows=i<0?[]:rows.slice(i+skip);}return take?rows.slice(0,take):rows;},
 updateMany:async({where,data}:any)=>{let count=0;for(const r of receipts.values())if(matches(r,where)){Object.assign(r,data);count++;}return{count};}}};
 const mod=load('src/lib/page-review/mentions.ts',{'@/lib/page-review/feedback-memory':{captureReviewFeedback:async()=>{}},'@/lib/prisma':{prisma:db},'@/lib/mail':{mailConfigured:()=>true,sendMail:async(mail:any)=>{mails.push(mail);throw Error('Review mentions must never email');}},'@/lib/workspace-review-invites':{staffReviewRecipients:{isActive:true}}});
 const job={reviewId:document.REPORT_ID,commentId:'c1',round:6,title:'Report',url:'',body:'Please check @Epshita Islam.',actor:{id:'actor',name:'Ruilin Yuan'}};
 return{mod,db,mails,receipts,job,setFail:(v:boolean)=>fail=v};
}
test('full name tags exclude arbitrary addresses, self, partial names and ambiguous names',()=>{
 const f=fixture();assert.deepEqual(f.mod.mentionedColleagues('Ask @Epshita Islam, @Yeseul Lee! @Ruilin Yuan @Same Name @other@example.com @Epshita',people,'actor').map((p:any)=>p.id),['a','b']);
 assert.equal(f.mod.mentionedColleagues('Not an @Epshita Islamic match',people,'actor').length,0);
 assert.equal(f.mod.mentionedColleagues('Thanks @epshita   islam.',people,'actor')[0].id,'a');
});
test('directory exposes labels and ids only; in-page delivery deduplicates and never sends email',async()=>{
 const f=fixture();const list=await f.mod.reviewMentionPeople();assert(!JSON.stringify(list).includes('@'));assert(!list.some((p:any)=>p.label==='Same Name'));
 assert.equal((await f.mod.notifyReviewMentions(f.job)).sent,1);assert.equal((await f.mod.notifyReviewMentions(f.job)).sent,0);assert.equal(f.mails.length,0);
 assert.equal(JSON.parse([...f.receipts.values()][0].detail).delivery,'in_app');
 assert.doesNotMatch(readFileSync('src/lib/page-review/mentions.ts','utf8'),/sendMail|mailConfigured/);
});
test('editing unchanged mentions creates nothing; new colleagues get only their own notification',async()=>{
 const f=fixture();assert.equal((await f.mod.notifyReviewMentions({...f.job,previousBody:f.job.body})).sent,0);
 assert.equal((await f.mod.notifyReviewMentions({...f.job,previousBody:f.job.body,body:f.job.body+' Ask @Yeseul Lee too.'})).sent,1);
 assert.equal(JSON.parse([...f.receipts.values()][0].detail).recipientId,'b');assert.equal(f.mails.length,0);
});
test('in-app persistence failure does not lose the comment or fall back to email',async()=>{
 const f=fixture();f.setFail(true);assert.match((await f.mod.notifyReviewMentions(f.job)).warning,/in-page notification/);assert.equal(f.mails.length,0);
});
test('unread notifications and acknowledgements are isolated by recipient and review and survive reload',async()=>{
 const f=fixture();await f.mod.notifyReviewMentions(f.job);
 const list=await f.mod.reviewMentionNotifications(document.REPORT_ID,'a');assert.equal(list.length,1);assert.equal(list[0].threadId,'c1');assert(!JSON.stringify(list).includes('@example'));
 assert.equal((await f.mod.reviewMentionNotifications(document.REPORT_ID,'b')).length,0);assert.equal((await f.mod.reviewMentionNotifications('another-review','a')).length,0);
 assert.equal((await f.mod.acknowledgeReviewMentions(document.REPORT_ID,'b',[list[0].id])).read,0);
 assert.equal((await f.mod.reviewMentionNotifications(document.REPORT_ID,'a')).length,1);
 assert.equal((await f.mod.acknowledgeReviewMentions(document.REPORT_ID,'a',[list[0].id])).read,1);
 assert.equal((await f.mod.reviewMentionNotifications(document.REPORT_ID,'a')).length,0);
});
test('deleted or removed tags are not shown, malformed receipts are ignored, replies retain their parent',async()=>{
 const f=fixture();await f.mod.notifyReviewMentions(f.job);
 f.db.pageComment.findMany=async()=>[{id:'c1',parentId:'parent',round:6,body:'Please check @Epshita Islam.'}];
 assert.equal((await f.mod.reviewMentionNotifications(document.REPORT_ID,'a'))[0].threadId,'parent');
 f.db.pageComment.findMany=async()=>[{id:'c1',parentId:null as string|null,round:6,body:'Tag removed'}] as any;
 assert.equal((await f.mod.reviewMentionNotifications(document.REPORT_ID,'a')).length,0);
 f.db.pageComment.findMany=async()=>[];assert.equal((await f.mod.reviewMentionNotifications(document.REPORT_ID,'a')).length,0);
});
test('comment route queues mention delivery only after commit; locked and stale writes never notify',async()=>{
 let status='open',committed=false,notifications=0,saved=false,retry=false,sequence=0; const notified:string[]=[];
 const db:any={pageReview:{findUnique:async()=>({id:document.REPORT_ID,title:'Report',url:'',round:6,status}),update:async()=>({}),},pageComment:{count:async()=>0,create:async()=>{saved=true;return{id:'saved'+(++sequence)};},findMany:async()=>[]}};
 const mod=load('src/app/api/workspace/page-review/[id]/route.ts',{'@/lib/auth':{requireRole:async()=>({user:{id:'actor',name:'Ruilin Yuan',role:'admin'}})},'@/lib/page-review/feedback-memory':{captureReviewFeedback:async()=>{}},'@/lib/prisma':{prisma:db},'@/lib/symposium-report/store':{reportTransaction:async(fn:any)=>{const r=await fn(db);if(retry){const retried=await fn(db);committed=true;return retried;}committed=true;return r;}},'@/lib/page-review/mentions':{notifyReviewMentions:async(job:any)=>{assert(committed&&saved);notifications++;notified.push(job.commentId);return{sent:1};}},'@/lib/symposium-report/document':document,'@/lib/social/copy-review':social,'@/lib/page-review/brief':brief,'@/lib/page-review/limits':limits});
 const post=(expectedRound=6)=>mod.POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({action:'addComment',expectedRound,body:'Please check @Epshita Islam.'})}),{params:Promise.resolve({id:document.REPORT_ID})});
 assert.equal((await post(5)).status,409);status='exported';assert.equal((await post()).status,409);assert.equal(notifications,0);assert.equal(saved,false);
 status='open';assert.equal((await (await post()).json()).mentions.sent,1);assert.equal(notifications,1); retry=true;await post();assert.equal(notifications,2);assert.deepEqual(notified,['saved1','saved3'],'rolled-back attempt never queues mail');
});
test('mention directory requires signed-in staff and an existing review',async()=>{
 let session:any=null,exists=true,queries=0;
 const mod=load('src/app/api/workspace/page-review/[id]/mentions/route.ts',{'@/lib/auth':{requireRole:async()=>session},'@/lib/page-review/feedback-memory':{captureReviewFeedback:async()=>{}},'@/lib/prisma':{prisma:{pageReview:{findUnique:async()=>exists?{id:'review'}:null}}},'@/lib/page-review/mentions':{reviewMentionPeople:async()=>{queries++;return[{id:'a',label:'Epshita Islam'}];}},'@/lib/social/copy-review':social});
 const get=()=>mod.GET(new Request('https://test/api'),{params:Promise.resolve({id:'review'})});assert.equal((await get()).status,403);assert.equal(queries,0);
 session={user:{id:'staff'}};exists=false;assert.equal((await get()).status,404);assert.equal(queries,0);exists=true;const r=await get();assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal((await r.json()).people[0].label,'Epshita Islam');
});
test('notification endpoint uses the signed-in user, enforces staff access and validates acknowledgements',async()=>{
 let session:any=null,exists=true;const calls:any[]=[];
 const mod=load('src/app/api/workspace/page-review/[id]/mentions/notifications/route.ts',{
  '@/lib/auth':{requireRole:async()=>session},'@/lib/page-review/feedback-memory':{captureReviewFeedback:async()=>{}},'@/lib/prisma':{prisma:{pageReview:{findUnique:async()=>exists?{id:'review'}:null}}},
  '@/lib/social/copy-review':social,'@/lib/page-review/mentions':{
   reviewMentionNotifications:async(id:string,user:string)=>{calls.push(['read',id,user]);return[];},
   acknowledgeReviewMentions:async(id:string,user:string,ids:string[])=>{calls.push(['ack',id,user,ids]);return{read:1};}}});
 const ctx={params:Promise.resolve({id:'review'})};
 assert.equal((await mod.GET(new Request('https://test/api'),ctx)).status,403);assert.equal(calls.length,0);
 session={user:{id:'recipient'}};exists=false;assert.equal((await mod.GET(new Request('https://test/api'),ctx)).status,404);exists=true;
 const get=await mod.GET(new Request('https://test/api'),ctx);assert.equal(get.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(calls[0],['read','review','recipient']);
 const post=(body:any,origin='https://test')=>mod.POST(new Request('https://test/api',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)}),ctx);
 assert.equal((await post({ids:['n'],userId:'other'})).status,400);assert.equal((await post({ids:[]})).status,400);assert.equal((await post({ids:['n']},'https://evil.test')).status,403);
 assert.equal((await post({ids:['n']})).status,200);assert.deepEqual(calls[1],['ack','review','recipient',['n']]);
});

test('tag history retains dismissed tags and original thread context without leaking other recipients',async()=>{
 const f=fixture();await f.mod.notifyReviewMentions(f.job);const notification=(await f.mod.reviewMentionNotifications(document.REPORT_ID,'a'))[0];
 await f.mod.acknowledgeReviewMentions(document.REPORT_ID,'a',[notification.id]);
 const history=await f.mod.reviewMentionHistory(document.REPORT_ID,'a');assert.equal(history.items.length,1);assert(history.items[0].readAt);assert.equal(history.items[0].threadId,'c1');assert.equal(history.items[0].available,true);assert.equal(history.nextCursor,null);
 assert.equal((await f.mod.reviewMentionHistory(document.REPORT_ID,'b')).items.length,0);assert.equal((await f.mod.reviewMentionHistory('other','a')).items.length,0);
 assert.equal((await f.mod.reviewMentionHistory(document.REPORT_ID,'b',notification.id)).items.length,0);
 f.db.pageComment.findMany=async()=>[{id:'c1',parentId:null,round:6,body:'Tag removed'}] as any;const removed=await f.mod.reviewMentionHistory(document.REPORT_ID,'a');assert.equal(removed.items[0].tagRemoved,true);assert.equal(removed.items[0].available,true);
 f.db.pageComment.findMany=async()=>[];const deleted=await f.mod.reviewMentionHistory(document.REPORT_ID,'a');assert.equal(deleted.items[0].available,false);assert.equal(deleted.items[0].threadId,null);assert.equal(deleted.items[0].round,6);assert.equal(deleted.items[0].body,'');
});
test('tag history paginates older receipts and validates cursor ownership',async()=>{
 const f=fixture();await f.mod.notifyReviewMentions(f.job);const original=[...f.receipts.values()][0];f.receipts.clear();
 for(let i=0;i<31;i++)f.receipts.set('receipt-'+i,{...original,id:'receipt-'+i});
 const first=await f.mod.reviewMentionHistory(document.REPORT_ID,'a');assert.equal(first.items.length,25);assert.equal(first.nextCursor,'receipt-24');
 const second=await f.mod.reviewMentionHistory(document.REPORT_ID,'a',first.nextCursor);assert.equal(second.items.length,6);assert.equal(second.nextCursor,null);assert(!second.items.some((r:any)=>first.items.some((v:any)=>r.id===v.id)));
 assert.equal((await f.mod.reviewMentionHistory(document.REPORT_ID,'a','unknown')).items.length,0);
});
test('history API uses only the authenticated recipient and does not mark anything read',async()=>{
 const calls:any[]=[];const mod=load('src/app/api/workspace/page-review/[id]/mentions/notifications/route.ts',{
 '@/lib/auth':{requireRole:async()=>({user:{id:'recipient'}})},'@/lib/prisma':{prisma:{pageReview:{findUnique:async()=>({id:'review'})}}},'@/lib/social/copy-review':social,
 '@/lib/page-review/mentions':{reviewMentionHistory:async(...args:any[])=>{calls.push(args);return{items:[{id:'read-tag',readAt:'2026-11-24'}],nextCursor:null};},acknowledgeReviewMentions:async()=>{throw Error('History must not acknowledge');}}});
 const context={params:Promise.resolve({id:'review'})};const response=await mod.GET(new Request('https://test/api?history=1&userId=other&cursor=older'),context);
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(calls,[['review','recipient','older']]);assert.equal((await response.json()).items[0].id,'read-tag');
 assert.equal((await mod.GET(new Request('https://test/api?history=1&cursor='+('x'.repeat(401))),context)).status,400);
});
