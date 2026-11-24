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

    await page.goto(origin);await expect(page.locator('#bhn-review-overlay')).toBeVisible();
    await expect(page.locator('#bhn-review-overlay')).toHaveAttribute('data-picking-element','false');
    await expect(page.getByRole('button',{name:'Edit & comment',exact:true})).toHaveAttribute('aria-pressed','true');
    const toolbar=page.getByRole('toolbar',{name:'Report review toolbar'});assert((await toolbar.boundingBox())!.height<=55,'one compact row');
    await expect(page.locator('.bhn-rv-head').getByText('Panel size',{exact:false})).toBeVisible();
    const slider=page.getByRole('slider',{name:'Comments panel size',exact:true});await slider.fill('743');await expect(slider).toHaveValue('743');
    const title=page.getByRole('textbox',{name:'Cover title',exact:true});await title.click();await expect(title).toBeFocused();await expect(page.getByRole('textbox',{name:'New review comment'})).toHaveCount(0);
    await title.fill('Direct edit without a mode switch');await title.press('Enter');await expect.poll(()=>saves.length).toBe(2);
    const targets=[page.locator('#report-frame-cover-0 h1'),page.locator('#report-frame-summary-0 header>span'),page.locator('#report-frame-summary-0 footer span').first(),page.locator('#report-frame-summary-0 figure img'),page.locator('#report-frame-summary-0 figcaption'),page.locator('#report-frame-cover-0 img[src$="cover.jpg"]')];
    for(const [i,target] of targets.entries()){
      await target.hover();const button=page.getByRole('button',{name:'Comment on selected report element',exact:true});await expect(button).toBeVisible();await button.click();
      const box=page.getByRole('textbox',{name:'New review comment',exact:true});await expect(box).toBeFocused();await expect(page.getByRole('dialog',{name:'Swap or crop photo'})).toHaveCount(0);
      await box.fill('Review element '+i);await page.getByRole('button',{name:'Add comment',exact:true}).click();assert.equal(await target.evaluate((e,path)=>document.querySelector(path)===e,selections.at(-1)!.anchorPath),true);
    }
    const picture=page.locator('#report-frame-summary-0 figure img');await picture.click();await expect(page.getByRole('dialog',{name:'Swap or crop photo'})).toBeVisible();await page.getByRole('dialog',{name:'Swap or crop photo'}).getByRole('button',{name:'Cancel',exact:true}).click();
    const more=page.locator('.bhn-report-menu').filter({hasText:'Comment on an element'});await more.locator(':scope > summary').click();await more.getByText('Panel size presets',{exact:true}).click();await more.getByRole('button',{name:'Comfortable',exact:true}).click();await expect(slider).toHaveValue('640');await page.keyboard.press('Escape');assert.equal(await more.getAttribute('open'),null,'Escape closes compact menu');
    await picture.hover();await page.getByRole('button',{name:'Comment on selected report element',exact:true}).click();await page.getByRole('textbox',{name:'New review comment',exact:true}).fill('Keep this unfinished note');await slider.fill('780');await expect(page.getByRole('textbox',{name:'New review comment',exact:true})).toHaveValue('Keep this unfinished note');await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.setViewportSize({width:1366,height:800});await page.getByRole('button',{name:'Back cover',exact:true}).click();const last=page.locator('#report-frame-back-0 [data-report-field="back.text"]');await last.hover();const before=await page.evaluate(()=>scrollY);await page.getByRole('button',{name:'Comment on selected report element',exact:true}).click();await expect(page.getByRole('textbox',{name:'New review comment',exact:true})).toBeFocused();assert(Math.abs((await page.evaluate(()=>scrollY))-before)<4);await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.getByRole('button',{name:/^Expand .* comments$/})).toBeVisible();await last.click();await last.hover();await page.getByRole('button',{name:'Comment on selected report element',exact:true}).click();await expect(page.getByRole('textbox',{name:'New review comment',exact:true})).toBeFocused();
    assert.deepEqual(errors,[]);console.log('PASS: compact toolbar, header slider/presets, direct edits/autosave, precise comments on text/header/footer/photos/captions, native photo tools, unsent draft retention, laptop/mobile access. Mocked writes only.');
  }finally{await browser.close();}
}
void main();
