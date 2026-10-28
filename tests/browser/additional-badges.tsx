import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { applyPrintAction, printPeople, PrintActionSchema, type PrintBoard } from "../../src/lib/events/print-jobs";
import { buildPrintPdf } from "../../src/lib/events/print-pdf";

async function main() {
  let board: PrintBoard = { guests: [{ id: "existing", name: "Existing Guest", organization: "University of Toronto", email: "existing@example.org", status: "approved", tickets: 1, source: "luma", badgeRole: "" }], edits: {}, jobs: [], syncedAt: "2026-10-28T15:00:00.000Z", syncSource: "csv", tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null };
  const originalGuests = structuredClone(board.guests);
  let version = "2026-10-28T15:00:00.000Z", conflict = true, saves = 0;
  const id = "00000000-0000-4000-8000-000000000028";
  let pdf: Uint8Array | undefined;
  const snapshot = () => ({ board, people: printPeople(board), version, autoSyncAvailable: false });
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SymposiumPrintJobs}from'./src/components/admin/events/SymposiumPrintJobs';createRoot(document.getElementById('root')).render(<SymposiumPrintJobs/>);` }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env": "{}" }, plugins: [{ name: "next-server-action-fixture", setup(build) {
    build.onResolve({ filter: /@\/lib\/events\/print-requests$/ }, () => ({ path: "print-requests", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const printRequestDetails=async()=>({colleagues:[],requests:[]});export const requestPrint=async()=>{throw new Error('Email is not part of this fixture')};", loader: "js" }));
  } }] });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const failures: string[] = [];
    page.on("pageerror", e => failures.push(e.message));
    await page.route("https://print.test/?tab=additional", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>Additional badges</title><style>${css.css}body{margin:0;background:#f7f8f8;color:#172022}main{padding:20px}</style></head><body><main><h1>Print Jobs</h1><div id="root"></div></main><script src="/app.js"></script></body></html>` }));
    await page.route("https://print.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.route("https://print.test/print/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ body: await readFile(`public${pathname}`), contentType: pathname.endsWith(".png") ? "image/png" : "font/ttf" });
    });
    await page.route("https://print.test/api/admin/symposium-print", async route => {
      if (route.request().method() !== "POST") { await route.fulfill({ json: snapshot() }); return; }
      const input = route.request().postDataJSON();
      assert.equal(input.version, version);
      const action = PrintActionSchema.parse(input.change);
      assert.equal(action.action, "additional_badges");
      if (conflict) {
        conflict = false; version = "2026-10-28T15:01:00.000Z";
        await route.fulfill({ status: 409, json: { conflict: true, snapshot: snapshot() } }); return;
      }
      assert.ok(action.action === "additional_badges");
      const result = applyPrintAction(board, printPeople(board), action, "Colleague", id, version);
      board = result.board; saves++;
      pdf = await buildPrintPdf(result.job!, board);
      await writeFile("output/pdf/additional-badges-feature-proof.pdf", pdf);
      await route.fulfill({ json: { conflict: false, snapshot: snapshot(), jobId: id } });
    });
    await page.route(`https://print.test/api/admin/symposium-print/${id}/pdf**`, async route => route.fulfill({ contentType: "application/pdf", body: Buffer.from(pdf!) }));
    await mkdir("output/pdf", { recursive: true });
    await mkdir("output/additional-badges-feature", { recursive: true });
    await page.goto("https://print.test/?tab=additional");
    const form = page.getByRole("form", { name: "Additional badge printing" });
    await expect(page.getByRole("button", { name: "Additional badges", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(form.getByRole("button", { name: "Create print PDF" })).toBeDisabled();
    await form.getByRole("textbox", { name: "Full name", exact: true }).fill("Alex Chen");
    await form.getByRole("textbox", { name: "Position title", exact: true }).fill("Research Scientist");
    await form.getByRole("textbox", { name: "Organization", exact: true }).fill("UofT");
    await expect(form.locator("svg text").filter({ hasText: /^University of Toronto$/ })).toHaveCount(1);
    await form.getByRole("textbox", { name: "Additional line", exact: true }).fill("Volunteer");
    await form.getByLabel("Full name font size", { exact: true }).fill("32");
    await expect(form.getByRole("button", { name: "Create print PDF" })).toBeDisabled();
    await expect(form.getByRole("alert").first()).toContainText("too tall");
    await form.getByLabel("Full name font size", { exact: true }).fill("18");
    await form.getByLabel("Position title font size", { exact: true }).fill("10");
    await form.getByLabel("Organization font size", { exact: true }).fill("10");
    await form.getByLabel("Additional line font size", { exact: true }).fill("8");
    await expect(form.locator("svg text").filter({ hasText: /^Alex Chen$/ })).toHaveAttribute("font-size", "18");
    await expect(form.getByRole("button", { name: "Create print PDF" })).toBeEnabled();
    await form.getByRole("button", { name: "Add badge", exact: true }).click();
    await form.getByRole("textbox", { name: "Full name", exact: true }).fill("Second Attendee");
    await form.getByRole("textbox", { name: "Organization", exact: true }).fill("Mitacs");
    await form.getByRole("button", { name: "Add badge", exact: true }).click();
    await form.getByRole("button", { name: "Remove this badge" }).click();
    await form.getByRole("button", { name: "1. Alex Chen", exact: true }).click();
    await expect(form.getByLabel("Full name font size", { exact: true })).toHaveValue("18");
    await form.getByText("Print settings", { exact: true }).click();
    await form.getByLabel("Batch name", { exact: true }).fill("Additional badges - feature proof");
    await form.getByLabel("Start at sheet position").selectOption("5");
    await form.getByLabel("Horizontal offset (mm)", { exact: true }).fill("0.5");
    await form.getByLabel("Vertical offset (mm)", { exact: true }).fill("-0.5");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "output/additional-badges-feature/desktop.png", fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator("body").evaluate(node => node.scrollWidth > window.innerWidth), false, `Page overflows ${width}px`);
    }
    await page.screenshot({ path: "output/additional-badges-feature/mobile.png", fullPage: true });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), []);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await form.getByRole("button", { name: "Create print PDF" }).click();
    await expect(page.getByRole("alert").first()).toContainText("colleague changed");
    await expect(form.getByRole("textbox", { name: "Full name", exact: true })).toHaveValue("Alex Chen");
    await form.getByRole("button", { name: "Create print PDF" }).click();
    await expect(page.getByRole("heading", { name: "Additional badges - feature proof", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Print", exact: true })).toHaveAttribute("href", `/api/admin/symposium-print/${id}/pdf?view=1`);
    await expect(page.getByRole("link", { name: "Download PDF", exact: true })).toBeVisible();
    assert.equal(saves, 1);
    assert.deepEqual(board.guests, originalGuests);
    assert.deepEqual(board.edits, {});
    assert.equal(board.jobs[0].badges.length, 2);
    assert.deepEqual(board.jobs[0].badges[0].fontSizes, { name: 18, position: 10, organization: 10, extra: 8 });
    assert.equal(board.jobs[0].skip, 5);
    assert.equal(board.jobs[0].printedIds.length, 0);
    assert.deepEqual(failures, []);
    console.log("PASS: direct tab link, exact font preview, layout validation, multiple badge drafts, remove, partial-sheet offsets, conflict retry, immutable PDF queue, no guest changes, desktop/mobile, WCAG checks.");
  } finally { await browser.close(); }
}
void main();
