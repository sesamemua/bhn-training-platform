/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated browser fixture supplies only the DOM/fetch used by the overlay. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {overlaySource} from '../../src/lib/page-review/overlay-source';
const settle=()=>new Promise(resolve=>setTimeout(resolve,60));
function fixture(surface:'report'|'social'='report',unread=false,visible=false,annotation?:'drawing'|'insertion'){
 let acknowledgements=0;
 const comment={id:'old',parentId:null,round:8,status:'open',body:annotation==='insertion'?'[Section insertion request] Add an example.':'Please check @Reviewer One.',anchorBlock:annotation==='drawing'?'Page 2 · [draw:circle:0.1,0.1,0.8,0.7]':annotation==='insertion'?'Page 2 · Insert section after':'',authorName:'Colleague',anchorKey:'#report-frame-summary-0',anchorPath:'#passage',anchorQuote:'Review paragraph',createdAt:'2026-11-24T18:00:00Z'};
 const receipt={id:'receipt',commentId:'old',threadId:'old',round:8,body:comment.body,authorName:'Colleague',createdAt:comment.createdAt,readAt:'2026-11-24T19:00:00Z',available:true};
 const dom=new JSDOM('<!doctype html><div data-report-mentions-host></div><div data-report-tools-host></div><main data-report-paper><div id="report-frame-summary-0"><div data-report-page-notes="summary-0"></div><article data-print-page aria-label="Page 2"><p id="passage">Review paragraph</p></article></div></main><script data-round="9">'+overlaySource('/review','Report',true,'/comments',surface)+'</script>',{
  url:'https://review.test',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){
   window.matchMedia=((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false},onchange:null})) as any;
   window.fetch=(async(url:string,init?:RequestInit)=>{
    if(url.includes('notifications?history=1'))return{ok:true,json:async()=>({items:[receipt],nextCursor:null})};
    if(url.includes('notifications')){if(init?.method==='POST'){acknowledgements++;unread=false;return{ok:true,json:async()=>({read:1})};}return{ok:true,json:async()=>({notifications:unread?[{...receipt,readAt:null}]:[]})};}
    if(url==='/review')return{ok:true,json:async()=>({ok:true,review:{title:'Report',round:9,status:'open'},viewer:{name:'Reviewer One'},comments:[comment],comparison:null})};
    return{ok:true,json:async()=>({people:[]})};
   }) as any;
   window.HTMLElement.prototype.getBoundingClientRect=function(){const top=this.id==='passage'&&!visible?1800:100;return{x:0,y:top,top,left:0,bottom:top+100,right:500,width:500,height:100,toJSON(){return{}}};};
  }});
 return{dom,acknowledgements:()=>acknowledgements};
}
test('opening older threads preserves panel scroll, bounds its height and omits offscreen markers',async()=>{
 const f=fixture();try{await settle();const doc=f.dom.window.document;const history=doc.querySelector<HTMLDetailsElement>('.bhn-rv-history')!;history.open=true;history.dispatchEvent(new f.dom.window.Event('toggle'));await settle();
 const body=doc.querySelector<HTMLElement>('.bhn-rv-body')!;body.scrollTop=600;
 doc.querySelector<HTMLButtonElement>('.bhn-rv-thread-toggle')!.click();await settle();
 assert.equal(doc.querySelector<HTMLElement>('.bhn-rv-body')!.scrollTop,600);assert.equal(doc.querySelector<HTMLElement>('.bhn-rv-shell')!.style.maxHeight,'656px');assert.equal(doc.querySelectorAll('.bhn-review-marker').length,0);
 }finally{f.dom.window.close();}
});
test('read tags remain accessible from the persistent launcher and history browsing does not acknowledge',async()=>{
 const f=fixture();try{await settle();const doc=f.dom.window.document;const launcher=doc.querySelector<HTMLButtonElement>('.bhn-rv-tag-launcher')!;assert(launcher);launcher.click();await settle();
 assert.equal(doc.querySelector('.bhn-rv-tag-status')?.textContent,'Read');assert.match(doc.querySelector('.bhn-rv-tag-history')!.textContent!,/Please check @Reviewer One/);assert.equal(f.acknowledgements(),0);assert.equal(doc.querySelectorAll('.bhn-rv-mention-popup').length,0);
 doc.querySelector<HTMLButtonElement>('[aria-label="Close mentions"]')!.click();assert.equal(doc.querySelector('.bhn-rv-tag-history'),null);assert(doc.querySelector('.bhn-rv-tag-launcher'));launcher.click();await settle();assert.equal(doc.querySelectorAll('.bhn-rv-tag-item').length,1);assert.equal(f.acknowledgements(),0);
 }finally{f.dom.window.close();}
});

