import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { changeLinkedinBoard, LinkedinAction, LinkedinInput, publicLinkedinTestimonials, type LinkedinSnapshot } from "../../src/lib/events/linkedin";

async function main() {
  const at = "2026-11-04T18:00:00.000Z";
  let snapshot: LinkedinSnapshot = { board: changeLinkedinBoard({ entries: [], checkedAt: null, coverage: "Internal coverage" }, { action: "add", entry: LinkedinInput.parse({ author: "Example Attendee", sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123", kind: "mention", topic: "symposium", sourceText: "A useful conversation about life sciences careers.", reply: "Private draft", status: "pending" }) }, "Admin", at), version: at };
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import React from 'react';import{createRoot}from'react-dom/client';import{SymposiumLinkedin}from'./src/components/admin/events/SymposiumLinkedin';import{LinkedinFeedback}from'./src/components/events/LinkedinFeedback';createRoot(document.getElementById('root')).render(location.pathname==='/admin'?<SymposiumLinkedin/>:<LinkedinFeedback quotes={window.quotes}/>);" }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env": "{}" } });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await page.route("https://feedback.test/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/app.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
      if (path === "/biohubnet-logo.png") return route.fulfill({ contentType: "image/png", body: await readFile("public/biohubnet-logo.png") });
      if (path === "/api/admin/symposium-linkedin") {
        if (route.request().method() !== "POST") return route.fulfill({ json: snapshot });
        const input = route.request().postDataJSON(); assert.equal(input.version, snapshot.version);
        snapshot = { board: changeLinkedinBoard(snapshot.board, LinkedinAction.parse(input.change), "Curator", at), version: new Date(new Date(snapshot.version!).getTime() + 1).toISOString() };
        return route.fulfill({ json: { conflict: false, snapshot } });
      }
      return route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>BioHubNet feedback</title><style>${css.css}body{margin:0}#root{min-width:0}</style></head><body><div id="root"></div><script>window.quotes=${JSON.stringify(publicLinkedinTestimonials(snapshot.board)).replace(/</g, "\\u003c")}</script><script src="/app.js"></script></body></html>` });
    });
    await page.route("https://www.linkedin.com/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>Original post</body></html>" }));
    await page.goto("https://feedback.test/admin");
    const quote = page.getByRole("textbox", { name: "Public quote" });
    await quote.fill("Rewritten praise");
    await expect(page.getByRole("button", { name: "Show on public page" })).toBeDisabled();
    await quote.fill("A useful conversation about life sciences careers.");
    await page.getByRole("textbox", { name: "Draft reply as BioHubNet" }).fill("Unsaved private reply");
    await page.getByRole("button", { name: "Show on public page" }).click();
    await expect(page.getByRole("button", { name: "Reload queue" })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Draft reply as BioHubNet" })).toHaveValue("Unsaved private reply");
    assert.equal(snapshot.board.entries[0].reply, "Private draft", "Publishing does not save a private reply draft");
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reload queue" })).toBeEnabled();
    await expect(page.getByText("1 published quotes")).toBeVisible();
    await page.goto("https://feedback.test/public");
    await expect(page.getByRole("blockquote")).toContainText("A useful conversation");
    assert.ok(!await page.locator("body").innerText().then(text => /Private draft|Internal coverage|Curator/.test(text)));
    await page.getByRole("button", { name: "Copy all for Word" }).click();
    await expect(page.getByRole("button", { name: "Copied for Word" })).toBeVisible();
    const clipboard = await page.evaluate(async () => { const items = await navigator.clipboard.read(); return { html: await (await items[0].getType("text/html")).text(), text: await (await items[0].getType("text/plain")).text() }; });
    assert.ok(clipboard.html.includes("<blockquote>")); assert.ok(clipboard.html.includes("Original LinkedIn post")); assert.ok(clipboard.text.includes("Example Attendee"));
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await mkdir("output/linkedin-feedback", { recursive: true });
    await page.screenshot({ path: "output/linkedin-feedback/desktop.png", fullPage: true });
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false); }
    await page.screenshot({ path: "output/linkedin-feedback/mobile.png", fullPage: true });
    await page.goto("https://feedback.test/admin");
    await page.getByRole("button", { name: "Remove from public page" }).click();
    await expect(page.getByText("0 published quotes")).toBeVisible();
    await page.goto("https://feedback.test/public");
    await expect(page.getByText("Community reflections will appear here soon.")).toBeVisible();
    console.log("PASS: curated publication/removal, draft preservation, public privacy, rich Word clipboard, responsive layout and accessibility.");
  } finally { await browser.close(); }
}
void main();
