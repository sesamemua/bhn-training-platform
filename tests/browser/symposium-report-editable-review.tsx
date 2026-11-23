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

const longBullet = "A single list item keeps its meaning as it flows between linked pages. ".repeat(100);

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
          revision={"a".repeat(64)} history={[{round:1,report:{cover:{title:"Archived title",theme:"Future workforce",date:"October 29"},pages:[{id:"summary",label:"Overview",title:"Summary",text:"Archived passage",frames:1,fillPhotos:false}],back:{title:"BioHubNet",text:"Connect"}}}]} recommendations={{}} meId="staff" isAdmin={false}
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let exported = false, exports = 0;
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
          exported = true; exports++;
          return route.fulfill({ json: { ok: true, brief: "Checked Round 2 comments", review: { title: "Report", round: 2, status: "exported" } } });
        }
        if (url.searchParams.has("overlay")) return route.fulfill({ contentType: "application/javascript", body: overlaySource(REPORT_API + "/review", "Report", true, "/api/workspace/page-review/" + REPORT_ID) });
        return route.fulfill({ json: { ok: true, review: { title: "Report", round: 2, status: page.url().endsWith("?closed") ? "closed" : exported ? "exported" : "open" }, viewer: { name: "Staff" }, comments, comparison: null } });
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
      if (url.pathname === "/api/workspace/page-review/" + REPORT_ID && route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        assert.equal(input.action, "addComment");
        assert.equal(input.expectedRound, 2);
        assert.equal(typeof input.anchorPath, "string");
        selections.push(input);
        comments.push({ ...input, id: "element-" + selections.length, parentId: null, round: 2, authorName: "Staff",
          authorKind: "user", status: "open", isMine: true, createdAt: "2026-11-19T12:00:00Z", editedAt: null, editedByName: null });
        return route.fulfill({ json: { ok: true, review: { comments } } });
      }
      if (/\.(png|jpg|webp|svg)$/.test(url.pathname)) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#a9c1c4"/></svg>' });
      return route.fulfill({ status: 404 });
    });
    await page.goto(origin + "/?workspace");
    await expect(page.locator("#report-frame-summary-0 article")).toBeVisible();
    await expect(page.getByText("Existing feedback stays visible", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Round 2 review", exact: true })).toHaveAttribute("href", "/review/symposium-2026/report");
    await expect(page.locator('[contenteditable="plaintext-only"]')).toHaveCount(0);
    await expect(page.locator("#bhn-review-overlay")).toHaveCount(0);
    for (const name of ["Add comment", "Reply", "Resolve", "Edit comment", "Delete comment", "Add page", "Swap photo"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await page.locator("#report-frame-summary-0 article img").click();
    await page.locator("#report-frame-summary-0 figcaption").click();
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add page", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Apply photo", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Review comment", exact: true })).toHaveCount(0);
    assert.equal(saves.length, 0, "workspace clicks never autosave");
    assert.equal(selections.length, 0, "workspace clicks never submit comments");
    await page.goto(origin);
    await expect(page.locator("#bhn-review-overlay")).toBeVisible();
    const build = page.getByText("abc1234", { exact: true });
    await expect(build).toBeVisible();
    const buildBox = (await build.boundingBox())!;
    assert.ok(buildBox.x < 40 && buildBox.y + buildBox.height > 1000 - 40, "the build SHA sits in the bottom-left corner");
    await expect(page.getByRole("toolbar", { name: "Report review toolbar" })).toBeVisible();
    const toolsPosition = await page.locator('[data-report-tools-host]').evaluate(host => {
      const rail = host.closest('aside')!.getBoundingClientRect();
      const stage = document.querySelector('[data-report-paper]')!.getBoundingClientRect();
      return { railLeft: rail.left, railRight: rail.right, stageRight: stage.right, toolsTop: host.getBoundingClientRect().top };
    });
    assert.ok(toolsPosition.railLeft >= toolsPosition.stageRight, "review tools occupy the right column without covering the report");
    assert.ok(toolsPosition.railRight > 1440 - 40, "review tools sit against the right side of the window");
    assert.ok(toolsPosition.toolsTop < 400, "review toolbar starts at the top of the controls column");
    const copyPosition = (await page.getByRole("button", { name: "Copy review comments", exact: true }).boundingBox())!;
    assert.ok(copyPosition.x < 40, "only the copy-comments button is on the left side");
    await expect(page.getByRole("toolbar", { name: "Report review toolbar" }).getByRole("button", { name: "Copy review comments", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "VentureLift Spotlight", exact: true }).click();
    const toolsAfterJump = await page.locator('[data-report-tools-host]').evaluate(host => ({top: host.getBoundingClientRect().top, railTop: host.closest('aside')!.getBoundingClientRect().top}));
    assert.ok(toolsAfterJump.top >= toolsAfterJump.railTop && toolsAfterJump.top < 50, "toolbar stays at the top after jumping to another report page");
    await expect(page.getByRole("button", { name: "Comment on an element", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Edit text and photos", exact: true }).click();
    await expect(page.locator('[id^="report-frame-venturelift-"]')).toHaveCount(1);
    await expect(page.locator('#report-frame-venturelift-0 img')).toHaveCount(7);
    assert.equal(await page.locator('#report-frame-venturelift-0 article').evaluate(e => {
      const frame = e.getBoundingClientRect();
      return Array.from(e.querySelectorAll('figure')).every(f => f.getBoundingClientRect().bottom <= frame.bottom);
    }), true);
    const openingPhotos = page.locator('#report-frame-annual-symposium-0 [class*="leadPhotos"] figure img');
    await expect(openingPhotos).toHaveCount(2);
    const rectangles = await openingPhotos.evaluateAll(images => images.map(image => {
      const rect = image.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    assert.ok(Math.abs(rectangles[0].y - rectangles[1].y) < 1, "opening photos sit together in one row");
    for (const rect of rectangles) {
      assert.ok(rect.height >= 220, "Molly and Christopher have proper image height");
      assert.ok(Math.abs(rect.width / rect.height - 1.5) < .01, "opening photographs use 3:2 frames");
    }
    const listFrames=page.locator('[id^="report-frame-cross-page-list-"]');
    assert.ok(await listFrames.count()>=3,"long list item crosses at least three linked pages");
    await expect(listFrames.locator('li')).toHaveCount(1);
    const listContinuations=listFrames.locator('[data-list-continuation=true]');
    assert.ok(await listContinuations.count()>=2);
    assert.equal(await listFrames.locator('[data-report-field="page:cross-page-list:text"]').allTextContents().then(parts=>parts.join('')),longBullet.trimEnd());
    // Clicking a photo opens the photo editor (not a comment) on an editable page.
    const photoEditor = page.locator("form", { has: page.getByRole("heading", { name: "Swap or crop photo" }) });
    await openingPhotos.last().click();
    await expect(photoEditor).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toHaveCount(0);
    await photoEditor.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comment on page" })).toHaveCount(0);

    // Autosave: no button; a colleague's newer copy is merged in, then saved.
    const savedStatus = page.getByRole("status").filter({ hasText: "All changes saved" });
    await expect(savedStatus).toBeVisible();
    await page.getByRole("textbox", { name: "Cover title", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Cover title", exact: true }).fill("Revised Symposium");
    await expect(page.getByRole("status").filter({ hasText: "Editing" })).toBeVisible();
    await page.getByRole("textbox", { name: "Cover title", exact: true }).press("Enter");
    await expect.poll(() => saves.length).toBe(2);
    await expect(savedStatus).toBeVisible();
    assert.equal(saves[0].round, 2);
    assert.equal(saves[0].revision, "a".repeat(64));
    assert.equal(saves[1].revision, "c".repeat(64), "the retry builds on the colleague's copy");
    assert.equal(saves[1].report.cover.title, "Revised Symposium");
    assert.equal((saves[1].report as unknown as { back: { title: string } }).back.title, "BioHubNet Network", "their edit is kept");
    await expect(page.locator("#report-frame-back-0 h2")).toHaveText("BioHubNet Network");
    await expect(page.getByRole("textbox", { name: "Cover title", exact: true })).toHaveText("Revised Symposium");
    const story = page.locator("#report-frame-summary-0").getByRole("textbox", { name: "Story text", exact: true });
    await story.fill("Revised report passage");
    await story.blur();
    await expect.poll(() => saves.length).toBe(3);
    assert.equal(saves[2].revision, "b".repeat(64));
    assert.equal(saves[2].report.pages[0].text, "Revised report passage");
    await expect(page.locator("#report-frame-cover-0").getByRole("button", { name: "Swap photo", exact: true })).toBeVisible();
    const directPhoto = page.locator("#report-frame-summary-0 figure img");
    const directCaption = page.locator("#report-frame-summary-0 figcaption");
    await page.getByRole("button", { name: "Collapse comments", exact: true }).click();

    // Photo operations: zoom, rotate, flip, caption, then autosave.
    await directPhoto.click();
    await expect(photoEditor).toBeVisible();
    await photoEditor.getByLabel("Zoom").fill("150");
    await photoEditor.getByRole("button", { name: "Rotate right" }).click();
    await photoEditor.getByRole("button", { name: "Flip" }).click();
    await expect(photoEditor.getByRole("button", { name: "Flip" })).toHaveAttribute("aria-pressed", "true");
    await photoEditor.getByLabel("Caption").fill("Opening reception");
    if (process.env.SHOT) await photoEditor.screenshot({ path: `${process.env.SHOT}/photo-editor.png` });
    await photoEditor.getByRole("button", { name: "Apply photo" }).click();
    await expect.poll(() => saves.length).toBe(4);
    assert.deepEqual((saves[3].report.pages[0] as unknown as { photos: unknown }).photos, { "0": { file: "cover.jpg", caption: "Opening reception", x: 50, y: 50, fit: "cover", zoom: 150, rotate: 90, flip: true } });
    await expect(directCaption).toHaveText("Opening reception");
    const turned = await directPhoto.evaluate((img) => {
      const mat = img.parentElement!.getBoundingClientRect(), box = img.getBoundingClientRect(), style = getComputedStyle(img);
      return { rotate: style.rotate, scale: style.scale, covers: box.left <= mat.left + 1 && box.right >= mat.right - 1 && box.top <= mat.top + 1 && box.bottom >= mat.bottom - 1 };
    });
    assert.equal(turned.rotate, "90deg");
    assert.equal(turned.scale, "-1.5 1.5");
    assert.ok(turned.covers, "a turned photo still fills its frame");
    if (process.env.SHOT) await page.locator("#report-frame-summary-0").screenshot({ path: `${process.env.SHOT}/photo-turned.png` });
    await directPhoto.click();
    await photoEditor.getByRole("button", { name: "Reset" }).click();
    await photoEditor.getByRole("button", { name: "Apply photo" }).click();
    await expect.poll(() => saves.length).toBe(5);
    assert.deepEqual((saves[4].report.pages[0] as unknown as { photos: unknown }).photos, { "0": { file: "cover.jpg", caption: "Opening reception", x: 50, y: 50, fit: "cover" } });

    // Captions still open a comment.
    await directCaption.click();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "New review comment", exact: true }).fill("Keep my photo feedback.");
    await directCaption.click();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toHaveValue("Keep my photo feedback.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const pick = () => page.getByRole("button", { name: "Comment on an element", exact: true });
    await pick().click();
    await expect(page.getByRole("button", { name: "Comment on an element", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Comment on an element", exact: true }).press("Escape");
    await expect(page.locator("#bhn-review-overlay")).toHaveAttribute("data-picking-element", "false");
    await pick().click();
    await page.getByRole("textbox", { name: "Cover title", exact: true }).click();
    await page.getByRole("textbox", { name: "New review comment", exact: true }).fill("Keep this draft while changing its target.");
    await page.locator("#report-frame-summary-0 figcaption").click();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toHaveValue("Keep this draft while changing its target.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const targets = [
      { label: "cover header", target: page.locator("#report-frame-cover-0 h1") },
      { label: "section header", target: page.locator("#report-frame-summary-0 header > span") },
      { label: "footer", target: page.locator("#report-frame-summary-0 footer span").first() },
      { label: "page number", target: page.locator("#report-frame-summary-0 footer span").last() },
      { label: "picture", target: page.locator("#report-frame-summary-0 figure img") },
      { label: "picture caption", target: page.locator("#report-frame-summary-0 figcaption") },
      { label: "cover picture", target: page.locator('#report-frame-cover-0 img[src$="/cover.jpg"]') },
    ];
    for (const { label, target } of targets) {
      console.log("Checking element comment:", label);
      if (label !== "picture caption") await pick().click();
      await target.click();
      await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toBeVisible();
      await expect(page.locator("#bhn-review-overlay")).toHaveAttribute("data-picking-element", "true");
      await page.getByRole("textbox", { name: "New review comment", exact: true }).fill("Review the " + label);
      const selectionNumber = selections.length + 1;
      await page.getByRole("button", { name: "Add comment", exact: true }).click();
      await expect(page.locator('[data-thread-id="element-' + selectionNumber + '"]')).toContainText("Review the " + label);
      const selected = selections.at(-1)!;
      assert.doesNotMatch(selected.anchorPath, /report_/);
      assert.equal(await target.evaluate((el, path) => document.querySelector(path) === el, selected.anchorPath), true, label + " keeps its exact element anchor");
      await page.getByRole("button", { name: "Show comment " + selections.length + " on page", exact: true }).click();
      await expect(page.locator(".bhn-review-highlight-flash")).toBeVisible();
      await expect.poll(async () => target.evaluate(el => {
        const box = document.querySelector(".bhn-review-highlight")!.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return Math.abs(box.left - rect.left) + Math.abs(box.top - rect.top);
      })).toBeLessThan(2);
    }
    assert.equal(selections[4].anchorQuote, "Opening reception");
    assert.equal(selections[5].anchorQuote, "Opening reception");
    assert.equal(selections[6].anchorQuote, null);
    const lastThread = page.locator('[data-thread-id="element-7"]');
    await lastThread.getByRole("button", { name: "Reply", exact: true }).click();
    await lastThread.getByRole("textbox", { name: "Reply to Staff", exact: true }).fill("Unsent reply");
    await expect(pick()).toBeDisabled();
    await directPhoto.click();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toHaveCount(0);
    await expect(lastThread.getByRole("textbox", { name: "Reply to Staff", exact: true })).toHaveValue("Unsent reply");
    await photoEditor.getByRole("button", { name: "Cancel", exact: true }).click();
    await lastThread.getByRole("button", { name: "Cancel", exact: true }).click();
    await lastThread.getByRole("button", { name: "Edit comment by Staff", exact: true }).click();
    await lastThread.getByRole("textbox", { name: "Edit comment by Staff", exact: true }).fill("Unsent correction");
    await expect(pick()).toBeDisabled();
    await directCaption.click();
    await expect(lastThread.getByRole("textbox", { name: "Edit comment by Staff", exact: true })).toHaveValue("Unsent correction");
    await lastThread.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(pick()).toBeEnabled();
    await page.getByRole("button", { name: "Edit text and photos", exact: true }).click();
    await page.getByRole("textbox", { name: "Cover title", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Cover title", exact: true })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toHaveCount(0);
    const networking = page.locator('[id^="report-frame-structured-networking-"] [role="textbox"]');
    const originalNetworking = await networking.allTextContents();
    assert.ok(originalNetworking.length > 20, "exercise quotes, profiles and full-width headings across linked pages");
    for (let i = 0; i < originalNetworking.length; i++) {
      const field = networking.nth(i);
      await field.click();
      const geometry = await field.evaluate(el => {
        const article = el.closest("article")!;
        const paper = article.getBoundingClientRect();
        const story = el.closest('[class*="story"]');
        return {
          storyHeight: story?.getBoundingClientRect().height ?? 0,
          pageHeight: paper.height,
          inPage: Array.from(el.getClientRects()).every(rect => rect.top >= paper.top && rect.bottom <= paper.bottom),
        };
      });
      assert.ok(geometry.storyHeight <= geometry.pageHeight, `networking field ${i} must not expand the column area`);
      assert.ok(geometry.inPage, `networking field ${i} must remain visible on its page`);
    }
    assert.deepEqual(await networking.allTextContents(), originalNetworking, "focus must preserve all networking copy");
    const firstQuote = networking.filter({ hasText: /^“Conversation 1 / });
    await firstQuote.locator("..").click({ position: { x: 2, y: 2 } });
    await expect(firstQuote).toBeFocused();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveCount(0);
    await expect(page.locator('[data-report-paper] [class*="rosterHeading"]')).toHaveText("Participating industry professionals");
    await expect(page.locator('[data-report-paper] [class*="rosterNames"]')).toHaveCount(1);
    const mentor = networking.filter({ hasText: /^Mentor 1 · Professional role 1/ });
    const revisedMentor = (await mentor.innerText()) + " Revised profile.";
    const before = saves.length;
    await mentor.fill(revisedMentor);
    await mentor.blur();
    await expect.poll(() => saves.length).toBe(before + 1);
    assert.ok(saves.at(-1)!.report.pages[1].text.includes(revisedMentor));
    assert.ok(saves.at(-1)!.report.pages[1].text.includes("Mentor 17 · Professional role 17"));
    assert.ok(saves.at(-1)!.report.pages[1].text.includes("Conversation 6 connected research experience"));

    // Remove photo: an extra photo goes; the main photo stays gone (no recommended fallback) until re-added.
    const symposium = page.locator("#report-frame-annual-symposium-0");
    const photosOf = () => (saves.at(-1)!.report.pages[2] as unknown as { photos: Record<string, { hidden?: boolean }> }).photos;
    await symposium.getByRole("img", { name: "Molly Shoichet delivers the opening remarks" }).click();
    await photoEditor.getByRole("button", { name: "Remove photo" }).click();
    await expect(photoEditor).toHaveCount(0);
    await expect.poll(() => Object.keys(photosOf())).toEqual(["0"]);
    await expect(symposium.locator("figure img")).toHaveCount(1);
    await symposium.getByRole("img", { name: "Christopher Procyshyn keynote" }).click();
    await photoEditor.getByRole("button", { name: "Remove photo" }).click();
    await expect.poll(() => photosOf()["0"]?.hidden).toBe(true);
    await expect(symposium.locator("figure")).toHaveCount(0);
    await symposium.getByRole("button", { name: "Add photo" }).click();
    await photoEditor.getByRole("button", { name: "Apply photo" }).click();
    await expect.poll(() => photosOf()["0"]?.hidden).toBeUndefined();
    await expect(symposium.locator("figure img")).toHaveCount(1);
    await page.locator("#report-frame-cover-0 [data-photo-slot]").click();
    await expect(photoEditor.getByRole("button", { name: "Remove photo" })).toHaveCount(0);
    await photoEditor.getByRole("button", { name: "Cancel" }).click();

    await page.locator('[class*="rosterNames"] [role="textbox"]').fill("");
    await page.locator('[class*="rosterNames"] [role="textbox"]').blur();
    await page.locator('[class*="rosterHeading"] [role="textbox"]').fill("");
    await page.locator('[class*="rosterHeading"] [role="textbox"]').blur();
    await expect(page.locator('[class*="rosterHeading"],[class*="rosterNames"]')).toHaveCount(0);
    await expect(networking.filter({ hasText: /^Mentor 17 · Professional role 17/ })).toBeVisible();
    await expect(page.locator("[data-report-unsaved]")).toHaveAttribute("data-report-unsaved", "false");
    // Per-page feedback, persistent insertion anchors, tracked bubbles and safe live sync.
    const summarySheet = page.locator("#report-frame-summary-0");
    await summarySheet.getByRole("button", { name: /^Text changes ·/ }).click();
    const changePopup=page.getByRole("dialog",{name:"Text changes for page 2"});
    await expect(changePopup.getByRole("region",{name:"Before",exact:true})).toContainText("Original report passage");
    await expect(changePopup.getByRole("region",{name:"After",exact:true})).toContainText("Revised report passage");
    assert.ok((await changePopup.boundingBox())!.width>=900,"before/after popup uses a readable width");
    await expect(page.getByLabel("Changed paragraph highlight")).toBeVisible();
    await expect(page.locator('svg[aria-label="Changed paragraph highlight"] path')).toHaveCount(1);
    await changePopup.getByRole("checkbox",{name:"Track changes on report"}).check();
    await expect(changePopup.locator('ins')).not.toHaveCount(0);
    await changePopup.getByRole("checkbox",{name:"Track changes on report"}).uncheck();
    await changePopup.getByRole("button",{name:"Close text changes"}).click();
    await expect(changePopup).toHaveCount(0);
    const pageBox = summarySheet.getByRole("textbox", { name: /^Page feedback:/ });
    await pageBox.fill("Add a follow-up resource on this page.");
    await page.getByRole("button", { name: "Copy review comments", exact: true }).click();
    await expect(page.locator("#bhn-review-overlay")).toContainText("page feedback");
    await summarySheet.getByRole("button", { name: "Add page comment", exact: true }).click();
    await expect(pageBox).toHaveValue("");
    assert.equal(selections.at(-1)!.anchorKey, "#report-frame-summary-0");
    assert.match(selections.at(-1)!.body, /follow-up resource/);
    for (const shape of ["Circle","Line"]) {
      await page.getByRole("button",{name:shape+" comment",exact:true}).click();
      await summarySheet.locator('article').scrollIntoViewIfNeeded();
      const rect=(await summarySheet.locator('article').boundingBox())!;
      await page.mouse.move(rect.x+60,rect.y+120);await page.mouse.down();await page.mouse.move(rect.x+180,rect.y+190);await page.mouse.up();
      await expect(page.locator('#bhn-review-overlay')).toContainText("Comment on drawn "+shape.toLowerCase());
      await expect(page.locator('#bhn-review-overlay')).toHaveAttribute('data-report-comments-dirty','true');
      await summarySheet.locator('h2').first().click();
      await expect(page.locator('#bhn-review-overlay')).toContainText("Comment on drawn "+shape.toLowerCase());
      await expect(page.locator('.bhn-report-drawing-draft')).toHaveCount(1);
      await page.getByRole('button',{name:'Copy review comments',exact:true}).click();assert.equal(exports,0);
      await page.getByRole('textbox',{name:'New review comment',exact:true}).fill(shape+" annotation feedback");
      await page.getByRole('button',{name:'Add comment',exact:true}).click();
      assert.match(selections.at(-1)!.anchorBlock as string,new RegExp("\\[draw:"+shape.toLowerCase()+":"));
      await expect(page.locator('.bhn-report-drawing-draft')).toHaveCount(0);
    }
    await expect(page.locator('.bhn-report-drawing')).toHaveCount(2);
    await page.setViewportSize({width:1280,height:900});
    await expect.poll(async()=>{const shape=await page.locator('.bhn-report-drawing').first().boundingBox();const paper=await summarySheet.locator('article').boundingBox();return !!shape && !!paper && Math.abs(shape.width-paper.width)<1;}).toBe(true);
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'Circle comment',exact:true}).click();await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Circle comment',exact:true})).toHaveAttribute('aria-pressed','false');
    await page.getByRole('button',{name:'Circle comment',exact:true}).click();await story.focus();await story.press('Enter');
    await expect(page.locator('#bhn-review-overlay')).toContainText('Comment on drawn circle');
    await page.keyboard.press('Escape');await expect(page.locator('.bhn-report-drawing-draft')).toHaveCount(0);
    await page.getByRole("button", { name: "Add a section", exact: true }).click();
    const gap = await story.boundingBox();
    await page.mouse.move(gap!.x + 20, gap!.y - 3);
    await expect(page.locator(".bhn-report-insertion-line")).toBeVisible();
    await page.mouse.click(gap!.x + 20, gap!.y - 3);
    await expect(page.locator("#bhn-review-overlay")).toContainText("Request a section insertion");
    await page.getByRole("textbox", { name: "New review comment", exact: true }).fill("Add a new section about next steps.");
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.locator(".bhn-report-insertion-bubble")).toContainText("next steps");
    assert.match(selections.at(-1)!.body, /^\[Section insertion request\]/);
    assert.match((selections.at(-1) as unknown as {anchorBlock:string}).anchorBlock, /Insert section before/);
    remoteSnapshot = structuredClone(saves.at(-1)!.report) as Report;
    (remoteSnapshot.back as {text:string}).text = "Colleague's live update";
    remoteRevision = "e".repeat(64);
    await expect(page.locator("#report-frame-back-0 p").last()).toHaveText("Colleague's live update", { timeout: 10000 });
    await pageBox.fill("Protect this unfinished page feedback.");
    (remoteSnapshot.back as {text:string}).text = "Update while page feedback is unfinished";
    remoteRevision = "d".repeat(64);
    await page.waitForTimeout(5200);
    await expect(pageBox).toHaveValue("Protect this unfinished page feedback.");
    await expect(page.locator("#report-frame-back-0 p").last()).toHaveText("Colleague's live update");
    await summarySheet.getByRole("button", { name: "Clear draft", exact: true }).click();
    await expect(page.locator("#report-frame-back-0 p").last()).toHaveText("Update while page feedback is unfinished", { timeout: 10000 });
    await page.getByRole("button", { name: "Edit text and photos", exact: true }).click();
    const coverTitle = page.getByRole("textbox", { name: "Cover title", exact: true });
    await coverTitle.fill("Keep my unfinished typing");
    (remoteSnapshot.back as {text:string}).text = "A newer colleague update";
    remoteRevision = "f".repeat(64);
    await page.waitForTimeout(5200);
    await expect(coverTitle).toHaveText("Keep my unfinished typing");
    await expect(page.locator("#report-frame-back-0 p").last()).toHaveText("Update while page feedback is unfinished");
    await coverTitle.press("Enter");
    await expect(page.locator("#report-frame-back-0 p").last()).toHaveText("A newer colleague update", { timeout: 10000 });
    await expect(page.locator("[data-report-unsaved]")).toHaveAttribute("data-report-unsaved", "false");
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/review-toolbar-and-notes.jpg` });
    remoteSnapshot = null;
    await page.locator("#report-frame-summary-0 figcaption").click();
    await page.getByRole("textbox", { name: "New review comment", exact: true }).fill("Unsent feedback");
    await page.getByRole("button", { name: "Copy review comments", exact: true }).click();
    await expect(page.locator("#bhn-review-overlay")).toContainText("Finish or cancel your comment");
    assert.equal(exports, 0);
    await page.locator("#bhn-review-overlay").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("textbox", { name: "Cover theme", exact: true }).fill("A final local edit");
    await page.getByRole("button", { name: "Copy review comments", exact: true }).click();
    await expect(page.locator("#bhn-review-overlay")).toContainText("Wait for autosave");
    assert.equal(exports, 0);
    await expect(page.locator("[data-report-unsaved]")).toHaveAttribute("data-report-unsaved", "false");
    await page.getByRole("button", { name: "Copy review comments", exact: true }).click();
    await page.getByRole("button", { name: "Copy review comments", exact: true }).click();
    assert.equal(exports, 0, "repeated clicks on the primary copy button never bypass the secondary confirmation");
    await page.getByRole("button", { name: "Copy comments and lock round", exact: true }).click();
    await expect(page.getByRole("button", { name: "Comments copied", exact: true })).toBeVisible();
    await expect(page.locator('[contenteditable="plaintext-only"]')).toHaveCount(0);
    await expect(page.locator("#bhn-review-overlay")).toContainText("is locked while revisions are underway");
    await expect(page.locator("#bhn-review-overlay")).not.toContainText("Click text to edit.");
    await expect(page.getByRole("status", { name: "Round 2 locked", exact: true })).toContainText("Wait until the revisions for Round 2 are complete.");
    await expect(page.getByRole("status", { name: "Round 2 locked", exact: true })).toContainText("Then an administrator can start Round 3");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "/private/tmp/report-locked-round-notice.jpg" });
    assert.equal(exports, 1);
    await page.getByLabel("Report round version").selectOption("1");
    await expect(page.locator('[contenteditable="plaintext-only"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comment on page", exact: true })).toHaveCount(0);
    await expect(page.locator("#bhn-review-overlay")).toContainText("Reload to comment on the current version.");
    await page.locator("#report-frame-summary-0").getByText("Archived passage", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveCount(0);
    await page.goto(origin + "/?closed");
    await expect(page.getByRole("button",{name:"Circle comment",exact:true})).toHaveCount(0);
    await expect(page.locator(".bhn-report-drawing")).toHaveCount(2);
    await expect(page.locator("#bhn-review-overlay")).toBeVisible();
    await expect(page.locator('[contenteditable="plaintext-only"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comment on page", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comment on an element", exact: true })).toHaveCount(0);
    await directPhoto.click();
    await expect(page.getByRole("textbox", { name: "New review comment", exact: true })).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log("PASS: full-page text editing, autosave with merge of a colleague's newer copy, photo click opens zoom/rotate/flip/caption/reset editor, explicit comments, photo controls, precise element comments and Show me, draft retention, networking text focus and geometry, archived and approved-round locks; mocked writes only");
  } finally { await browser.close(); }
}

void main();
