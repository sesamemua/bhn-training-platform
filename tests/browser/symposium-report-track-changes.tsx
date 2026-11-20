import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { REPORT_API, REPORT_ID } from "../../src/lib/symposium-report/document";

/**
 * Track changes and live presence on the Event Report editor, with every
 * request mocked: no report data, presence or audit rows are written.
 */
const origin = "https://report-track-changes.test";
const longText = Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1} describes the mentors, trainees and sponsors who joined the conversation on the day.`).join("\n\n");

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from "react"; import {createRoot} from "react-dom/client";
        import {ReportEditor} from "./src/components/workspace/symposium-report/ReportEditor";
        createRoot(document.getElementById("root")).render(<ReportEditor
          report={{cover:{title:"Annual Symposium",theme:"Future workforce",date:"October 29"},
            pages:[{id:"summary",label:"Overview",title:"Summary",text:"Revised report passage for reviewers.",frames:1,fillPhotos:false},
              {id:"long",label:"Stories",title:"Long Story",text:${JSON.stringify(longText)},frames:1,fillPhotos:false}],
            back:{title:"BioHubNet",text:"Connect"}}}
          revision={"a".repeat(64)} history={[]} recommendations={{}} meId="staff" isAdmin={false}
          review={{id:"${REPORT_ID}",url:"/review/symposium-2026/report",title:"Report",status:"open",round:1,comments:[]}}/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    outfile: "/private/tmp/symposium-track-changes/app.js", bundle: true, write: false, format: "iife", jsx: "automatic", external: ["/api/*"],
    plugins: [{ name: "server-mocks", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
      builder.onResolve({ filter: /review-invites$/ }, () => ({ path: "invites", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "router"
        ? "export const useRouter=()=>({refresh(){}});"
        : "export async function newsletterReviewTeam() {} export async function reportReviewHistory() { return { sent: [] }; } export async function reportReviewRecipients() { return { recipients: [] }; } export async function sendReportReviewInvites() {}" }));
    } }],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const beats: { frame: string | null; field: string | null; fieldIndex: number | null }[] = [];
    const saves: { report: { cover: { title: string }; pages: { text: string }[] } }[] = [];
    let changesRequests = 0;
    await page.route(origin + "/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
      if (url.pathname === "/app.js" || url.pathname === "/app.css") return route.fulfill({
        contentType: url.pathname.endsWith("css") ? "text/css" : "application/javascript",
        body: bundle.outputFiles.find((file) => file.path.endsWith(url.pathname))!.text,
      });
      if (url.pathname === REPORT_API + "/presence" && method === "POST") {
        beats.push(route.request().postDataJSON());
        return route.fulfill({ json: { peers: [
          { userId: "akshita", name: "Akshita Vincent", color: "#8b5cf6", frame: "cover-0", field: null, fieldIndex: null },
          { userId: "yoojin", name: "Yoo Jin Park", color: "#10b981", frame: "summary-0", field: "Story text", fieldIndex: 2 },
        ] } });
      }
      if (url.pathname === REPORT_API && method === "GET") {
        changesRequests++;
        return route.fulfill({ json: {
          round: 1, since: "tracking",
          baseline: { "page:summary:text": "Original report passage for reviewers.", "cover.title": "Annual Meeting" },
          edits: [{ id: "e1", at: "2026-11-20T15:00:00Z", author: "Yoo Jin Park", fields: [
            { key: "page:summary:text", label: "Summary · text", marks: [{ kind: "del", text: "Original" }, { kind: "ins", text: "Revised" }, { kind: "same", text: " report passage for reviewers." }] },
          ] }],
        } });
      }
      if (url.pathname === REPORT_API && method === "POST") {
        saves.push(route.request().postDataJSON());
        return route.fulfill({ json: { revision: "b".repeat(64) } });
      }
      if (/\.(png|jpg|webp|svg)$/.test(url.pathname)) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#a9c1c4"/></svg>' });
      return route.fulfill({ status: 404 });
    });
    await page.goto(origin);

    // ── Presence: who else is here, and where ──
    const presence = page.getByRole("group", { name: "Who else has the report open" });
    await expect(presence).toContainText("Yoo Jin Park editing story text · Summary, p. 2");
    await expect(presence).toContainText("Akshita Vincent viewing · Cover, p. 1");
    const summary = page.locator("#report-frame-summary-0");
    const yooJinBox = summary.locator('[contenteditable]:not([contenteditable="false"])').nth(2);
    await expect(yooJinBox).toHaveAttribute("data-peer-edit", "Yoo Jin Park is editing");
    await expect(page.locator("#report-frame-cover-0 article")).toHaveAttribute("data-peer-view", "Akshita Vincent viewing");
    assert.equal(await yooJinBox.innerText(), "Revised report passage for reviewers.", "the name tag never becomes part of the text");
    if (process.env.SHOT) { await summary.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT}/presence.png` }); }
    await page.getByRole("textbox", { name: "Cover title", exact: true }).click();
    await expect.poll(() => beats.at(-1)).toEqual({ frame: "cover-0", field: "Cover title", fieldIndex: 0 });
    await page.getByRole("textbox", { name: "Cover title", exact: true }).press("Escape");
    await presence.getByRole("button", { name: /Yoo Jin Park/ }).click();
    await expect.poll(() => beats.at(-1)?.frame).toBe("summary-0");

    // ── Track changes: show, list, hide ──
    const toggle = page.getByRole("switch", { name: "Show changes" });
    await toggle.check();
    await expect(page.getByText("Showing changes since change tracking began")).toBeVisible();
    await expect(summary.locator("del")).toHaveText("Original");
    await expect(summary.locator("ins")).toHaveText("Revised");
    await expect(page.locator("#report-frame-cover-0 h1 del")).toHaveText("Meeting");
    await expect(page.locator("#report-frame-cover-0 h1 ins")).toHaveText("Symposium");
    await expect(page.locator('[data-report-paper] [contenteditable]')).toHaveCount(0);
    await expect(page.locator("#report-frame-long-0 ins, #report-frame-long-0 del")).toHaveCount(0);
    const changes = page.getByRole("region", { name: "Changes this round" });
    await expect(changes).toContainText("Yoo Jin Park");
    await expect(changes.locator("del")).toHaveText("Original");
    await changes.getByRole("button", { name: "Summary · text" }).click();
    const sheets = await page.locator('[id^="report-frame-"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })));
    for (let i = 1; i < sheets.length; i++) assert.ok(sheets[i].top >= sheets[i - 1].bottom, "marked pages grow instead of overlapping");

    if (process.env.SHOT) { await summary.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT}/markup.png` }); }
    await toggle.uncheck();
    await expect(page.locator("[data-report-paper] ins, [data-report-paper] del")).toHaveCount(0);
    const story = summary.getByRole("textbox", { name: "Story text", exact: true });
    await story.fill("Revised report passage, edited again.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].report.pages[0].text, "Revised report passage, edited again.", "saved text carries no markup");
    assert.equal(saves[0].report.cover.title, "Annual Symposium");
    await toggle.check();
    await expect.poll(() => changesRequests).toBe(2);
    await expect(summary.locator("ins").first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scroll on a phone");
    assert.deepEqual(errors, []);
    console.log("PASS: presence (who is here, where, editing outline, heartbeat location), Show changes on/off, change list, layout growth, clean saves; mocked requests only");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
