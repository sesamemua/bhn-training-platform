import assert from 'node:assert/strict';
import test from 'node:test';
import {reportSchema} from '../../src/lib/symposium-report/document';
import {reportReviewSnapshot} from '../../src/lib/symposium-report/review-snapshot';
import {reportBlocks} from '../../src/lib/symposium-report/paginate';
import {editorialAction,ventureHeading} from '../../src/lib/symposium-report/editorial';

test('recoded three-sector chart and historical four-sector reports both remain editable',()=>{
 const categories=[{label:'Academic / Hospital / Research Institution',count:198},{label:'Industry / Company',count:46},{label:'Government / Nonprofit / Philanthropic',count:14}];
 const report={cover:{title:'Report',theme:'Theme',date:'October'},pages:[{id:'symposium-at-a-glance',label:'Symposium',title:'At a glance',text:'',frames:1,registration:{unit:'participants',source:'Reviewed affiliation correction',categories,percentagesOnly:true}}],back:{title:'Connect',text:'Community'}};
 const current=reportSchema.parse(report);assert.equal(current.pages[0].registration!.categories.reduce((n,c)=>n+c.count,0),258);
 const old=structuredClone(report);old.pages[0].registration.categories=[{label:categories[0].label,count:197},{label:categories[1].label,count:45},categories[2],{label:'Other',count:2}];
 assert.equal(reportSchema.safeParse(old).success,true);
 const snapshot=reportReviewSnapshot(current,'https://report.test');assert.match(snapshot,/77%/);assert.match(snapshot,/18%/);assert.match(snapshot,/5%/);assert.doesNotMatch(snapshot,/\d\.\d%/);assert.doesNotMatch(snapshot,/Other/);
});

test('venture pairing keeps the title with its exact photo-linked description, including continued fragments',()=>{
 const text='## Venture One\n\nFirst description\n[[photos:1]]\n\n## Venture Two\n\nSecond description\n[[photos:2]]';
 const blocks=reportBlocks(text);const page={id:'venturelift',label:'Symposium',title:'Ventures',text,frames:1};
 assert.equal(ventureHeading(page,blocks,1)?.text,'Venture One');assert.equal(ventureHeading(page,blocks,3)?.text,'Venture Two');
 assert.equal(ventureHeading(page,blocks,0),undefined);assert.equal(ventureHeading({...page,id:'training-week'},blocks,1),undefined);
 assert.equal(ventureHeading(page,[{...blocks[1],continued:true}],0),undefined);
 assert.equal(blocks[3].start,text.indexOf('Second description'));
});

test('the requested training button links only the exact program platform text',()=>{
 const page={id:'program-impact',label:'Program',title:'Impact',text:'BioHubNet Online Training Platform',frames:1};const block=reportBlocks(page.text)[0];
 assert.equal(editorialAction(page,block),'https://app.biohubnet.ca/userlogin/');assert.equal(editorialAction({...page,id:'other'},block),undefined);assert.equal(editorialAction(page,{...block,text:'Different text'}),undefined);
});
