import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
import { editReviewHtml } from "../../src/lib/page-review/edit-html";

const origin = "https://review-draft.test";
type Draft = { target: string; baseline: string; round: number; body: string; etag: string };

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const clockStart = new Date("2026-11-26T14:00:00Z");
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
    page.on("dialog", async dialog => { await dialog.accept(); });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const surface of ["newsletter", "social", "report", "website", "guest"] as const) {
      const htmlReview = surface === "newsletter", site = surface === "website" || surface === "guest";
      const social = surface === "social", staff = surface === "report" || social;
      const endpoint = origin + "/api/review/" + surface, staffPath = staff ? origin + "/api/staff/" + surface : null;
      let draft: Draft | null = null, puts = 0, deletes = 0, posted = 0, sharedSaves = 0;
      const copyTag = htmlReview ? "div" : "p";
      const copyAttributes = htmlReview ? 'data-preserved-wording="true" style="white-space:pre-wrap"' :
        social ? 'data-copy-part="0"' : surface === "report" ? 'data-bhn-review-text' : "";
      let copy = htmlReview ? "<strong>Original</strong> paragraph." : "Original paragraph.";
      const source = () => `<!doctype html><html><head><meta charset="utf-8"></head><body>
        ${staff ? `<div ${social ? "data-social-review" : "data-report-paper"}><div id="frame"><article ${social ? 'data-copy-page data-copy-version="6" data-copy-editable="true"' : "data-print-page"}>` : ""}
        <div style="height:1200px" aria-hidden="true"></div>
        <${copyTag} id="paragraph" ${copyAttributes}>${copy}</${copyTag}>
        ${staff ? "</article></div></div>" : ""}
        <button id="outside" style="position:fixed;top:110px;left:12px">Leave editing</button>
        <div style="height:1400px" aria-hidden="true"></div>
        <script data-viewer="fixture" data-round="5">${overlaySource(endpoint, "Test Review", true, staffPath, social ? "social" : "report", { contextualHtml: htmlReview, website: site })}</script>
        </body></html>`;
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS" };
      await page.route(origin + "/source/" + surface, route => route.fulfill({ contentType: "text/html; charset=utf-8",
        headers: htmlReview ? { "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups" } : {}, body: source() }));
      await page.route(endpoint + "**", async route => {
        const { pathname } = new URL(route.request().url()), method = route.request().method();
        if (method === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
        if (pathname.endsWith("/document") && method === "GET") return route.fulfill({ headers: cors, json: { ok: true, editable: true, round: 5 } });
        if (method === "POST") posted++;
        if (method === "PATCH") {
          sharedSaves++;
          const { edits } = route.request().postDataJSON();
          assert.equal(edits[0].after, htmlReview ? "Original\n" : "Original\n paragraph.");
          if (htmlReview) {
            copy = editReviewHtml('<div data-preserved-wording="true">' + copy + "</div>", edits)
              .trim().replace(/^<div[^>]*>|<\/div>$/g, "");
          } else copy = edits[0].after;
        }
        return route.fulfill({ headers: cors, json: { ok: true, viewer: { name: "Reviewer", id: surface === "guest" ? "" : "fixture" }, review: { title: "Test", round: 5, status: "open" }, comments: [] } });
      });
      if (surface === "report") {
        await page.addInitScript(() => document.addEventListener("bhn-review-replace-text", e => {
          const { detail } = e as CustomEvent<{ accepted: boolean; value: string }>;
          document.documentElement.dataset.reportReplacement = detail.value;
          detail.accepted = true;
        }, true));
      }
      await page.route((staffPath || endpoint) + "/text-checkpoint", async route => {
        const method = route.request().method();
        if (method === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
        if (method === "GET") return route.fulfill({ headers: cors, json: { ok: true, draft } });
        if (method === "DELETE") {
          deletes++; assert.equal(route.request().postDataJSON().etag, draft?.etag);
          draft = null; return route.fulfill({ headers: cors, json: { ok: true } });
        }
        assert.equal(method, "PUT");
        const payload = route.request().postDataJSON();
        assert.equal(payload.round, 5); assert.equal(payload.target, copyTag + "#paragraph"); assert.match(payload.baseline, /^[a-f0-9]{64}$/);
        puts++; const etag = `draft-${puts}`; draft = { ...payload, etag };
        await new Promise(resolve => setTimeout(resolve, 180));
        return route.fulfill({ headers: cors, json: { ok: true, etag } });
      });
      await page.goto(origin + "/source/" + surface + "#review-notes");
      if (htmlReview) await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible();
      await expect(page.getByText("Round 5 · Reviewer")).toBeVisible();
      await page.locator("#paragraph").click();
      const editor = page.locator("[data-bhn-rv-inline-text]"), tools = page.getByRole("group", { name: "Paragraph actions" });
      await expect(editor).toBeFocused();
      await editor.fill("Private draft.");
      await page.clock.runFor(4000);
      await editor.fill("Private draft after another keystroke.");
      await editor.evaluate(node => {
        const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
        window.getSelection()?.collapse(text, 14);
      });
      await editor.press("Enter");
      await expect(editor).toBeFocused();
      const edited = "Private draft \nafter another keystroke.";
      assert.equal(await editor.evaluate(node => (node as HTMLElement).innerText), edited);
      await page.clock.runFor(7999);
      assert.equal(puts, 0, surface + " waits for eight uninterrupted quiet seconds");
      const caret = await editor.evaluate(node => ({ offset: window.getSelection()?.anchorOffset, text: node.textContent }));
      const saved = surface === "guest" ? "Draft saved in this tab" : site ? "Draft saved · not posted" : "Draft saved";
      await page.clock.runFor(1);
      await expect(tools.getByRole("status")).toHaveText(saved);
      assert.equal(puts, surface === "guest" ? 0 : 1);
      assert.equal(await editor.evaluate((node, before) => window.getSelection()?.anchorOffset === before.offset && node.textContent === before.text, caret), true);
      await expect(editor).toBeFocused();
      assert.equal(sharedSaves, 0);
      assert.equal(posted, 0);
      await expect(page.getByText("Round 5 · Reviewer")).toBeVisible();
      if (surface !== "guest") {
        await editor.fill("An intermediate draft.");
        await page.clock.runFor(8000);
        assert.equal(puts, 1, surface + " rate-limits background writes after the first checkpoint");
        await editor.fill(edited + " Latest.");
        await page.clock.runFor(22000);
        await expect(tools.getByRole("status")).toHaveText(saved);
        assert.equal(puts, 2);
        assert.equal((draft as Draft | null)?.body, edited + " Latest.");
        await page.clock.runFor(60000);
        assert.equal(puts, 2, "no more writes while idle");
      }
      await page.reload();
      if (htmlReview) await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible();
      await expect(page.getByText("Round 5 · Reviewer")).toBeVisible();
      await page.locator("#paragraph").click();
      await tools.getByRole("button", { name: "Restore saved draft" }).click();
      await expect(editor).toBeFocused();
      const restored = surface === "guest" ? edited : edited + " Latest.";
      assert.equal(await editor.evaluate(node => node.textContent), restored);
      if (site) {
        await editor.press("Control+Enter");
        await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveValue("Suggested replacement:\n" + restored);
        await expect(page.locator("#paragraph")).toHaveText("Original paragraph.");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      } else {
        await tools.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      if (surface !== "guest") await expect.poll(() => deletes).toBe(1);
      assert.equal(puts, surface === "guest" ? 0 : 2, "restoring without changing creates no new checkpoint");
      assert.equal(posted, 0, "save and cancel never post a suggestion");
      if (!site) {
        await page.locator("#paragraph").click();
        await editor.evaluate(node => window.getSelection()?.collapse(node.firstChild?.firstChild ?? node.firstChild, 8));
        await editor.press("Enter");
        await expect(editor).toBeFocused();
        const originalY = await page.evaluate(() => window.scrollY);
        assert(originalY > 500);
        if (surface === "report") {
          await page.locator("#outside").focus();
          await page.clock.runFor(1);
        } else {
          await Promise.all([page.waitForEvent("load", { timeout: 6000 }), (async () => {
            await page.locator("#outside").click({ timeout: 3000 });
            await page.clock.runFor(1);
          })()]);
        }
        if (surface === "report") {
          assert.equal(await page.locator("html").getAttribute("data-report-replacement"), "Original\n paragraph.");
        } else {
          await expect.poll(() => sharedSaves).toBe(1);
          await expect.poll(() => page.evaluate(() => ({ y: window.scrollY, hash: location.hash })))
            .toEqual({ y: originalY, hash: "#review-notes" });
          if (htmlReview) {
            await expect(page.locator("#paragraph strong br")).toHaveCount(1);
            await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible();
            await page.locator("#paragraph").click();
            assert.equal(await editor.evaluate(node => node.textContent), "Original\n paragraph.");
            await editor.press("Escape");
          }
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS: rate-limited idle checkpoints, in-place line breaks, draft recovery, and no automatic website post in all four adapters.");
  } finally { await browser.close(); }
}
void main();
