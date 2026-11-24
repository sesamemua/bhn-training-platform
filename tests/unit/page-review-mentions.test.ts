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
 const receipts=new Map<string,any>(), mails:any[]=[];let configured=true,fail=false;
 const db={user:{findMany:async()=>people},auditLog:{createMany:async({data}:any)=>{if(receipts.has(data[0].id))return{count:0};receipts.set(data[0].id,data[0]);return{count:1};},update:async({where,data}:any)=>Object.assign(receipts.get(where.id),data)}};
 const mod=load('src/lib/page-review/mentions.ts',{'@/lib/prisma':{prisma:db},'@/lib/mail':{mailConfigured:()=>configured,sendMail:async(mail:any)=>{if(fail)throw Error('Mail failure');mails.push(mail);}},'@/lib/workspace-review-invites':{staffReviewRecipients:{isActive:true}},'@/lib/symposium-report/document':document,'@/lib/social/copy-review':social});
 const job={reviewId:document.REPORT_ID,commentId:'c1',round:6,title:'Report',url:'',body:'Please check @Epshita Islam.',actor:{id:'actor',name:'Ruilin Yuan'}};
 return{mod,db,mails,receipts,job,setConfigured:(v:boolean)=>configured=v,setFail:(v:boolean)=>fail=v};
}
test('full name tags exclude arbitrary addresses, self, partial names and ambiguous names',()=>{
 const f=fixture();assert.deepEqual(f.mod.mentionedColleagues('Ask @Epshita Islam, @Yeseul Lee! @Ruilin Yuan @Same Name @other@example.com @Epshita',people,'actor').map((p:any)=>p.id),['a','b']);
 assert.equal(f.mod.mentionedColleagues('Not an @Epshita Islamic match',people,'actor').length,0);
 assert.equal(f.mod.mentionedColleagues('Thanks @epshita   islam.',people,'actor')[0].id,'a');
});
test('directory exposes labels and ids only; notification is deduplicated with a direct comment link',async()=>{
 const f=fixture();const list=await f.mod.reviewMentionPeople();assert(!JSON.stringify(list).includes('@'));assert(!list.some((p:any)=>p.label==='Same Name'));
 assert.equal((await f.mod.notifyReviewMentions(f.job)).sent,1);assert.equal((await f.mod.notifyReviewMentions(f.job)).sent,0);assert.equal(f.mails.length,1);
 assert.match(f.mails[0].text,/review\/symposium-2026\/report\?review=symposium-2026-event-report&comment=c1/);
 assert.equal(JSON.parse([...f.receipts.values()][0].detail).delivery,'sent');
});
test('editing unchanged mentions sends nothing; adding another colleague sends only to the new colleague',async()=>{
 const f=fixture();assert.equal((await f.mod.notifyReviewMentions({...f.job,previousBody:f.job.body})).sent,0);
 assert.equal((await f.mod.notifyReviewMentions({...f.job,previousBody:f.job.body,body:f.job.body+' Ask @Yeseul Lee too.'})).sent,1);assert.equal(f.mails[0].to,'yeseul@example.test');
});
test('unconfigured or failed mail returns an honest saved-comment warning',async()=>{
 const f=fixture();f.setConfigured(false);assert.match((await f.mod.notifyReviewMentions(f.job)).warning,/not configured/);assert.equal(f.receipts.size,0);
 f.setConfigured(true);f.setFail(true);assert.match((await f.mod.notifyReviewMentions(f.job)).warning,/could not be delivered/);assert.equal(JSON.parse([...f.receipts.values()][0].detail).delivery,'failed');
});
test('comment route queues mention delivery only after commit; locked and stale writes never notify',async()=>{
 let status='open',committed=false,notifications=0,saved=false,retry=false,sequence=0; const notified:string[]=[];
 const db:any={pageReview:{findUnique:async()=>({id:document.REPORT_ID,title:'Report',url:'',round:6,status}),update:async()=>({}),},pageComment:{count:async()=>0,create:async()=>{saved=true;return{id:'saved'+(++sequence)};},findMany:async()=>[]}};
 const mod=load('src/app/api/workspace/page-review/[id]/route.ts',{'@/lib/auth':{requireRole:async()=>({user:{id:'actor',name:'Ruilin Yuan',role:'admin'}})},'@/lib/prisma':{prisma:db},'@/lib/symposium-report/store':{reportTransaction:async(fn:any)=>{const r=await fn(db);if(retry){const retried=await fn(db);committed=true;return retried;}committed=true;return r;}},'@/lib/page-review/mentions':{notifyReviewMentions:async(job:any)=>{assert(committed&&saved);notifications++;notified.push(job.commentId);return{sent:1};}},'@/lib/symposium-report/document':document,'@/lib/social/copy-review':social,'@/lib/page-review/brief':brief,'@/lib/page-review/limits':limits});
 const post=(expectedRound=6)=>mod.POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({action:'addComment',expectedRound,body:'Please check @Epshita Islam.'})}),{params:Promise.resolve({id:document.REPORT_ID})});
 assert.equal((await post(5)).status,409);status='exported';assert.equal((await post()).status,409);assert.equal(notifications,0);assert.equal(saved,false);
 status='open';assert.equal((await (await post()).json()).mentions.sent,1);assert.equal(notifications,1); retry=true;await post();assert.equal(notifications,2);assert.deepEqual(notified,['saved1','saved3'],'rolled-back attempt never queues mail');
});
test('mention directory requires signed-in staff and an existing review',async()=>{
 let session:any=null,exists=true,queries=0;
 const mod=load('src/app/api/workspace/page-review/[id]/mentions/route.ts',{'@/lib/auth':{requireRole:async()=>session},'@/lib/prisma':{prisma:{pageReview:{findUnique:async()=>exists?{id:'review'}:null}}},'@/lib/page-review/mentions':{reviewMentionPeople:async()=>{queries++;return[{id:'a',label:'Epshita Islam'}];}},'@/lib/social/copy-review':social});
 const get=()=>mod.GET(new Request('https://test/api'),{params:Promise.resolve({id:'review'})});assert.equal((await get()).status,403);assert.equal(queries,0);
 session={user:{id:'staff'}};exists=false;assert.equal((await get()).status,404);assert.equal(queries,0);exists=true;const r=await get();assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal((await r.json()).people[0].label,'Epshita Islam');
});
