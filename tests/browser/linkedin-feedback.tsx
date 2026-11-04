import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import JSZip from "jszip";
import sharp from "sharp";
import { changeLinkedinBoard, LinkedinAction, LinkedinInput, publicLinkedinTestimonials, type LinkedinSnapshot } from "../../src/lib/events/linkedin";

async function main() {
  const at = "2026-11-04T18:00:00.000Z";
  let snapshot: LinkedinSnapshot = { board: changeLinkedinBoard({ entries: [], checkedAt: null, coverage: "Internal coverage" }, { action: "add", entry: LinkedinInput.parse({ author: "Example Attendee", sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123", kind: "mention", topic: "symposium", sourceText: "A useful conversation about life sciences careers.", reply: "Private draft", status: "pending" }) }, "Admin", at), version: at };
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'./src/components/ui/ThemeProvider';import{SymposiumLinkedin}from'./src/components/admin/events/SymposiumLinkedin';import{LinkedinFeedback}from'./src/components/events/LinkedinFeedback';createRoot(document.getElementById('root')).render(<ThemeProvider>{location.pathname==='/admin'?<SymposiumLinkedin/>:<LinkedinFeedback quotes={window.quotes}/>}</ThemeProvider>);" }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env": "{}" } });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: "light", permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await page.route("https://feedback.test/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/app.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
      if (path === "/geist.woff2") return route.fulfill({ contentType: "font/woff2", body: await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2") });
      if (path === "/biohubnet-logo.png") return route.fulfill({ contentType: "image/png", body: await readFile("public/biohubnet-logo.png") });
      if (path === "/feedback/2026/example.jpg") return route.fulfill({ contentType: "image/png", body: await readFile("public/biohubnet-logo.png") });
      if (path === "/api/admin/symposium-linkedin") {
        if (route.request().method() !== "POST") return route.fulfill({ json: snapshot });
        const input = route.request().postDataJSON(); assert.equal(input.version, snapshot.version);
        snapshot = { board: changeLinkedinBoard(snapshot.board, LinkedinAction.parse(input.change), "Curator", at), version: new Date(new Date(snapshot.version!).getTime() + 1).toISOString() };
        return route.fulfill({ json: { conflict: false, snapshot } });
      }
      return route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>BioHubNet feedback</title><style>@font-face{font-family:FeedbackTest;src:url(/geist.woff2);font-weight:100 900}:root{--font-geist-sans:FeedbackTest}${css.css}body{margin:0}#root{min-width:0}</style></head><body><div id="root"></div><script>window.quotes=${JSON.stringify(publicLinkedinTestimonials(snapshot.board)).replace(/</g, "\\u003c")}</script><script src="/app.js"></script></body></html>` });
    });
    await page.route("https://www.linkedin.com/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>Original post</body></html>" }));
    await page.goto("https://feedback.test/admin");
    const quote = page.getByRole("textbox", { name: "Public quote" });
    await quote.fill("Rewritten praise");
    await expect(page.getByRole("button", { name: "Show on public page" })).toBeDisabled();
    await quote.fill("A useful conversation about life sciences careers.");
    await page.getByRole("textbox", { name: "Title / role", exact: true }).fill("Research associate");
    await page.getByRole("textbox", { name: "Affiliation", exact: true }).fill("Example University");
    await page.getByRole("textbox", { name: "Headshot or logo URL", exact: true }).fill("javascript:alert(1)");
    await expect(page.getByRole("button", { name: "Show on public page" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Headshot or logo URL", exact: true }).fill("/feedback/2026/example.jpg");
    await page.getByRole("textbox", { name: "Post picture URLs", exact: true }).fill("/api/admin/private");
    await expect(page.getByRole("button", { name: "Show on public page" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Post picture URLs", exact: true }).fill("/feedback/2026/example.jpg");
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
    await expect(page.getByText("Research associate", { exact: true })).toBeVisible();
    await expect(page.getByText("Example University", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Example Attendee profile image" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Picture 1 from Example Attendee's LinkedIn post", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Read original post", exact: true })).toHaveAttribute("href", snapshot.board.entries[0].sourceUrl);
    assert.ok(!await page.locator("body").innerText().then(text => /Private draft|Internal coverage|Curator/.test(text)));
    await page.getByRole("button", { name: "Copy all text" }).click();
    await expect(page.getByRole("button", { name: "Copied for Word" })).toBeVisible();
    const clipboard = await page.evaluate(async () => { const items = await navigator.clipboard.read(); return { html: await (await items[0].getType("text/html")).text(), text: await (await items[0].getType("text/plain")).text() }; });
    assert.ok(clipboard.html.includes("<blockquote>")); assert.ok(clipboard.html.includes("Original LinkedIn post")); assert.ok(clipboard.text.includes("Example Attendee"));
    assert.ok(clipboard.text.includes("Research associate\nExample University"));
    assert.ok(clipboard.text.includes("https://bhn-training-platform.vercel.app/events/2026-annual-symposium/feedback"));
    await mkdir("output/linkedin-feedback", { recursive: true });
    await page.getByRole("button", { name: "Copy card for Word" }).click();
    await expect(page.getByRole("button", { name: "Copied for Word" })).toHaveCount(2);
    const visual = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const png = await item.getType("image/png");
      return { png: Array.from(new Uint8Array(await png.arrayBuffer())), html: await (await item.getType("text/html")).text() };
    });
    assert.ok(visual.html.includes('src="data:image/png;base64,'));
    assert.ok(visual.html.includes("https://bhn-training-platform.vercel.app/events/2026-annual-symposium/feedback"));
    await writeFile("output/linkedin-feedback/copied-card.png", Buffer.from(visual.png));
    const pixels = await sharp(Buffer.from(visual.png)).stats();
    assert.ok(pixels.channels.some(channel => channel.stdev > 20), "Card contains painted text and photo, not a blank bitmap");
    const cardBox = (await page.getByRole("article").boundingBox())!, textBox = (await page.getByRole("blockquote").boundingBox())!;
    const reference = await page.getByRole("blockquote").screenshot({ scale: "css" });
    const referenceMeta = await sharp(reference).metadata();
    const exportedText = await sharp(Buffer.from(visual.png)).extract({ left: Math.round((textBox.x - cardBox.x) * 2), top: Math.round((textBox.y - cardBox.y) * 2), width: Math.round(textBox.width * 2), height: Math.round(textBox.height * 2) }).resize(referenceMeta.width!, referenceMeta.height!).removeAlpha().raw().toBuffer();
    const nativeText = await sharp(reference).removeAlpha().raw().toBuffer();
    await writeFile("output/linkedin-feedback/spacing-native.png", reference);
    await writeFile("output/linkedin-feedback/spacing-export.png", await sharp(exportedText, { raw: { width: referenceMeta.width!, height: referenceMeta.height!, channels: 3 } }).png().toBuffer());
    function wordGaps(data: Buffer) {
      const runs: { start: number; end: number }[] = []; let start = -1, last = -1;
      for (let x = 0; x < referenceMeta.width!; x++) {
        let ink = false;
        for (let y = 0; y < referenceMeta.height!; y++) if (data[(y * referenceMeta.width! + x) * 3] < 130) ink = true;
        if (ink) { if (start < 0) start = x; last = x; }
        else if (start >= 0 && x - last >= 5) { runs.push({ start, end: last + 1 }); start = -1; }
      }
      return runs.slice(1).map((run, i) => run.start - runs[i].end);
    }
    const nativeGaps = wordGaps(nativeText), exportGaps = wordGaps(exportedText);
    assert.equal(nativeGaps.length, 6);
    assert.equal(exportGaps.length, nativeGaps.length);
    assert.ok(exportGaps.every((gap, i) => Math.abs(gap - nativeGaps[i]) <= 1), "Word spaces match browser-rendered text within antialiasing tolerance");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Word" }).click();
    const path = await (await download).path(); assert.ok(path);
    await writeFile("output/linkedin-feedback/fixture.docx", await readFile(path));
    const zip = await JSZip.loadAsync(await readFile(path));
    assert.equal(Object.keys(zip.files).filter(name => /^word\/media\/.+\.png$/.test(name)).length, 1);
    const relations = await zip.file("word/_rels/document.xml.rels")!.async("text");
    assert.ok(relations.includes(snapshot.board.entries[0].sourceUrl));
    assert.ok(relations.includes("https://bhn-training-platform.vercel.app/events/2026-annual-symposium/feedback"));
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await mkdir("output/linkedin-feedback", { recursive: true });
    await page.screenshot({ path: "output/linkedin-feedback/desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Switch to dark appearance" }).click();
    await expect(page.locator("main[data-theme]")).toHaveAttribute("data-theme", "hitech");
    await page.getByRole("article").getByRole("button", { name: "Copied for Word" }).click();
    await expect(page.getByRole("article").getByRole("button", { name: "Copied for Word" })).toBeEnabled();
    const darkPng = await page.evaluate(async () => Array.from(new Uint8Array(await (await (await navigator.clipboard.read())[0].getType("image/png")).arrayBuffer())));
    const darkPixels = await sharp(Buffer.from(darkPng)).extract({ left: 30, top: 30, width: 10, height: 10 }).stats();
    const lightBackground = await sharp(Buffer.from(visual.png)).extract({ left: 30, top: 30, width: 10, height: 10 }).stats();
    await writeFile("output/linkedin-feedback/copied-card-dark.png", Buffer.from(darkPng));
    assert.ok(darkPixels.channels[0].mean < lightBackground.channels[0].mean - 50, "Export follows the active dark appearance without changing the pictures");
    const darkAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(darkAxe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.screenshot({ path: "output/linkedin-feedback/dark.png", fullPage: true });
    await page.reload();
    await expect(page.locator("main[data-theme]")).toHaveAttribute("data-theme", "hitech");
    await page.getByRole("button", { name: "Switch to light appearance" }).click();
    await expect(page.locator("main[data-theme]")).toHaveAttribute("data-theme", "light");
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false); }
    await page.screenshot({ path: "output/linkedin-feedback/mobile.png", fullPage: true });
    const original = snapshot;
    const second = LinkedinInput.parse({ author: "Second attendee", kind: "comment", topic: "training_week", sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:456?dashCommentUrn=second", sourceText: "Another valuable connection.", reply: "Private second draft" });
    let multi = changeLinkedinBoard(snapshot.board, { action: "add", entry: second }, "Admin", at);
    multi = changeLinkedinBoard(multi, { action: "testimonial", id: multi.entries.find(entry => entry.sourceUrl === second.sourceUrl)!.id, quote: second.sourceText, publish: true, profile: { title: "Researcher", affiliation: "Second University", photoUrl: "/feedback/2026/example.jpg", profileUrl: "" } }, "Admin", new Date(new Date(at).getTime() + 1).toISOString());
    snapshot = { ...snapshot, board: multi };
    await page.goto("https://feedback.test/public");
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.getByRole("button", { name: "Copy all cards for Word", exact: true }).click();
    await expect(page.getByRole("button", { name: "All cards copied", exact: true })).toBeEnabled();
    const allCards = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return { html: await (await item.getType("text/html")).text(), text: await (await item.getType("text/plain")).text() };
    });
    assert.equal((allCards.html.match(/<img /g) ?? []).length, 2, "Each card remains a separate image, not one enormous image");
    for (const source of [second.sourceUrl, original.board.entries[0].sourceUrl]) assert.ok(allCards.html.includes(source));
    assert.ok(allCards.html.includes("https://bhn-training-platform.vercel.app/events/2026-annual-symposium/feedback"));
    assert.ok(allCards.text.includes("Second attendee") && allCards.text.includes("Example Attendee"));
    assert.ok(!allCards.text.includes("Private second draft"));
    assert.ok(allCards.text.indexOf("Second attendee") < allCards.text.indexOf("Example Attendee"), "Copies cards in displayed order");
    await page.route("https://feedback.test/feedback/2026/example.jpg", route => route.fulfill({ status: 404, body: "Unavailable" }));
    await page.reload();
    await page.getByRole("button", { name: "Copy all cards for Word", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Card copy failed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "All cards copied", exact: true })).toHaveCount(0);
    snapshot = original;
    await page.goto("https://feedback.test/admin");
    await page.getByRole("button", { name: "Remove from public page" }).click();
    await expect(page.getByText("0 published quotes")).toBeVisible();
    await page.goto("https://feedback.test/public");
    await expect(page.getByText("Community reflections will appear here soon.")).toBeVisible();
    console.log("PASS: curated publication/removal, draft preservation, public privacy, rich Word clipboard, responsive layout and accessibility.");
  } finally { await browser.close(); }
}
void main();
