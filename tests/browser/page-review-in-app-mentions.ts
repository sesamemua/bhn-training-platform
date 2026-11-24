import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { overlaySource } from '../../src/lib/page-review/overlay-source';
import { REPORT_API, REPORT_ID } from '../../src/lib/symposium-report/document';
async function main(){
 const browser=await chromium.launch();
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});let locked=false,unread=true,posts=0,acks=0,replyBody='';const body='Please check @Epshita Islam.';
 const endpoint='/api/workspace/page-review/'+REPORT_ID;
 const comment={id:'tagged',parentId:null,round:8,status:'open',body,authorName:'Ruilin Yuan',authorKind:'user',createdAt:'2026-11-24T22:00:00Z',anchorKey:'#report-frame-summary-0',anchorPath:'p#paragraph',anchorQuote:'Review paragraph',anchorState:'current'};
 await page.route('https://inapp-mention.test/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname===endpoint+'/mentions/notifications'){
   if(route.request().method()==='POST'){acks++;unread=false;return route.fulfill({json:{read:1}});}
   return route.fulfill({json:{notifications:unread?[{id:'receipt',commentId:'tagged',threadId:'tagged',round:8,body,authorName:'Ruilin Yuan'}]:[]}});
  }
  if(url.pathname===endpoint+'/mentions')return route.fulfill({json:{people:[{id:'colleague',label:'Yeseul Lee'}]}});
  if(route.request().method()==='POST'){
   posts++;const input=route.request().postDataJSON();assert.equal(input.action,'addComment');assert.equal(input.parentId,'tagged');replyBody=input.body;
   return route.fulfill({json:{ok:true,mentions:{sent:1}}});
  }
  if(url.pathname===REPORT_API+'/review')return route.fulfill({json:{ok:true,review:{title:'Report',round:8,status:locked?'exported':'open'},viewer:{name:'Epshita Islam'},comments:[{...comment,body},...(replyBody?[{...comment,id:'reply',parentId:'tagged',body:replyBody,authorName:'Epshita Islam'}]:[])],comparison:null}});
  return route.fulfill({contentType:'text/html',body:`<html><head><style>*{box-sizing:border-box}</style></head><body><div data-report-tools-host></div><main data-report-paper><div id="report-frame-summary-0"><article data-print-page style="margin:80px;width:600px;height:800px"><p id="paragraph">Review paragraph</p></article></div></main><script data-round="8">${overlaySource(REPORT_API+'/review','Report',true,endpoint)}</script></body></html>`});
 });
 const popup=page.getByRole('region',{name:'Mentions for you'});
 await page.goto('https://inapp-mention.test/');await expect(popup).toContainText('You were tagged by Ruilin Yuan');
 await expect(popup.getByRole('button',{name:'View & reply',exact:true})).toBeVisible();assert.equal(posts,0);
 await popup.getByRole('button',{name:'View & reply',exact:true}).click();await expect(popup).toHaveCount(0);
 const reply=page.getByRole('textbox',{name:'Reply to Ruilin Yuan',exact:true});await expect(reply).toBeVisible();assert.equal(acks,1);
 await reply.fill('Thanks @Yeseul Lee');await expect(page.locator('[role=listbox]')).toContainText('Yeseul Lee');
 await page.getByRole('button',{name:'Reply',exact:true}).last().click();await expect(page.locator('.bhn-rv-reply-body')).toContainText('Thanks @Yeseul Lee');assert.equal(posts,1);
 await expect(page.locator('#bhn-review-overlay')).not.toContainText('email');
 await page.reload();await expect(popup).toHaveCount(0);
 // New arrivals never overwrite unfinished reply drafts or steal focus.
 unread=true;replyBody='';await page.reload();await expect(popup).toBeVisible();
 await page.locator('.bhn-rv-thread-toggle').click();await page.getByRole('button',{name:'Reply',exact:true}).click();
 await reply.fill('Keep my unfinished work');await popup.getByRole('button',{name:'View & reply',exact:true}).click();
 await expect(reply).toHaveValue('Keep my unfinished work');await expect(popup).toContainText('Your draft is preserved');assert.equal(acks,1);
 await popup.getByRole('button',{name:'Dismiss',exact:true}).click();await expect(popup).toHaveCount(0);await expect(reply).toHaveValue('Keep my unfinished work');assert.equal(acks,2);
 // Locked rounds expose a view action, no writable reply. Popup stays within mobile viewport.
 locked=true;unread=true;await page.setViewportSize({width:390,height:844});await page.reload();await expect(popup).toContainText('This round is locked');
 await expect(popup.getByRole('button',{name:'View & reply',exact:true})).toHaveCount(0);
 const rect=await popup.boundingBox();assert(rect&&rect.x>=0&&rect.x+rect.width<=390&&rect.y>=0&&rect.y+rect.height<=844);
 await popup.getByRole('button',{name:'View thread',exact:true}).click();await expect(reply).toHaveCount(0);await expect(popup).toHaveCount(0);assert.equal(posts,1);
 console.log('PASS: in-page tag popup, existing threaded reply and mention autocomplete, dismissal across reload, draft protection, locked view-only and mobile bounds. No email.');
 }finally{await browser.close();}
}void main();
