import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";

const endpoint = "https://review.test/api/public/page-review/newsletter-token";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
async function main() {
  const browser = await chromium.launch();
  let round = 4, enabled = true;
  const comments: Record<string, unknown>[] = [];
  const errors: string[] = [], writes: Record<string, unknown>[] = [];
  const html = () => `<html><head><meta charset="utf-8"><title>Newsletter review fixture</title><style>body{margin:32px;font:16px Arial;background:#edf3f4}main{max-width:600px;background:white;padding:28px}h2{color:#0b3558}a{color:#176879}section{margin-bottom:48px}</style></head><body><main>
    <h1>November newsletter</h1>
    <section><h2>Workshop one</h2><p data-nl-piece="one" data-nl-part="CTA"><a href="/registration">Register</a></p></section>
    <section><h2>Workshop two</h2><p data-nl-piece="two" data-nl-part="CTA"><a href="/registration">Register</a></p>
    <p data-nl-piece="two" data-nl-part="Picture 1" data-nl-image="image-two"><img alt="Workshop two image" width="260" height="90" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='90'%3E%3Crect width='260' height='90' fill='%2383b9be'/%3E%3C/svg%3E"></p></section></main>
    <script data-viewer="colleague" data-round="${round}">${overlaySource(endpoint, "November newsletter", true, null, "report", { contextualHtml: enabled })}</script></body></html>`;
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, hasTouch: true });
    await context.route("https://newsletter.test/**", route => route.fulfill({ contentType: "text/html",
      headers: { "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups" }, body: html() }));
    await context.route(endpoint + "**", async route => {
      const request = route.request(), method = request.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (method !== "GET") {
        const input = request.postDataJSON(); writes.push(input);
        if (input.expectedRound !== round) return route.fulfill({ status: 409, headers, json: { error: "This review changed. Reload the current version before commenting." } });
        if (method === "POST") {
          const parent = comments.find(c => c.id === input.parentId);
          const comment = { ...input, ...(parent ? { anchorKey: parent.anchorKey, anchorQuote: parent.anchorQuote } : {}),
            id: String(comments.length + 1), parentId: input.parentId || null, round, status: "open",
            authorName: "Colleague", createdAt: new Date().toISOString(), isMine: true };
          comments.push(comment);
          return route.fulfill({ headers, json: { ok: true, comment } });
        }
        const comment = comments.find(c => c.id === input.id)!;
        if (method === "PATCH") Object.assign(comment, input);
        if (method === "DELETE") comments.splice(comments.indexOf(comment), 1);
        return route.fulfill({ headers, json: { ok: true, comment } });
      }
      const review = { title: "November newsletter", round, status: "open" };
      if (request.url().includes("comparison=1")) return route.fulfill({ headers, json: { ok: true, review,
        comparison: { availableRounds: [1, 2, 3, 4], versions: [3, 4].map(r => ({ round: r, html: "<p>Version " + r + "</p>" })) } } });
      return route.fulfill({ headers, json: { ok: true, review, viewer: { id: "colleague", name: "Colleague" }, comments } });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://newsletter.test/");
    await expect(page.getByRole("button", { name: "Comment on an element", exact: true })).toBeVisible();
    assert.equal(await page.getByRole("dialog").count(), 0, "comparison opens only on request");
    assert.equal(await page.getByPlaceholder("Your name").count(), 0);
    await page.locator('[data-nl-piece="two"] a').first().hover();
    await page.getByRole("button", { name: "Comment on selected newsletter element" }).click();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Please check the second workshop link.");
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.getByText("Please check the second workshop link.", { exact: true })).toBeVisible();
    assert.equal(writes[0].expectedRound, 4);
    assert.match(String(writes[0].anchorKey), /two/);
    await page.getByRole("button", { name: "Show comment 1 on page" }).click();
    await page.mouse.move(1,1);
    await expect.poll(() => page.locator(".bhn-review-highlight").evaluate(el => {
      const link = document.querySelector('[data-nl-piece="two"] a')!;
      return Math.abs(parseFloat((el as HTMLElement).style.top) - link.getBoundingClientRect().top);
    })).toBeLessThan(2);
    const colleague = await context.newPage();
    await colleague.goto("https://newsletter.test/");
    await colleague.locator(".bhn-rv-thread-toggle").click();
    await colleague.getByRole("button", { name: "Reply", exact: true }).click();
    await colleague.getByRole("textbox", { name: "Reply to Colleague" }).fill("Checked the workshop details.");
    await colleague.locator(".bhn-rv-reply-compose").getByRole("button", { name: "Reply", exact: true }).click();
    await expect(colleague.getByText("Checked the workshop details.", { exact: true })).toBeVisible();
    assert.equal(comments[1].parentId, "1");
    await colleague.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(colleague.getByRole("button", { name: "General comment", exact: true })).toBeEnabled();
    await colleague.getByRole("button", { name: "Reopen", exact: true }).click();
    const before = writes.length;
    await page.getByRole("button", { name: "Copy comments", exact: true }).click();
    const fallback = page.getByRole("textbox", { name: "Comments ready to copy" });
    await expect(fallback).toBeVisible();
    assert.match(await fallback.inputValue(), /Please check the second workshop link/);
    assert.equal(writes.length, before, "copy has no write side effect");
    await page.getByRole("button", { name: "Close copy text" }).click();
    await page.getByRole("button", { name: "Before / after comparison" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    // Touch/keyboard selection doesn't navigate a link.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Comment on an element", exact: true }).tap();
    await page.locator('[data-nl-piece="two"] img').tap();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toBeVisible();
    await page.locator(".bhn-rv-compose").getByRole("button", { name: "Cancel", exact: true }).tap();
    await page.getByRole("button", { name: "Comment on an element", exact: true }).click();
    await page.locator('[data-nl-piece="two"] img').focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "New review comment" })).toBeVisible();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Keep this draft during the conflict.");
    round = 5; // Another editor advances the round before the next poll.
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.getByText(/This review changed/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveValue("Keep this draft during the conflict.");
    assert.equal(comments.length, 2);
    await page.screenshot({ path: "/private/tmp/newsletter-contextual-mobile.png", fullPage: true });
    enabled = false; // Rollback retains comments and legacy view support.
    await page.reload();
    await expect(page.locator(".bhn-rv-history")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator(".bhn-rv-history summary").click();
    await page.locator(".bhn-rv-thread-toggle").click();
    await expect(page.getByText("Please check the second workshop link.", { exact: true })).toBeVisible();
    assert.equal(comments.length, 2);
    assert.deepEqual(errors, []);
    console.log("PASS: newsletter contextual comments, exact CTA, team replies, read-only copy, explicit comparison, keyboard/mobile selection, stale write draft retention and UI rollback.");
  } finally { await browser.close(); }
}
void main();