test('staff social reviews reuse the persistent tag history without changing content',async()=>{
 const f=fixture('social');try{await settle();const doc=f.dom.window.document;doc.querySelector<HTMLButtonElement>('.bhn-rv-tag-launcher')!.click();await settle();
 assert.match(doc.querySelector('.bhn-rv-tag-history')!.textContent!,/Please check @Reviewer One/);assert.equal(doc.querySelectorAll('.bhn-rv-compose').length,0);assert.equal(f.acknowledgements(),0);
 }finally{f.dom.window.close();}
});

test('report scrolling reuses marker nodes and never rewrites page feedback controls',async()=>{
 const f=fixture('report',false,true);try{await settle();const win=f.dom.window,doc=win.document;doc.querySelector<HTMLDetailsElement>('.bhn-rv-history')!.open=true;doc.querySelector('.bhn-rv-history')!.dispatchEvent(new win.Event('toggle'));await settle();
 const marker=doc.querySelector('.bhn-review-marker');assert(marker);const markerText=marker.firstChild;const feedback=doc.querySelector('[data-report-page-notes]')!;let noteMutations=0;
 const observer=new win.MutationObserver(records=>{noteMutations+=records.length;});observer.observe(feedback,{attributes:true,subtree:true,childList:true});
 for(let i=0;i<20;i++)win.dispatchEvent(new win.Event('scroll'));await settle();
 assert.equal(doc.querySelector('.bhn-review-marker'),marker,'scrolling must reposition existing markers rather than remove/recreate');assert.equal(marker.firstChild,markerText,'scrolling must retain the marker text node too');assert.equal(noteMutations,0,'page-feedback state is updated on content/state changes, never on scroll');observer.disconnect();
 }finally{f.dom.window.close();}
});
test('Mentions docks into report navigation, signals unread and stops glowing after acknowledgement',async()=>{
 const f=fixture('report',true);try{await settle();const doc=f.dom.window.document,launcher=doc.querySelector<HTMLButtonElement>('.bhn-rv-tag-launcher')!;
 assert.equal(launcher.parentElement,doc.querySelector('[data-report-mentions-host]'));assert.match(launcher.textContent!,/Mentions/);assert.equal(launcher.dataset.unread,'true');assert.match(launcher.getAttribute('aria-label')!,/1 unread/);assert(launcher.classList.contains('bhn-rv-mentions-pulse'));
 doc.querySelector<HTMLButtonElement>('.bhn-rv-mention-actions button:last-child')!.click();await settle();assert.equal(launcher.dataset.unread,'false');assert(!launcher.classList.contains('bhn-rv-mentions-pulse'));assert.equal(f.acknowledgements(),1);launcher.click();await settle();assert(doc.querySelector('[aria-label="Mentions"]'));
 }finally{f.dom.window.close();}
});

test('scrolling retains drawing overlays and section-insertion anchors without rebuilding them',async()=>{
 for(const annotation of ['drawing','insertion'] as const){const f=fixture('report',false,true,annotation);try{await settle();const win=f.dom.window,doc=win.document;const history=doc.querySelector<HTMLDetailsElement>('.bhn-rv-history')!;history.open=true;history.dispatchEvent(new win.Event('toggle'));await settle();
 const marker=doc.querySelector('.bhn-review-marker');assert(marker);const drawing=doc.querySelector('.bhn-report-drawing');if(annotation==='drawing')assert(drawing);else{assert(marker.classList.contains('bhn-report-insertion-bubble'));assert.match(marker.textContent!,/Add an example/);}
 for(let i=0;i<8;i++)win.dispatchEvent(new win.Event('scroll'));await settle();assert.equal(doc.querySelector('.bhn-review-marker'),marker);
 if(annotation==='drawing')assert.equal(doc.querySelector('.bhn-report-drawing'),drawing);else assert(marker.classList.contains('bhn-report-insertion-bubble'));
 }finally{f.dom.window.close();}}
});
