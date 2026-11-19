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

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from "react"; import {createRoot} from "react-dom/client";
        import {ReportEditor} from "./src/components/workspace/symposium-report/ReportEditor";
        const closed = location.search === "?closed";
        createRoot(document.getElementById("root")).render(<ReportEditor fullPageReview
          report={{cover:{title:"Annual Symposium",theme:"Future workforce",date:"October 29"},
            pages:[{id:"summary",label:"Overview",title:"Summary",text:"Original report passage",frames:1,fillPhotos:false},{id:"structured-networking",label:"Career conversations",title:"Structured Networking",text:${JSON.stringify(networkingText)},frames:1,fillPhotos:false}],
            back:{title:"BioHubNet",text:"Connect"}}}
          revision={"a".repeat(64)} history={[{round:1,report:{cover:{title:"Archived title",theme:"Future workforce",date:"October 29"},pages:[{id:"summary",label:"Overview",title:"Summary",text:"Archived passage",frames:1,fillPhotos:false}],back:{title:"BioHubNet",text:"Connect"}}}]} recommendations={{}} meId="staff" isAdmin={false}
          review={{id:"${REPORT_ID}",url:"/review/symposium-2026/report",title:"Report",status:closed?"closed":"open",round:2,comments:[]}}/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const saves: { round: number; revision: string; report: { cover: { title: string }; pages: { text: string }[] } }[] = [];
    await page.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
      if (url.pathname === "/app.js" || url.pathname === "/app.css") return route.fulfill({
        contentType: url.pathname.endsWith("css") ? "text/css" : "application/javascript",
        body: bundle.outputFiles.find(file => file.path.endsWith(url.pathname))!.text,
      });
      if (url.pathname === REPORT_API + "/review") {
        if (url.searchParams.has("overlay")) return route.fulfill({ contentType: "application/javascript", body: overlaySource(REPORT_API + "/review", "Report", true, "/api/workspace/page-review/" + REPORT_ID) });
        return route.fulfill({ json: { ok: true, review: { title: "Report", round: 2, status: page.url().endsWith("?closed") ? "closed" : "open" }, viewer: { name: "Staff" }, comments: [], comparison: null } });
      }
      if (url.pathname === REPORT_API && route.request().method() === "POST") {
        saves.push(route.request().postDataJSON());
        return route.fulfill(saves.length === 1
          ? { status: 409, json: { error: "Someone saved a newer version. Your local edits are still here." } }
          : { json: { revision: "b".repeat(64) } });
      }
      return route.fulfill({ status: 404 });
    });
    await page.goto(origin);
    await expect(page.locator("#bhn-review-overlay")).toBeVisible();
    await page.getByRole("textbox", { name: "Cover title", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Cover title", exact: true }).fill("Revised Symposium");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Your local edits are still here");
    await expect(page.getByRole("textbox", { name: "Cover title", exact: true })).toHaveText("Revised Symposium");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved for all reviewers.");
    assert.equal(saves[1].round, 2);
    assert.equal(saves[1].revision, "a".repeat(64));
    assert.equal(saves[1].report.cover.title, "Revised Symposium");
    const story = page.locator("#report-frame-summary-0").getByRole("textbox", { name: "Story text", exact: true });
    await story.fill("Revised report passage");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved for all reviewers.");
    assert.equal(saves[2].revision, "b".repeat(64));
    assert.equal(saves[2].report.pages[0].text, "Revised report passage");
    await page.locator("#report-frame-summary-0").getByRole("button", { name: "Comment on page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Swap photo", exact: true })).toBeVisible();
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
    const mentor = networking.filter({ hasText: /^Mentor 1 · Professional role 1/ });
    const revisedMentor = (await mentor.innerText()) + " Revised profile.";
    await mentor.fill(revisedMentor);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved for all reviewers.");
    assert.ok(saves.at(-1)!.report.pages[1].text.includes(revisedMentor));
    assert.ok(saves.at(-1)!.report.pages[1].text.includes("Mentor 17 · Professional role 17"));
    assert.ok(saves.at(-1)!.report.pages[1].text.includes("Conversation 6 connected research experience"));
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
    assert.deepEqual(errors, []);
    console.log("PASS: full-page text editing, conflict retention, revision-aware save, explicit comments, photo controls, networking text focus and geometry, archived and approved-round locks; mocked writes only");
  } finally { await browser.close(); }
}

void main();
