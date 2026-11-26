import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";

const origin = "https://review-draft.test";
type Draft = { target: string; baseline: string; round: number; body: string; etag: string };

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on("dialog", async dialog => { await dialog.accept(); });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const surface of ["newsletter", "social", "report", "website", "guest"] as const) {
      const htmlReview = surface === "newsletter", site = surface === "website" || surface === "guest";
      const social = surface === "social", staff = surface === "report" || social;
      const endpoint = origin + "/api/review/" + surface, staffPath = staff ? origin + "/api/staff/" + surface : null;
      let draft: Draft | null = null, puts = 0, deletes = 0, posted = 0, sharedSaves = 0;
      const source = `<!doctype html><html><head><meta charset="utf-8"></head><body>
        ${staff ? `<div ${social ? "data-social-review" : "data-report-paper"}><div id="frame"><article ${social ? 'data-copy-page data-copy-version="6" data-copy-editable="true"' : "data-print-page"}>` : ""}
        <p id="paragraph" ${social ? 'data-copy-part="0"' : surface === "report" ? 'data-bhn-review-text' : ""}>Original paragraph.</p>
        ${staff ? "</article></div></div>" : ""}
        <button id="outside">Leave editing</button>
        <script data-viewer="fixture" data-round="5">${overlaySource(endpoint, "Test Review", true, staffPath, social ? "social" : "report", { contextualHtml: htmlReview, website: site })}</script>
        </body></html>`;
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS" };
      await page.route(origin + "/source/" + surface, route => route.fulfill({ contentType: "text/html; charset=utf-8",
        headers: htmlReview ? { "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups" } : {}, body: source }));
      await page.route(endpoint + "**", async route => {
        const { pathname } = new URL(route.request().url()), method = route.request().method();
        if (method === "OPTIONS") return route.fulfill({ headers: cors, status: 204 });
        if (pathname.endsWith("/document") && method === "GET") return route.fulfill({ headers: cors, json: { ok: true, editable: true, round: 5 } });
        if (method === "POST") posted++;
        if (method === "PATCH") sharedSaves++;
        return route.fulfill({ headers: cors, json: { ok: true, viewer: { name: "Reviewer", id: surface === "guest" ? "" : "fixture" }, review: { title: "Test", round: 5, status: "open" }, comments: [] } });
      });
      if (surface === "report") {
        await page.addInitScript(() => document.addEventListener("bhn-review-replace-text", e => {
          const { detail } = e as CustomEvent<{ accepted: boolean }>; detail.accepted = true;
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
        assert.equal(payload.round, 5); assert.equal(payload.target, "p#paragraph"); assert.match(payload.baseline, /^[a-f0-9]{64}$/);
        puts++; const etag = `draft-${puts}`; draft = { ...payload, etag };
        await new Promise(resolve => setTimeout(resolve, 180));
        return route.fulfill({ headers: cors, json: { ok: true, etag } });
      });
      await page.goto(origin + "/source/" + surface);
      if (htmlReview) await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible();
      await expect(page.getByText("Round 5 · Reviewer")).toBeVisible();
      await page.locator("#paragraph").click();
      const editor = page.locator("[data-bhn-rv-inline-text]"), tools = page.getByRole("group", { name: "Paragraph actions" });
      await expect(editor).toBeFocused();
      await editor.fill("Private draft.");
      await page.waitForTimeout(1075);
      await editor.fill("Private draft after another keystroke.");
      await page.waitForTimeout(1075);
      assert.equal(puts, 0, surface + " waits until two quiet seconds");
      const caret = await editor.evaluate(node => ({ offset: window.getSelection()?.anchorOffset, text: node.textContent }));
      const saved = surface === "guest" ? "Draft saved in this tab" : site ? "Draft saved · not posted" : "Draft saved";
      await expect(tools.getByRole("status")).toHaveText(saved);
      assert.equal(puts, surface === "guest" ? 0 : 1);
      assert.equal(await editor.evaluate((node, before) => window.getSelection()?.anchorOffset === before.offset && node.textContent === before.text, caret), true);
      await expect(editor).toBeFocused();
      assert.equal(sharedSaves, 0);
      assert.equal(posted, 0);
      await expect(page.getByText("Round 5 · Reviewer")).toBeVisible();
      if (htmlReview) {
        await page.waitForTimeout(2200);
        assert.equal(puts, 1, "idling after the successful checkpoint creates no more writes");
      }
      await page.reload();
      if (htmlReview) await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible();
      await expect(page.getByText("Round 5 · Reviewer")).toBeVisible();
      await page.locator("#paragraph").click();
      await tools.getByRole("button", { name: "Restore saved draft" }).click();
      await expect(editor).toBeFocused();
      await expect(editor).toHaveText("Private draft after another keystroke.");
      if (site) {
        await editor.press("Enter");
        await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveValue("Suggested replacement:\nPrivate draft after another keystroke.");
        await expect(page.locator("#paragraph")).toHaveText("Original paragraph.");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      } else {
        await tools.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      if (surface !== "guest") await expect.poll(() => deletes).toBe(1);
      assert.equal(puts, surface === "guest" ? 0 : 1, "restoring without changing creates no new checkpoint");
      assert.equal(posted, 0, "save and cancel never post a suggestion");
    }
    assert.deepEqual(errors, []);
    console.log("PASS: idle two-second checkpoints and recovery in all four adapters, stable caret/round, guest tab storage, no automatic website post.");
  } finally { await browser.close(); }
}
void main();
