import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { changeLinkedinBoard, LinkedinAction, LinkedinInput, type LinkedinSnapshot } from "../../src/lib/events/linkedin";

async function main() {
  const at = "2026-11-03T15:00:00.000Z";
  let snapshot: LinkedinSnapshot = { board: changeLinkedinBoard({ entries: [], checkedAt: null, coverage: "Browser review of activity and inbox; no background sync." }, { action: "import", coverage: "Browser review of activity and inbox", entries: ["Example Attendee", "Second Attendee"].map((author, i) => LinkedinInput.parse({ author, sourceUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${i + 1}`, kind: "mention", topic: i ? "training_week" : "symposium", sourceText: "A useful conversation about life sciences careers. ".repeat(50), reply: "Thank you for joining us!" })) }, "Admin", at), version: at };
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import React from 'react';import{createRoot}from'react-dom/client';import{SymposiumLinkedin}from'./src/components/admin/events/SymposiumLinkedin';createRoot(document.getElementById('root')).render(<SymposiumLinkedin/>);" }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env": "{}" } });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    let conflict = true, saves = 0;
    await page.route("https://linkedin.test/", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>Symposium LinkedIn</title><style>${css.css}body{margin:0;background:#fafbfc;color:#172022}main{padding:24px}</style></head><body><main><div id="root"></div></main><script src="/app.js"></script></body></html>` }));
    await page.route("https://linkedin.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.route("https://www.linkedin.com/embed/feed/update/**", route => route.fulfill({ contentType: "text/html", body: '<html lang="en"><head><title>LinkedIn post fixture</title></head><body style="margin:0;padding:16px;font:14px Arial;background:white;color:#191919"><main><h1 style="font-size:16px">Example Attendee</h1><p>A public LinkedIn post fixture.</p></main></body></html>' }));
    await page.route("https://linkedin.test/api/admin/symposium-linkedin", async route => {
      if (route.request().method() !== "POST") return route.fulfill({ json: snapshot });
      const input = route.request().postDataJSON(); assert.equal(input.version, snapshot.version);
      if (conflict) { conflict = false; snapshot = { ...snapshot, version: "2026-11-03T15:01:00.000Z" }; return route.fulfill({ status: 409, json: { conflict: true, snapshot } }); }
      snapshot = { board: changeLinkedinBoard(snapshot.board, LinkedinAction.parse(input.change), "Colleague", at), version: "2026-11-03T15:02:00.000Z" }; saves++;
      return route.fulfill({ json: { conflict: false, snapshot } });
    });
    await page.goto("https://linkedin.test/");
    const editor = page.getByRole("form", { name: "Reply draft" });
    await expect(editor.getByRole("textbox", { name: "Draft reply as BioHubNet" })).toHaveValue("Thank you for joining us!");
    const frame = page.locator('iframe[title="Original LinkedIn post"]');
    await expect(frame).toHaveAttribute("src", "https://www.linkedin.com/embed/feed/update/urn:li:activity:1");
    await expect(frame).toHaveAttribute("loading", "eager");
    await expect(page.frameLocator('iframe[title="Original LinkedIn post"]').getByRole("heading", { name: "Example Attendee" })).toBeVisible();
    assert.ok(await frame.evaluate(el => el.getBoundingClientRect().right) <= await editor.evaluate(el => el.getBoundingClientRect().left), "Original post sits beside its reply on desktop");
    await editor.getByRole("textbox", { name: "Draft reply as BioHubNet" }).fill("Draft retained across preview changes");
    await page.getByRole("button", { name: "Saved text", exact: true }).click();
    await expect(page.getByRole("region", { name: "LinkedIn source text", exact: true })).toContainText("A useful conversation");
    await expect(frame).toHaveCount(0);
    await page.getByRole("button", { name: "LinkedIn", exact: true }).click();
    await expect(editor.getByRole("textbox", { name: "Draft reply as BioHubNet" })).toHaveValue("Draft retained across preview changes");
    assert.ok(await page.getByRole("navigation", { name: "Interactions" }).getByRole("button").first().evaluate(el => el.getBoundingClientRect().height < 140), "Long posts must stay compact in the queue");
    await editor.getByRole("textbox", { name: "Draft reply as BioHubNet" }).fill("Thank you for sharing your perspective.");
    await page.getByRole("button", { name: /Second Attendee/ }).click();
    await expect(page.getByRole("alert")).toContainText("Save or discard");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert")).toContainText("draft is retained");
    await expect(editor.getByRole("textbox", { name: "Draft reply as BioHubNet" })).toHaveValue("Thank you for sharing your perspective.");
    await editor.getByRole("combobox", { name: "Status", exact: true }).selectOption("replied");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(editor.getByRole("button", { name: "Save changes" })).toBeDisabled(); assert.equal(saves, 1);
    await page.getByRole("combobox", { name: "Event", exact: true }).selectOption("training_week");
    await expect(page.getByRole("navigation", { name: "Interactions" }).getByRole("button")).toHaveCount(1);
    await page.getByRole("button", { name: /Second Attendee/ }).click();
    await expect(page.getByRole("heading", { name: "Second Attendee", exact: true })).toBeVisible();
    await mkdir("output/linkedin-20261103", { recursive: true });
    await page.screenshot({ path: "output/linkedin-20261103/desktop.png", fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator("body").evaluate(node => node.scrollWidth > window.innerWidth), false);
      assert.ok(await page.getByRole("navigation", { name: "Interactions" }).getByRole("button").first().evaluate(el => el.getBoundingClientRect().height < 140));
      assert.ok(await frame.evaluate(el => el.getBoundingClientRect().bottom) <= await editor.evaluate(el => el.getBoundingClientRect().top), "Post and reply stack on mobile");
    }
    await page.screenshot({ path: "output/linkedin-20261103/mobile.png", fullPage: true });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.getByRole("button", { name: "Saved text", exact: true }).click();
    const fallbackAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(fallbackAxe.violations.map(v => v.id), []);
    console.log("PASS: native original post beside reply, saved-text fallback without losing drafts, mobile stacking, save conflicts, status, filters and accessibility.");
  } finally { await browser.close(); }
}
void main();
