import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
import { REPORT_API, REPORT_ID } from "../../src/lib/symposium-report/document";

const origin = "https://editable-report.test";

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from "react"; import {createRoot} from "react-dom/client";
        import {ReportEditor} from "./src/components/workspace/symposium-report/ReportEditor";
        const closed = location.search === "?closed";
        createRoot(document.getElementById("root")).render(<ReportEditor fullPageReview
          report={{cover:{title:"Annual Symposium",theme:"Future workforce",date:"October 29"},
            pages:[{id:"summary",label:"Overview",title:"Summary",text:"Original report passage",frames:1,fillPhotos:false}],
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
    const story = page.getByRole("textbox", { name: "Story text", exact: true });
    await story.fill("Revised report passage");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved for all reviewers.");
    assert.equal(saves[2].revision, "b".repeat(64));
    assert.equal(saves[2].report.pages[0].text, "Revised report passage");
    await page.locator("#report-frame-summary-0").getByRole("button", { name: "Comment on page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Swap photo", exact: true })).toBeVisible();
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
    console.log("PASS: full-page text editing, conflict retention, revision-aware save, explicit comments, photo controls, archived and approved-round locks; mocked writes only");
  } finally { await browser.close(); }
}

void main();
