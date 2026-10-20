import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";

const endpoint = "https://review.test/api/public/page-review/newsletter-token";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

async function main() {
  const browser = await chromium.launch();
  let round = 2, comparisonReads = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.clock.install();
    await page.route("https://newsletter.test/**", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      headers: { "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups" },
      body: `<!doctype html><html><head><meta charset="utf-8"><title>Newsletter fixture</title></head><body><h1 id="headline">Current newsletter</h1><script data-viewer="staff-token">${overlaySource(endpoint, "October Newsletter", true)}</script></body></html>`,
    }));
    await page.route(endpoint + "**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      assert.equal(route.request().headers().authorization, "Bearer staff-token");
      const review = { title: "October Newsletter", round, status: "open" };
      if (route.request().url().includes("comparison=1")) {
        comparisonReads++;
        return route.fulfill({ headers, body: JSON.stringify({ ok: true, review, comparison: {
          beforeHtml: "<h1>Original newsletter</h1><script>window.untrustedScriptRan = true;</script>",
          afterHtml: "<h1>Revised newsletter</h1>",
        } }) });
      }
      return route.fulfill({ headers, body: JSON.stringify({ ok: true, review,
        viewer: { id: "staff", name: "Colleague" },
        comments: [
          { id: "old-open", body: "Earlier open feedback", round: 1, status: "open" },
          { id: "old-resolved", body: "Earlier resolved feedback", round: 1, status: "resolved" },
          { id: "current", body: "Current round feedback", round: 2, status: "open" },
        ].map((comment) => ({ ...comment, parentId: null, authorName: "Colleague", createdAt: "2026-10-20T12:00:00Z", anchorKey: "#headline", anchorQuote: "Current newsletter" })),
      }) });
    });
    await page.goto("https://newsletter.test/");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await page.getByRole("heading", { name: "Round 2 · Before / after", exact: true }).waitFor();
    await page.frameLocator('iframe[title="Before · Round 1"]').getByRole("heading", { name: "Original newsletter" }).waitFor();
    await page.frameLocator('iframe[title="After · Round 2"]').getByRole("heading", { name: "Revised newsletter" }).waitFor();
    assert.equal(await page.frameLocator('iframe[title="Before · Round 1"]').locator("body").evaluate(() => "untrustedScriptRan" in window), false);
    assert.equal(await page.locator("iframe[sandbox='']").count(), 2);
    await page.clock.runFor(31_000);
    assert.equal(await dialog.isVisible(), true, "polling must not dismiss comparison");
    assert.equal(comparisonReads, 1);
    await page.screenshot({ path: "/tmp/bhn-newsletter-comparison-desktop.png" });
    await page.getByRole("button", { name: "Close comparison", exact: true }).click();
    const history = page.locator("details.bhn-rv-history");
    assert.equal(await history.getAttribute("open"), null);
    assert.equal(await page.getByText("Earlier open feedback", { exact: true }).isVisible(), false);
    await page.getByText("Current round feedback", { exact: true }).waitFor();
    await page.getByText("Previous rounds · 2 threads", { exact: true }).click();
    await page.getByText("Earlier open feedback", { exact: true }).waitFor();
    await page.getByText("Earlier resolved feedback", { exact: true }).waitFor();
    await page.clock.runFor(31_000);
    assert.equal(await dialog.isVisible(), false, "dismissal must survive polling even when sandbox blocks storage");
    await page.getByRole("button", { name: "Before / after comparison", exact: true }).click();
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    round = 3;
    await page.clock.runFor(31_000);
    await page.getByRole("heading", { name: "Round 3 · Before / after", exact: true }).waitFor();
    assert.equal(comparisonReads, 2);
    await page.getByRole("button", { name: "Close comparison", exact: true }).click();
    assert.equal(await history.getAttribute("open"), null, "next round collapses all previous feedback again");
    await page.getByRole("button", { name: "Reload current version", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Before / after comparison", exact: true }).click();
    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
    assert.equal(await page.locator(".bhn-rv-compare-grid").evaluate((node) => node.scrollWidth > node.clientWidth), true);
    await page.screenshot({ path: "/tmp/bhn-newsletter-comparison-mobile.png" });
    console.log("PASS: round history, default comparison, close/reopen, polling, round transition, sandbox and mobile layout");
  } finally {
    await browser.close();
  }
}

void main();
