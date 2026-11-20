import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
import ts from "typescript";
import * as limits from "../../src/lib/page-review/limits";
import * as brief from "../../src/lib/page-review/brief";
import * as overlay from "../../src/lib/page-review/overlay-source";
import * as report from "../../src/lib/symposium-report/document";
import * as snapshot from "../../src/lib/symposium-report/review-snapshot";

const origin = "https://report.test";
const endpoint = origin + report.REPORT_API + "/review";
const mutation = origin + "/api/workspace/page-review/" + report.REPORT_ID;
const require = createRequire(import.meta.url);
const fixture = (round: number) => ({
  cover: { title: "Annual Symposium", theme: "Future workforce", date: "October 29" },
  pages: [{ id: "panels", label: "Panel", title: "Panel review", text: round === 4 ? "Final keynote passage" : `Original passage ${round}`, frames: 1 }],
  back: { title: "BioHubNet", text: '<script>throw new Error("not markup")</script>' },
});

async function main() {
  let authorized = false, reads = 0;
  let status = "open";
  let exports = 0;
  const comments = [{
    id: "earlier", parentId: null, round: 2, anchorQuote: "Final keynote passage", anchorKey: "#report-frame-panels-0",
    authorUserId: "other", authorName: "Reviewer", authorKind: "user", body: "Earlier note", status: "resolved",
    createdAt: new Date("2026-11-17T10:00:00Z"), editedAt: null, editedByName: null,
  }];
  const archived = [1, 2, 3].map((round) => ({ round, html: JSON.stringify(fixture(round)) }));
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => {
      assert.equal(role, "instructor");
      return authorized ? { user: { id: "staff-private", name: "Signed-in staff" } } : null;
    } },
    "@/lib/prisma": { prisma: {
      pageReview: { findUnique: async ({ where, select }: { where: { id: string; kind: string }; select: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: report.REPORT_ID, kind: "report" });
        reads++;
        return { title: "Report", round: 4, status, ...(select.comments ? { comments } :
          { pastedHtml: JSON.stringify(fixture(4)), versions: archived.map(({ round }) => ({ round })) }) };
      }, update: async ({ data }: { data: { status: string } }) => { status = data.status; exports++; } },
      pageReviewVersion: { findMany: async ({ where }: { where: { round: { in: number[] } } }) => archived.filter(({ round }) => where.round.in.includes(round)) },
    } },
    "@/lib/page-review/limits": limits,
    "@/lib/page-review/brief": brief,
    "@/lib/page-review/overlay-source": overlay,
    "@/lib/symposium-report/document": report,
    "@/lib/symposium-report/review-snapshot": snapshot,
  };
  mocks["@/lib/symposium-report/store"] = { reportTransaction: (run: (db: unknown) => Promise<Response>) => run((mocks["@/lib/prisma"] as { prisma: unknown }).prisma) };
  const compiled = ts.transpileModule(readFileSync(new URL("../../src/app/api/workspace/symposium-2026/report/review/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const handler = {} as { GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> };
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), handler);
  for (const query of ["", "?overlay=1", "?brief=1", "?comparison=1"]) {
    assert.equal((await handler.GET(new Request(endpoint + query))).status, 403);
  }
  assert.equal(reads, 0, "anonymous visitors cannot trigger any report reads");
  authorized = true;
  assert.equal((await handler.GET(new Request(endpoint + "?comparison=1&rounds=2,2"))).status, 400);
  const reader = await handler.GET(new Request(endpoint));
  assert.equal(reader.headers.get("Cache-Control"), "private, no-store");
  assert.doesNotMatch(await reader.text(), /authorUserId|staff-private/);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    await page.context().addCookies([{ name: "mock-staff", value: "1", domain: "report.test", path: "/", secure: true, sameSite: "Lax" }]);
    await page.route(origin + report.REPORT_API + "/assets/cover.jpg", async (route) => {
      if (!(await route.request().allHeaders()).cookie?.includes("mock-staff=1")) return route.fulfill({ status: 403 });
      return route.fulfill({ contentType: "image/png", body: readFileSync(new URL("../../public/biohubnet-logo.png", import.meta.url)) });
    });
    await page.route(origin + "/", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html>
      <a href="#not-review">Open report editor</a><main data-report-paper>
      <div id="report-frame-panels-0"><article aria-label="Panel review" data-print-page>
      <p style="margin-top:1300px">Final keynote passage</p></article></div></main>
      <script data-round="4" src="${endpoint}?overlay=1"></script>` }));
    await page.route(endpoint + "**", async (route) => {
      const request = new Request(route.request().url(), { method: route.request().method(), ...(route.request().method() === "POST" ? { headers: { "content-type": "application/json" }, body: route.request().postData() } : {}) });
      const response = await handler[route.request().method() === "POST" ? "POST" : "GET"](request);
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.route(mutation, async (route) => {
      const input = route.request().postDataJSON();
      assert.equal(route.request().method(), "POST");
      assert.equal(input.expectedRound, 4);
      if (input.action === "addComment") {
        if (!input.parentId) assert.equal(input.anchorKey, "#report-frame-panels-0");
        comments.push({ ...comments[0], id: input.parentId ? "reply" : "current", parentId: input.parentId, authorName: "Signed-in staff",
          body: input.body, status: "open", anchorQuote: input.anchorQuote, anchorKey: input.anchorKey, round: 4 });
      } else if (input.action === "editComment") {
        comments.find((comment) => comment.id === input.commentId)!.body = input.body;
      } else if (input.action === "deleteComment") {
        comments.splice(comments.findIndex((comment) => comment.id === input.commentId), 1);
      } else throw new Error("Unexpected review mutation");
      await route.fulfill({ json: { ok: true, review: { comments } } });
    });
    await page.goto(origin);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const before = page.frameLocator('iframe[title="Before · Round 3"]');
    await expect(before.locator('mark[data-bhn-diff="removed"]').filter({ hasText: "Original" })).toBeVisible();
    await expect(before.locator("img")).toHaveAttribute("src", /^data:image\/jpeg;/);
    await expect(before.locator("script")).toHaveCount(1);
    await dialog.getByLabel("Round 1", { exact: true }).check();
    await dialog.getByLabel("Round 2", { exact: true }).check();
    await dialog.getByRole("button", { name: "Compare selected rounds" }).click();
    await expect(dialog.locator("iframe")).toHaveCount(4);
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Before / after comparison" }).click();
    await expect(dialog.locator("iframe")).toHaveCount(4);
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(page.getByPlaceholder("Your name")).toHaveCount(0);
    await page.getByRole("link", { name: "Open report editor" }).click();
    await expect(page).toHaveURL(/#not-review$/);
    const prior = page.locator("#bhn-review-overlay summary");
    await expect(prior).toContainText("Previous rounds");
    await prior.click();
    await page.getByRole("button", { name: "Show comment 1 on page" }).click();
    await expect(page.locator(".bhn-review-highlight-flash")).toBeVisible();
    await page.getByRole("article", { name: "Panel review" }).getByText("Final keynote passage", { exact: true }).click();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Please check the keynote wording.");
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    const thread = page.locator('[data-thread-id="current"]');
    await expect(thread).toContainText("Please check the keynote wording.");
    await thread.getByRole("button", { name: "Reply", exact: true }).click();
    await thread.getByRole("textbox").fill("I can verify this.");
    await thread.locator(".bhn-rv-reply-compose").getByRole("button", { name: "Reply", exact: true }).click();
    await expect(thread).toContainText("I can verify this.");
    await thread.getByRole("button", { name: "Edit reply by Signed-in staff" }).click();
    await thread.getByRole("textbox").fill("Verified the wording.");
    await thread.getByRole("button", { name: "Save", exact: true }).click();
    await expect(thread).toContainText("Verified the wording.");
    await thread.getByRole("button", { name: "Delete reply by Signed-in staff" }).click();
    await thread.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      let first = true;
      navigator.clipboard.writeText = async (text) => { if (first) { first = false; throw new Error("Clipboard denied"); } await write(text); };
    });
    await page.getByRole("button", { name: "Copy review comments" }).click();
    await expect(page.locator("#bhn-review-overlay")).toContainText("This round is locked, but clipboard access failed");
    assert.equal(status, "exported");
    await page.getByRole("button", { name: "Copy review comments" }).click();
    await expect(page.getByRole("button", { name: "Comments copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /Verified the wording/);
    assert.doesNotMatch(copied, /Earlier note/);
    assert.equal(status, "exported");
    assert.equal(exports, 1);
    await expect(page.locator("#bhn-review-overlay")).toContainText("was exported and is locked");
    await expect(thread.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);
    await page.getByRole("article", { name: "Panel review" }).getByText("Final keynote passage", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveCount(0);
    console.log("PASS: staff-only report reads, anchored threads and replies, copy, four-round comparison");
  } finally { await browser.close(); }
}

void main();
