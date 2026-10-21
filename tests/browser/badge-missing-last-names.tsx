import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import { applyPrintAction, printPeople, type PrintBoard, type PrintIdentity } from "../../src/lib/events/print-jobs";

async function main() {
  let board: PrintBoard = {
    guests: [["echo", "Echo", "approved"], ["initial", "Sara H.", "approved"], ["complete", "Ada Lovelace", "approved"], ["resolved", "Alice", "approved"], ["reviewed", "Li", "approved"], ["pending", "Pending", "pending"]].map(([id, name, status]) => ({ id, name, status, email: id + "@example.org", organization: "University of Toronto", source: "luma" as const, tickets: 1, badgeRole: "" })),
    edits: { reviewed: { name: "Li", organization: "University of Toronto", extra: "", reviewed: true } },
    jobs: [], syncedAt: "2026-10-21T15:00:00Z", syncSource: "csv", tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null,
  };
  const identities: PrintIdentity[] = [{ fullName: "Alice Feng", email: "resolved@example.org", organization: "University of Toronto", title: "" }];
  let version = "2026-10-21T15:00:00.000Z", saves = 0;
  const snapshot = () => ({ board, version, people: printPeople(board, identities), autoSyncAvailable: false });
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SymposiumPrintJobs} from './src/components/admin/events/SymposiumPrintJobs';createRoot(document.getElementById('root')).render(<SymposiumPrintJobs/>);` }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env": "{}" } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", error => console.error("Browser error:", error.message));
    await page.route("https://print.test/", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>Symposium Print Jobs</title><style>:root{--fg:#172022;--card-solid:white;--muted:#526063;--line:#d6dddf;--brand:#176353;--elevated:#eef3f2}body{margin:0}main{padding:16px}${css.css}</style></head><body><main><h1>Print Jobs</h1><div id="root"></div></main><script src="/app.js"></script></body></html>` }));
    await page.route("https://print.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.route("https://print.test/api/admin/symposium-print", async route => {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        assert.equal(input.version, version); assert.equal(input.change.action, "edit"); assert.ok(["echo", "reviewed"].includes(input.change.id));
        board = applyPrintAction(board, printPeople(board, identities), input.change, "Admin", "00000000-0000-4000-8000-000000000001", "2026-10-21T15:01:00Z").board;
        saves++; version = `2026-10-21T15:0${saves}:00.000Z`;
      }
      await route.fulfill({ json: route.request().method() === "POST" ? { snapshot: snapshot() } : snapshot() });
    });
    await page.goto("https://print.test/");
    await expect(page.getByRole("button", { name: "Missing last names (3)", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Select Ada Lovelace", { exact: true }).check();
    await page.getByRole("button", { name: "Missing last names (3)", exact: true }).click();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Missing last names (3)", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("3 guests · 0 selected", { exact: true })).toBeVisible();
    for (const name of ["Echo", "Sara H.", "Li"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    assert.ok(!(await page.locator("tbody").innerText()).includes("Alice Feng"), "corrected source names are excluded");
    await page.getByRole("button", { name: "Select unprinted / changed", exact: true }).click();
    await expect(page.getByLabel("Select Li", { exact: true })).toBeChecked();
    await expect(page.getByText("3 guests · 1 selected", { exact: true })).toBeVisible();
    await page.getByLabel("Include pending and cancelled").check();
    await expect(rows).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Missing last names (4)", exact: true })).toBeVisible();
    await page.getByLabel("Include pending and cancelled").uncheck();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByLabel("Search badge guests").fill("Echo");
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: "Edit print name for Echo", exact: true }).click();
    await page.getByRole("textbox", { name: "Full name", exact: true }).fill("Echo Jing");
    await page.getByRole("textbox", { name: "Reason for name correction", exact: true }).fill("Attendee confirmed their surname");
    await page.getByRole("button", { name: "Save badge", exact: true }).click();
    await expect(rows).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Missing last names (2)", exact: true })).toBeVisible();
    assert.equal(saves, 1); assert.equal(board.guests[0].name, "Echo"); assert.equal(board.edits.echo.name, "Echo Jing");
    assert.equal(board.nameHistory?.[0].reason, "Attendee confirmed their surname");
    await page.getByLabel("Search badge guests").fill("");
    await page.getByRole("button", { name: "Edit print name for Li", exact: true }).click();
    await page.getByLabel("Confirmed single-name attendee", { exact: true }).check();
    await page.getByRole("button", { name: "Save badge", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Missing last names (1)", exact: true })).toBeVisible();
    assert.equal(board.edits.reviewed.singleName, true);
    assert.equal(board.guests.find(g => g.id === "reviewed")!.name, "Li");
    await mkdir("output", { recursive: true });
    await page.screenshot({ path: "output/badge-missing-last-names-desktop.png", fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator("body").evaluate(node => node.scrollWidth > window.innerWidth), false, `no page overflow at ${width}px`);
    }
    await page.screenshot({ path: "output/badge-missing-last-names-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Name badges", exact: true }).click();
    await expect(rows).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Echo Jing", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit print name for Li", exact: true }).click();
    await expect(page.getByLabel("Confirmed single-name attendee", { exact: true })).toBeChecked();
    console.log("PASS: missing-surname tab, confirmed single-name exclusion and persistence, counts, reviewed names, resolved names, status/search filters, visible selection, audited name edit, original preservation and responsive layouts");
  } finally { await browser.close(); }
}

void main();
