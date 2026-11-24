import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { overlaySource } from '../../src/lib/page-review/overlay-source';
import { REPORT_API, REPORT_ID } from '../../src/lib/symposium-report/document';
async function main(){
 const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});let posts=0;
 const comment={id:'mentioned',parentId:null,round:6,status:'open',body:'Please check @Epshita Islam.',authorName:'Ruilin Yuan',authorKind:'user',createdAt:'2026-11-24T16:00:00Z',anchorKey:'#report-frame-summary-0',anchorPath:'img#zoomed',anchorQuote:null,anchorState:'current'};
 await page.route('https://mention-fixture.test/**',route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='POST'){posts++;return route.fulfill({status:409,json:{locked:true}});}
  if(url.pathname===REPORT_API+'/review')return route.fulfill({json:{ok:true,review:{title:'Report',round:6,status:'exported'},viewer:{name:'Staff'},comments:[comment],comparison:null}});
  return route.fulfill({contentType:'text/html; charset=utf-8',body:`<html><head><style>*{box-sizing:border-box}</style></head><body><div data-report-tools-host></div><main data-report-paper><div id="report-frame-summary-0"><article data-print-page style="margin:80px;width:600px;height:800px"><figure data-report-photo="cover.jpg"><div style="position:relative;width:400px;height:260px;overflow:hidden"><img id="zoomed" alt="Symposium group" style="width:100%;height:100%;scale:1.5;object-fit:cover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='600' height='400' fill='%23589'%3E%3C/rect%3E%3C/svg%3E"></div><figcaption>Group discussion</figcaption></figure></article></div></main><script data-round="6">${overlaySource(REPORT_API+'/review','Report',true,'/api/workspace/page-review/'+REPORT_ID)}</script></body></html>`});
 });
 await page.goto('https://mention-fixture.test/?comment=mentioned');await expect(page.locator('[data-thread-id=mentioned]')).toContainText('Please check @Epshita Islam.');await expect(page.locator('.bhn-review-highlight-flash')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{const a=document.querySelector('.bhn-review-highlight')!.getBoundingClientRect(),b=document.querySelector('figure[data-report-photo] > div')!.getBoundingClientRect();return Math.abs(a.width-b.width)+Math.abs(a.height-b.height)+Math.abs(a.left-b.left)+Math.abs(a.top-b.top);})).toBeLessThan(2);
 assert.equal(await page.locator('.bhn-rv-lock-icon').evaluate(el=>getComputedStyle(el).fontSize),'64px');
 await expect(page.getByRole('status',{name:'Round 6 commenting locked'})).toContainText('locked while revisions are underway');
 await expect(page.getByRole('textbox',{name:'New review comment'})).toHaveCount(0);assert.equal(posts,0);
 // Old review anchors survive the directory's move and replacement of dot separators with line breaks.
await page.route('https://mention-fixture.test'+REPORT_API+'/review',route=>route.fulfill({json:{ok:true,review:{title:'Report',round:6,status:'exported'},viewer:{name:'Staff'},comments:[{...comment,id:'profile',status:'resolved',anchorKey:'#report-frame-structured-networking-1',anchorPath:'div#report-frame-structured-networking-1 > p',anchorQuote:'Shadan Ashfaie · Enterprise AI Transformation & Applied AI Portfolio Leader | Advisor · Amgen (Consultant)'}],comparison:null}}));
await page.goto('https://mention-fixture.test/?comment=profile');await expect(page.getByRole('status',{name:'Round 6 commenting locked'})).toContainText('Round 7 is ready for review');
await page.locator('[data-print-page]').evaluate(el=>{const p=document.createElement('p');p.textContent='Shadan Ashfaie\nEnterprise AI Transformation & Applied AI Portfolio Leader | Advisor\nAmgen (Consultant)';el.append(p);});
await page.getByRole('button',{name:'Show comment 1 on page',exact:true}).click();await expect(page.locator('.bhn-review-highlight')).toBeVisible();
await expect.poll(()=>page.evaluate(()=>Math.abs(document.querySelector('.bhn-review-highlight')!.getBoundingClientRect().width-document.querySelector('[data-print-page] p')!.getBoundingClientRect().width))).toBeLessThan(5);
await page.route('https://mention-fixture.test'+REPORT_API+'/review',route=>route.fulfill({json:{ok:true,review:{title:'Report',round:6,status:'exported'},viewer:{name:'Staff'},comments:[{...comment,id:'short-title',status:'resolved',anchorKey:'#report-frame-structured-networking-1',anchorPath:'div#report-frame-structured-networking-1 > h3',anchorQuote:'AI transformation'}],comparison:null}}));
await page.goto('https://mention-fixture.test/?comment=short-title');await page.locator('[data-print-page]').evaluate(el=>{const h=document.createElement('h3');h.textContent='AI Transformation';el.append(h);});await page.getByRole('button',{name:'Show comment 1 on page',exact:true}).click();await expect(page.locator('.bhn-review-highlight')).toBeVisible();
await expect.poll(()=>page.evaluate(()=>Math.abs(document.querySelector('.bhn-review-highlight')!.getBoundingClientRect().height-document.querySelector('[data-print-page] h3')!.getBoundingClientRect().height))).toBeLessThan(2);
console.log('PASS: mention deep link opens the thread and highlights only the visible crop; locked round remains read-only.');
 }finally{await browser.close();}
}void main();
