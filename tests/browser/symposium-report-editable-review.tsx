import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
import { REPORT_API, REPORT_ID } from "../../src/lib/symposium-report/document";

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

const ventureFixture = { id: "venturelift", label: "Annual Symposium", title: "VentureLift Spotlight", frames: 1,
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
            pages:[{id:"summary",label:"Overview",title:"Summary",text:"Original report passage",frames:1,fillPhotos:false,photos:{"0":{file:"cover.jpg",caption:"An event photograph",x:50,y:50,fit:"cover"}}},{id:"structured-networking",label:"Career conversations",title:"Structured Networking",text:${JSON.stringify(networkingText)},frames:1,fillPhotos:false},{id:"annual-symposium",label:"Opening program",title:"Annual Symposium",text:"The opening program connected research, industry and careers.",frames:1,photos:{"0":{file:"keynote.jpg",caption:"Christopher Procyshyn keynote",x:50,y:40,fit:"cover"},"photo-0-1":{file:"welcome-1.webp",caption:"Molly Shoichet delivers the opening remarks",x:50,y:33,fit:"cover"}}},${JSON.stringify(ventureFixture)}],
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
    const comments: unknown[] = [];
    const selections: { anchorPath: string; anchorQuote: string | null; anchorKey: string; body: string }[] = [];
    const saves: { round: number; revision: string; report: { cover: { title: string }; pages: { text: string }[] } }[] = [];
    await page.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
      if (url.pathname === "/app.js" || url.pathname === "/app.css") return route.fulfill({
        contentType: url.pathname.endsWith("css") ? "text/css" : "application/javascript",
        body: bundle.outputFiles.find(file => file.path.endsWith(url.pathname))!.text,
      });
      if (url.pathname === REPORT_API + "/review") {
        if (route.request().method() === "POST") {
          assert.deepEqual(route.request().postDataJSON(), { action: "export", expectedRound: 2 });
          exported = true; exports++;
          return route.fulfill({ json: { ok: true, brief: "Checked Round 2 comments", review: { title: "Report", round: 2, status: "exported" } } });
        }
        if (url.searchParams.has("overlay")) return route.fulfill({ contentType: "application/javascript", body: overlaySource(REPORT_API + "/review", "Report", true, "/api/workspace/page-review/" + REPORT_ID) });
        return route.fulfill({ json: { ok: true, review: { title: "Report", round: 2, status: page.url().endsWith("?closed") ? "closed" : exported ? "exported" : "open" }, viewer: { name: "Staff" }, comments, comparison: null } });
      }
      if (url.pathname === REPORT_API && route.request().method() === "POST") {
        saves.push(route.request().postDataJSON());
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
    await expect(page.locator("#bhn-review-overlay")).toContainText("Choose Comment on an element");
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
    await expect(page.getByRole("button", { name: "Cancel element selection", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Cancel element selection", exact: true }).press("Escape");
    await expect(page.locator("#bhn-review-overlay")).toHaveAttribute("data-picking-element", "false");
    await pick().click();
    await page.getByRole("textbox", { name: "Cover title", exact: true }).click();
    await page.getByRole("textbox", { name: "New review comment", exact: true }).fill("Keep this draft while changing its target.");
    await pick().click();
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
      await expect(page.locator("#bhn-review-overlay")).toHaveAttribute("data-picking-element", "false");
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
    await page.locator('[class*="rosterNames"] [role="textbox"]').fill("");
    await page.locator('[class*="rosterNames"] [role="textbox"]').blur();
    await page.locator('[class*="rosterHeading"] [role="textbox"]').fill("");
    await page.locator('[class*="rosterHeading"] [role="textbox"]').blur();
    await expect(page.locator('[class*="rosterHeading"],[class*="rosterNames"]')).toHaveCount(0);
    await expect(networking.filter({ hasText: /^Mentor 17 · Professional role 17/ })).toBeVisible();
    await expect(page.locator("[data-report-unsaved]")).toHaveAttribute("data-report-unsaved", "false");
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
    await expect(page.getByRole("button", { name: "Comments copied", exact: true })).toBeVisible();
    await expect(page.locator('[contenteditable="plaintext-only"]')).toHaveCount(0);
    await expect(page.locator("#bhn-review-overlay")).toContainText("was exported and is locked");
    assert.equal(exports, 1);
    await page.getByLabel("Report round version").selectOption("1");
    await expect(page.locator('[contenteditable="plaintext-only"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comment on page", exact: true })).toHaveCount(0);
    await expect(page.locator("#bhn-review-overlay")).toContainText("Reload to comment on the current version.");
    await page.locator("#report-frame-summary-0").getByText("Archived passage", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveCount(0);
    await page.goto(origin + "/?closed");
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
