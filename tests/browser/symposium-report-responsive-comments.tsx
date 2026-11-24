import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
import { REPORT_API, REPORT_ID, type Report } from "../../src/lib/symposium-report/document";

const origin = "https://editable-report.test";
const networkingText = [
  "Trainees joined career conversations with mentors across a range of fields. They explored day-to-day responsibilities, career transitions and practical steps toward work beyond academia.",
  "## Perspectives from mentors and trainees",
  ...Array.from({ length: 6 }, (_, i) => `“Conversation ${i + 1} connected research experience with professional responsibilities. The mentors shared useful examples of career decisions, transferable skills and practical next steps.” — Participant ${i + 1}`),
  "## Mentors and expertise",
  ...Array.from({ length: 17 }, (_, i) => `Mentor ${i + 1} · Professional role ${i + 1} · Organization ${i + 1}. Shares experience in life sciences and career development.`),
  "## Participating industry professionals",
  Array.from({ length: 17 }, (_, i) => `Mentor ${i + 1}`).join(" · "),
].join("\n\n");


const ventureFixture = { id: "venturelift", label: "Annual Symposium", title: "VentureLift Spotlight", frames: 1, showCaptions: false,
  text: Array.from({ length: 7 }, (_, i) => `## Venture ${i + 1} • Presenter ${i + 1}\n\n${"A trainee-led venture connects scientific research with practical development and validation. ".repeat(3)}\n[[photos:${i + 1}]]`).join("\n\n"),
  photos: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`workshop-${i + 1}-1`, { file: "cover.jpg", caption: `Venture ${i + 1} · Presenter ${i + 1}`, x: 50, y: 30, fit: "cover" }])) };

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from "react"; import {createRoot} from "react-dom/client";
        import {ReportEditor} from "./src/components/workspace/symposium-report/ReportEditor";
        const closed = location.search === "?closed";
        createRoot(document.getElementById("root")).render(<ReportEditor fullPageReview={location.search !== "?workspace"}
          report={{cover:{title:"Annual Symposium",theme:"Future workforce",date:"October 29"},
            pages:[{id:"summary",label:"Overview",title:"Summary",text:"Original report passage",frames:1,fillPhotos:false,photos:{"0":{file:"cover.jpg",caption:"An event photograph",x:50,y:50,fit:"cover"}}},{id:"structured-networking",label:"Career conversations",title:"Structured Networking",text:${JSON.stringify(networkingText)},frames:1,fillPhotos:false},{id:"annual-symposium",label:"Opening program",title:"Annual Symposium",text:"The opening program connected research, industry and careers.",frames:1,photos:{"0":{file:"keynote.jpg",caption:"Christopher Procyshyn keynote",x:50,y:40,fit:"cover"},"photo-0-1":{file:"welcome-1.webp",caption:"Molly Shoichet delivers the opening remarks",x:50,y:33,fit:"cover"}}},${JSON.stringify(ventureFixture)},{id:"cross-page-list",label:"List flow",title:"A continuing list",text:${JSON.stringify("- "+"A single list item keeps its meaning as it flows between linked pages. ".repeat(100))},frames:1,fillPhotos:false}],
            back:{title:"BioHubNet",text:"Connect"}}}
          revision={"a".repeat(64)} history={[{round:1,report:{cover:{title:"Archived title",theme:"Future workforce",date:"October 29"},pages:[{id:"summary",label:"Overview",title:"Summary",text:"Archived passage",frames:1,fillPhotos:false}],back:{title:"BioHubNet",text:"Connect"}}}]} recommendations={{}} meId="staff" isAdmin={location.search === "?ready"}
          review={{id:"${REPORT_ID}",url:"/review/symposium-2026/report",title:"Report",status:closed?"closed":"open",round:2,comments:location.search === "?workspace" ? [{id:"existing",parentId:null,round:2,anchorQuote:"Original report passage",anchorKey:"#report-frame-summary-0",anchorPath:null,anchorBlock:null,anchorState:"current",authorUserId:"staff",authorName:"Reviewer",authorKind:"user",body:"Existing feedback stays visible",status:"open",editCount:0,editedAt:null,editedByName:null,createdAt:"2026-11-20T12:00:00Z"}] : []}}/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    define: { "process.env.NEXT_PUBLIC_COMMIT_SHA": '"abc1234"' },
    outfile: "/private/tmp/symposium-editable-review/app.js", bundle: true, write: false, format: "iife", jsx: "automatic", external: ["/api/*"],
    plugins: [{ name: "review-server-mocks", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
      builder.onResolve({ filter: /review-invites$/ }, () => ({ path: "invites", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "router"
        ? "export const useRouter=()=>({refresh(){}});"
        : "export async function newsletterReviewTeam() {} export async function reportReviewHistory() {} export async function reportReviewRecipients() {} export async function sendReportReviewInvites() {}" }));
    } }],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let exported = false;
    let remoteSnapshot: Report | null = null, remoteRevision = "e".repeat(64);
    const comments: unknown[] = [];
    const selections: { anchorPath: string; anchorQuote: string | null; anchorKey: string; anchorBlock?: string; body: string }[] = [];
    const saves: { round: number; revision: string; report: { cover: { title: string }; pages: { text: string }[] } }[] = [];
    await page.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
      if (url.pathname === "/app.js" || url.pathname === "/app.css") return route.fulfill({
        contentType: url.pathname.endsWith("css") ? "text/css" : "application/javascript",
        body: bundle.outputFiles.find(file => file.path.endsWith(url.pathname))!.text,
      });
      if (url.pathname === REPORT_API + "/review") {
        if (url.searchParams.has("document") && remoteSnapshot) return route.fulfill({ json: { ok: true, report: remoteSnapshot, revision: remoteRevision, review: { round: 2, status: exported ? "exported" : "open" } } });
        if (route.request().method() === "POST") {
          assert.deepEqual(route.request().postDataJSON(), { action: "export", expectedRound: 2 });
          exported = true;
          return route.fulfill({ json: { ok: true, brief: "Checked Round 2 comments", review: { title: "Report", round: 2, status: "exported" } } });
        }
        if (url.searchParams.has("overlay")) return route.fulfill({ contentType: "application/javascript", body: overlaySource(REPORT_API + "/review", "Report", true, "/api/workspace/page-review/" + REPORT_ID) });
        return route.fulfill({ json: { ok: true, review: { title: "Report", round: 2, status: page.url().endsWith("?closed") ? "closed" : exported ? "exported" : "open" }, viewer: { name: "Staff" }, comments: page.url().endsWith("?ready") ? (comments as Record<string,unknown>[]).map(c=>({...c,status:"resolved"})) : comments, comparison: null } });
      }
      if (url.pathname === REPORT_API && route.request().method() === "GET") return route.fulfill({ json: { round: 2, since: "round", baseline: {"page:summary:label":"Overview","page:summary:title":"Summary","page:summary:text":"Original report passage"}, edits: [{id:"change",at:"2026-11-23T15:00:00Z",author:"Colleague",fields:[{key:"page:summary:text",label:"Summary · text",marks:[{kind:"del",text:"Original words"},{kind:"ins",text:"Revised words"}]}]}] } });
      if (url.pathname === REPORT_API && route.request().method() === "POST") {
        saves.push(route.request().postDataJSON());
        if (remoteSnapshot && saves.at(-1)!.revision !== remoteRevision) return route.fulfill({ status: 409, json: { error: "Newer team copy", current: remoteSnapshot, revision: remoteRevision } });
        if (remoteSnapshot) { remoteSnapshot = structuredClone(saves.at(-1)!.report) as Report; remoteRevision = "b".repeat(64); }
        if (saves.length > 1) return route.fulfill({ json: { revision: "b".repeat(64) } });
        // A colleague saved first: hand back their copy (a new back-cover title) for autosave to merge.
        const current = structuredClone(saves[0].report) as typeof saves[0]["report"] & { back: { title: string } };
        current.cover.title = "Annual Symposium";
        current.back.title = "BioHubNet Network";
        return route.fulfill({ status: 409, json: { error: "Someone saved a newer version.", current, revision: "c".repeat(64) } });
      }
      if (url.pathname === "/api/workspace/page-review/" + REPORT_ID + "/mentions") return route.fulfill({json:{people:[{id:"epshita",label:"Epshita Islam"},{id:"yeseul",label:"Yeseul Lee"}]}});
      if (url.pathname === "/api/workspace/page-review/" + REPORT_ID && route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        assert.equal(input.action, "addComment");
        assert.equal(input.expectedRound, 2);
        assert.equal(typeof input.anchorPath, "string");
        selections.push(input);
        comments.push({ ...input, id: "element-" + selections.length, parentId: null, round: 2, authorName: "Staff",
          authorKind: "user", status: "open", isMine: true, createdAt: "2026-11-19T12:00:00Z", editedAt: null, editedByName: null });
        return route.fulfill({ json: { ok: true, review: { comments }, mentions: {sent:input.body.includes("@")?1:0} } });
      }
      if (/\.(png|jpg|webp|svg)$/.test(url.pathname)) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#a9c1c4"/></svg>' });
      return route.fulfill({ status: 404 });
    });

    // A long comment stack reproduces a real report review, without production writes.
    for(let i=0;i<60;i++)comments.push({id:'existing-'+i,parentId:null,round:2,anchorKey:'#report-frame-summary-0',anchorQuote:'Original report passage',anchorPath:null,anchorBlock:null,anchorState:'current',authorName:'Reviewer',authorKind:'user',status:'open',body:'Detailed review feedback '+i+' about the report and its supporting photographs.',createdAt:'2026-11-24T12:00:00Z'});
    const measurements: unknown[]=[];
    const out=process.argv[2] || '/private/tmp/bhn-responsive-comments';
    const fs=await import('node:fs/promises');await fs.mkdir(out,{recursive:true});
    for(const width of [1920,1700,1512,1440,1366,1280,1100,1024,960]){
      await page.setViewportSize({width,height:800});await page.goto(origin);
      const slider=page.getByRole('slider',{name:'Comments panel size',exact:true});await expect(slider).toBeVisible();await slider.fill('960');
      const target=page.locator('#report-frame-back-0 [data-report-field="back.text"]');await target.scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>scrollY);assert(before>1000,'use a deep page');await target.click();
      const box=page.getByRole('textbox',{name:'New review comment',exact:true});await expect(box).toBeFocused();
      const after=await page.evaluate(()=>scrollY);
      assert(Math.abs(after-before)<4,'opening composer must not jump to report top: '+JSON.stringify({width,before,after}));
      const geometry=await page.evaluate(()=>{const p=document.querySelector('#bhn-review-overlay')!.getBoundingClientRect(),stage=document.querySelector('[data-report-paper]')!.getBoundingClientRect(),box=document.querySelector('.bhn-rv-compose textarea')!.getBoundingClientRect(),submit=document.querySelector('.bhn-rv-compose .bhn-rv-btn-primary')!.getBoundingClientRect();return{panel:{left:p.left,right:p.right,top:p.top,bottom:p.bottom,width:p.width},stageRight:stage.right,boxTop:box.top,boxBottom:box.bottom,submitBottom:submit.bottom,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
      assert(geometry.panel.left>=geometry.stageRight,'comments remain beside paper at '+width);
      assert(geometry.panel.top>=0&&geometry.panel.bottom<=800,'panel stays in viewport at '+width+JSON.stringify(geometry));
      assert(geometry.boxTop>=0&&geometry.boxBottom<=800&&geometry.submitBottom<=800,'composer and submit visible at '+width+JSON.stringify(geometry));assert(!geometry.overflow,'no horizontal overflow');
      await box.fill('Keep this unfinished feedback.');await slider.fill('743');await expect(box).toHaveValue('Keep this unfinished feedback.');
      measurements.push({width,before,after,...geometry});
      if(width===1366){await box.scrollIntoViewIfNeeded();}
      if(width===1366)await page.screenshot({path:out+'/laptop-1366-comments.png'});
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    for(const width of [900,768,390]){
      await page.setViewportSize({width,height:844});await page.goto(origin);
      const toggle=page.getByRole('button',{name:/^Expand .* comments$/});await expect(toggle).toBeVisible();await expect(page.getByRole('toolbar',{name:'Report review toolbar'})).toBeHidden();
      const target=page.locator('#report-frame-back-0 [data-report-field="back.text"]');await target.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await target.click();const box=page.getByRole('textbox',{name:'New review comment',exact:true});await expect(box).toBeFocused();assert(Math.abs((await page.evaluate(()=>scrollY))-before)<4,'mobile composer retains reading position');
      const p=(await page.locator('#bhn-review-overlay').boundingBox())!;assert(p.x>=0&&p.x+p.width<=width&&p.y>=0&&p.y+p.height<=844,'drawer stays within viewport');
      const submit=page.getByRole('button',{name:'Add comment',exact:true});const b=(await submit.boundingBox())!;assert(b.y>=0&&b.y+b.height<=844,'mobile submit accessible');
      if(width===390)await page.screenshot({path:out+'/mobile-390-comments.png'});
      await box.fill('Unfinished mobile note');await page.getByRole('button',{name:'Collapse comments',exact:true}).click();await toggle.click();await expect(box).toHaveValue('Unfinished mobile note');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Collapse comments',exact:true}).click();await target.click();await expect(box).toBeFocused();
      await box.fill('Mock comment only');await submit.click();await expect(box).toHaveCount(0);
      measurements.push({width,mobile:true,panel:p});
    }
    assert.equal(saves.length,0,'display changes do not save report content');assert.equal(selections.length,3,'only mocked mobile submissions');assert.deepEqual(errors,[]);
    await fs.writeFile(out+'/responsive-verification.json',JSON.stringify(measurements,null,2));console.log('PASS: 12 viewport sizes, long review history, deep-page focus/submit without page jumps, bounded sidebars/drawers, draft retention; mocked submissions only.');
  } finally {await browser.close();}
}
void main();
