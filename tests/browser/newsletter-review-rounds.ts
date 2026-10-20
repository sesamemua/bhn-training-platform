import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
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
        const selected = new URL(route.request().url()).searchParams.get("rounds")?.split(",").map(Number) ?? [round - 1, round];
        const versions = selected.map((version) => ({ round: version, html:
          (version === 1 ? '<meta http-equiv="Content-Security-Policy" content="script-src * unsafe-inline"><h1>Original newsletter</h1><script>window.untrustedScriptRan = true;</script><img src="data:,broken" onerror="window.untrustedScriptRan=true"><a href="https://old.test">Registration</a>' : '<h1>Revised newsletter</h1><a href="https://new.test">Registration</a><p>New deadline: October 23</p>') + '<div style="width:900px;height:2px;background:navy"></div>' + Array.from({ length: 40 }, (_, index) => `<p style="margin:40px 0">Shared paragraph ${index}</p>`).join("")
        }));
        return route.fulfill({ headers, body: JSON.stringify({ ok: true, review, comparison: {
          beforeHtml: versions[0].html, afterHtml: versions.at(-1)!.html, versions,
          availableRounds: Array.from({ length: round }, (_, index) => index + 1),
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
    assert.equal(await page.locator("iframe[sandbox='allow-scripts']").count(), 2);
    const before = page.frameLocator('iframe[title="Before · Round 1"]');
    const after = page.frameLocator('iframe[title="After · Round 2"]');
    assert.equal(await before.locator('mark[data-bhn-diff="removed"]').first().textContent(), "Original");
    assert.equal(await after.locator('mark[data-bhn-diff="added"]').first().textContent(), "Revised");
    assert.equal(await before.locator('a[data-bhn-diff="removed"]').count(), 1);
    assert.equal(await after.locator('a[data-bhn-diff="added"]').count(), 1);
    assert.equal(await before.locator('[onerror]').count(), 0);
    assert.equal(await before.locator('script').count(), 1, "only the trusted sizing script survives");
    await before.locator("body").evaluate(node => {
      const script = node.ownerDocument.createElement("script");
      script.textContent = "window.untrustedScriptRan = true";
      node.appendChild(script);
      node.setAttribute("onclick", "window.untrustedScriptRan = true");
      (node as HTMLElement).click();
      node.removeAttribute("onclick");
      script.remove();
    });
    assert.equal(await before.locator("body").evaluate(() => "untrustedScriptRan" in window), false, "CSP blocks scripts and handlers even if injected after sanitization");
    await page.clock.runFor(1000);
    const initialFrames = await page.locator(".bhn-rv-compare-grid iframe").evaluateAll((frames) => frames.map((frame) => ({ height: frame.getBoundingClientRect().height, top: frame.getBoundingClientRect().top })));
    assert.ok(initialFrames.every((frame) => frame.height > 1500), "snapshots expand to full height inside one scroll container");
    await page.locator("iframe").first().evaluate(node => {
      const frame = node as HTMLIFrameElement;
      const key = new DOMParser().parseFromString(frame.srcdoc, "text/html").querySelector("script")!.dataset.bhnKey;
      window.postMessage({ type: "bhn-review-height", key, height: 100000 }, "*");
    });
    await page.clock.runFor(100);
    assert.equal(await page.locator("iframe").first().evaluate(node => node.getBoundingClientRect().height), initialFrames[0].height, "height messages from any window other than the matching frame are ignored");
    await page.mouse.move(350, 400);
    await page.mouse.wheel(0, 450);
    await page.clock.runFor(500);
    await expect.poll(() => page.locator(".bhn-rv-compare-grid").evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    const movedFrames = await page.locator(".bhn-rv-compare-grid iframe").evaluateAll((frames) => frames.map((frame) => frame.getBoundingClientRect().top));
    assert.ok(movedFrames[0] < initialFrames[0].top - 100, "scrolling over the left snapshot moves the shared viewport");
    assert.equal(movedFrames[0], movedFrames[1], "both snapshots move by exactly the same amount");
    await page.mouse.move(1000, 400);
    await page.mouse.wheel(0, 350);
    await page.clock.runFor(500);
    await expect.poll(() => page.locator(".bhn-rv-compare-grid").evaluate(node => node.scrollTop)).toBeGreaterThan(initialFrames[0].top - movedFrames[0] + 100);
    const rightScrolled = await page.locator(".bhn-rv-compare-grid iframe").evaluateAll((frames) => frames.map((frame) => frame.getBoundingClientRect().top));
    assert.ok(rightScrolled[0] < movedFrames[0] - 100, "scrolling over the right snapshot also moves both versions");
    assert.equal(rightScrolled[0], rightScrolled[1]);
    assert.equal(await before.locator("html").evaluate((node) => node.scrollTop), 0);
    assert.equal(await after.locator("html").evaluate((node) => node.scrollTop), 0);
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
    round = 5;
    await page.clock.runFor(31_000);
    await page.getByRole("heading", { name: "Round 5 · Before / after", exact: true }).waitFor();
    await page.getByRole("checkbox", { name: "Round 4", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "Round 1", exact: true }).check();
    await page.getByRole("button", { name: "Compare selected rounds" }).click();
    await page.locator('iframe[title="Before · Round 1"]').waitFor();
    assert.equal(await page.locator(".bhn-rv-compare-grid iframe").count(), 2);
    await page.getByRole("checkbox", { name: "Round 3", exact: true }).check();
    await page.getByRole("button", { name: "Compare selected rounds" }).click();
    await expect(page.locator(".bhn-rv-compare-grid iframe")).toHaveCount(3);
    await page.getByRole("checkbox", { name: "Round 2", exact: true }).check();
    await page.getByRole("button", { name: "Compare selected rounds" }).click();
    await expect(page.locator(".bhn-rv-compare-grid iframe")).toHaveCount(4);
    await expect(page.getByRole("checkbox", { name: "Round 4", exact: true })).toBeDisabled();
    await page.clock.runFor(1000);
    assert.equal(await page.locator(".bhn-rv-compare-grid").evaluate(node => node.scrollWidth > node.clientWidth), false, "all columns fit without a horizontal scrollbar");
    for (const frame of page.frames().slice(1)) {
      assert.equal(await frame.locator("html").evaluate(node => getComputedStyle(node).overflow), "hidden");
      assert.equal(await frame.locator("html").evaluate(node => node.scrollTop), 0);
    }
    await page.locator(".bhn-rv-compare-grid").evaluate(node => { node.scrollTop = 250; });
    const fourTops = await page.locator(".bhn-rv-compare-grid iframe").evaluateAll(frames => frames.map(frame => frame.getBoundingClientRect().top));
    assert.ok(fourTops.every(top => top === fourTops[0]), "all four rounds share one scroll position");
    await page.screenshot({ path: "/tmp/bhn-newsletter-comparison-four-rounds.png" });
    await page.getByRole("button", { name: "Close comparison", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Before / after comparison", exact: true }).click();
    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
    assert.equal(await page.locator(".bhn-rv-compare-grid").evaluate((node) => node.scrollWidth > node.clientWidth), false);
    await page.screenshot({ path: "/tmp/bhn-newsletter-comparison-mobile.png" });
    console.log("PASS: round history, default comparison, close/reopen, polling, round transition, sandbox and mobile layout");
  } finally {
    await browser.close();
  }
}

void main();
