import assert from "node:assert/strict";
import { chromium, expect, type Page } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
import { editReviewHtml, htmlRevision, type TextEdit } from "../../src/lib/page-review/edit-html";
import { editReviewImages, reviewImages, type ImageEdit } from "../../src/lib/page-review/edit-images";

interface FixtureComment { anchorKey: string; round: number; [key: string]: unknown }
interface FixtureDocumentWrite { expectedRound: number; revision: string; edits: TextEdit[]; images: ImageEdit[] }

const endpoint = "https://review.test/api/public/page-review/newsletter-element-fixture";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
const initialParagraph = "Build sector knowledge through learning pathways with CASTL and BioZone. Apply for these upcoming cohorts and connect with our training partners.";
const initialListItem = "Master’s and PhD students: $25,000 in funding.";
const picture = "https://images.test/original.png";
const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360"><rect width="720" height="360" fill="#d7e7e8"/><rect x="20" y="20" width="680" height="190" fill="#176879"/><circle cx="360" cy="70" r="22" fill="#edd7a0"/><path d="M330 185v-75h60v75" fill="#123949"/><text x="40" y="55" font-size="20" fill="white">BioHubNet Symposium — fixture</text><g fill="#526f7a"><circle cx="100" cy="270" r="28"/><circle cx="230" cy="275" r="28"/><circle cx="370" cy="280" r="28"/><circle cx="510" cy="275" r="28"/><circle cx="640" cy="270" r="28"/></g></svg>`;

async function main() {
  const browser = await chromium.launch();
  let currentPage: Page | undefined;
  let round = 4, assetCounter = 0;
  let sourceHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter element actions fixture</title><style>*{box-sizing:border-box}body{margin:16px;background:#edf3f4;font:16px/1.65 Arial}main{max-width:680px;width:100%;background:white;padding:24px}h1,h2{color:#0b3558;line-height:1.2}h1{font-size:27px}h2{font-size:22px}a{color:#176879}.cta{display:inline-block;background:#176879;color:#fff;text-decoration:none;border-radius:7px;padding:12px 20px}img{display:block;max-width:100%;height:auto}section{margin-bottom:32px}li{margin-bottom:12px}</style></head><body><main>
    <h1>November 2026 newsletter</h1>
    <section><h2>Launching QA/QC and R&amp;D Learning Pathways</h2>
      <p id="learning" data-nl-piece="learning" data-nl-part="Body">Build sector knowledge through learning pathways with <a href="https://destinations.test/castl">CASTL</a> and <a href="https://destinations.test/biozone">BioZone</a>. Apply for these upcoming cohorts and connect with our training partners.</p>
      <p id="learning-cta" data-nl-piece="learning" data-nl-part="CTA"><a class="cta" href="https://destinations.test/apply">Learn More &amp; Apply →</a></p>
    </section>
    <section><h2>Funding support</h2><ul><li id="funding" data-nl-piece="funding" data-nl-part="Body">Master’s and PhD students: <strong>$25,000</strong> in funding.</li></ul></section>
    <section><h2>Symposium recap</h2><p data-nl-piece="recap" data-nl-part="Picture 1"><a href="https://destinations.test/report"><img id="story-picture" data-nl-image="story-photo" src="${picture}" alt="Chris on stage with the audience in the foreground" width="620" height="310" style="width:100%;height:auto"></a></p></section>
    </main></body></html>`;
  const comments: FixtureComment[] = [], documentWrites: FixtureDocumentWrite[] = [], imageRequests: string[] = [], pageErrors: string[] = [];
  const body = () => sourceHtml.replace("</body>", `<script data-viewer="fixture-staff" data-round="${round}">${overlaySource(endpoint, "November newsletter", true, null, "report", { contextualHtml: true })}</script></body>`);
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, hasTouch: true });
    await context.route("https://images.test/**", route => route.fulfill({ contentType: "image/svg+xml", body: imageSvg, headers }));
    await context.route("https://destinations.test/**", route => route.fulfill({ contentType: "text/html", body: "<p>Fixture destination opened explicitly.</p>" }));
    await context.route("https://newsletter.test/**", route => route.fulfill({ contentType: "text/html", headers: { "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups" }, body: body() }));
    await context.route(endpoint + "**", async route => {
      const request = route.request(), method = request.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const isDocument = request.url().includes("/document");
      if (isDocument && method === "GET") return route.fulfill({ headers, json: { ok: true, editable: true, round, revision: htmlRevision(sourceHtml), issueRevision: "2026-11-26T12:00:00.000Z", images: reviewImages(sourceHtml).map(image => ({ ...image, assetId: "asset-original" })) } });
      if (isDocument && method === "POST") {
        imageRequests.push(request.postData() || "");
        assetCounter += 1;
        return route.fulfill({ headers, json: { ok: true, asset: { id: `asset-${assetCounter}`, url: `https://images.test/asset-${assetCounter}.png`, alt: "", width: 720, height: 360 } } });
      }
      if (isDocument && method === "PATCH") {
        const input = request.postDataJSON() as FixtureDocumentWrite;
        assert.equal(input.expectedRound, round);
        assert.equal(input.revision, htmlRevision(sourceHtml));
        documentWrites.push(input);
        sourceHtml = editReviewHtml(sourceHtml, input.edits || []);
        sourceHtml = editReviewImages(sourceHtml, (input.images || []).map(image => ({ ...image, url: `https://images.test/${image.assetId}.png` }))).html;
        round += 1;
        return route.fulfill({ headers, json: { ok: true, round } });
      }
      if (method === "POST") {
        const input = request.postDataJSON() as { anchorKey: string; body: string };
        const comment = { ...input, id: `comment-${comments.length + 1}`, parentId: null, round, status: "open", authorName: "Staff reviewer", createdAt: new Date().toISOString(), isMine: true };
        comments.push(comment);
        return route.fulfill({ headers, json: { ok: true, comment } });
      }
      return route.fulfill({ headers, json: { ok: true, review: { title: "November newsletter", round, status: "open" }, viewer: { id: "staff", name: "Staff reviewer" }, comments } });
    });
    const page = await context.newPage();
    currentPage = page;
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("https://newsletter.test/");
    await expect(page.getByRole("button", { name: "Save revision", exact: true })).toBeVisible();
    assert.equal(await page.locator('[contenteditable="plaintext-only"]').count(), 0, "inline text nodes must not become separate editors");
    const originalParagraphMarkup = await page.locator("#learning").innerHTML();
    const originalListMarkup = await page.locator("#funding").innerHTML();
    const originalImageMarkup = await page.locator("#story-picture").evaluate(image => image.outerHTML);
    const paragraphActions = page.getByRole("group", { name: "Paragraph actions" });
    await page.locator("#learning").click({ position: { x: 42, y: 10 } });
    const direct = page.locator("[data-bhn-rv-inline-text]");
    await expect(direct).toBeFocused();
    assert.ok(await direct.evaluate(el => {
      const selection = el.ownerDocument.getSelection()!;
      const offset = selection.anchorOffset;
      return el.contains(selection.anchorNode) && offset > 0 && offset < (selection.anchorNode?.textContent?.length || 0);
    }), "click positions the caret in the clicked line");
    await expect(paragraphActions.getByRole("button", { name: "More text tools" })).toBeVisible();
    await paragraphActions.getByRole("button", { name: "Comment on element" }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(direct).toHaveCount(0);
    await page.locator("#learning a").first().click();
    await expect(page.getByRole("menu", { name: "Review element actions" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Open link", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Comment on element", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Edit text", exact: true })).toBeEnabled();
    assert.equal(page.url(), "https://newsletter.test/");
    assert.equal(context.pages().length, 1, "clicking an inline link must not open a destination");
    await page.screenshot({ path: "/private/tmp/newsletter-review-interactions-link-menu.png", fullPage: true });
    await page.getByRole("menuitem", { name: "Edit text", exact: true }).click();
    const paragraphEditor = page.getByRole("textbox", { name: "Text for this paragraph", exact: true });
    await expect(paragraphEditor).toHaveValue(initialParagraph);
    assert.equal(await page.getByRole("dialog").locator("textarea").count(), 1);
    await paragraphEditor.fill(initialParagraph.replace("upcoming cohorts", "next cohorts"));
    await page.getByRole("button", { name: "Apply changes", exact: true }).click();
    await expect(page.locator("#learning")).toHaveText(initialParagraph.replace("upcoming cohorts", "next cohorts"));
    await expect(page.locator("#learning a").first()).toHaveAttribute("href", "https://destinations.test/castl");
    await expect(page.locator("#learning a").nth(1)).toHaveAttribute("href", "https://destinations.test/biozone");
    await expect(page.getByRole("button", { name: "Save revision", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Discard edits", exact: true }).click();
    assert.equal(await page.locator("#learning").innerHTML(), originalParagraphMarkup);
    assert.equal(documentWrites.length, 0);

    await page.locator("#funding strong").click();
    await page.getByRole("menuitem", { name: "Edit text", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit list item", exact: true })).toBeVisible();
    const listEditor = page.getByRole("textbox", { name: "Text for this list item", exact: true });
    await expect(listEditor).toHaveValue(initialListItem);
    await listEditor.fill(initialListItem.replace("$25,000", "$30,000"));
    await page.getByRole("button", { name: "Apply changes", exact: true }).click();
    await expect(page.locator("#funding strong")).toHaveText("$30,000");
    await page.getByRole("button", { name: "Discard edits", exact: true }).click();
    assert.equal(await page.locator("#funding").innerHTML(), originalListMarkup);

    await page.locator("#learning-cta a").click();
    assert.equal(context.pages().length, 1, "a CTA click opens the review menu, not a link");
    const destinationPromise = context.waitForEvent("page");
    await page.getByRole("menuitem", { name: "Open link", exact: true }).click();
    const destination = await destinationPromise;
    await destination.waitForLoadState();
    assert.equal(destination.url(), "https://destinations.test/apply");
    await destination.close();
    assert.equal(page.url(), "https://newsletter.test/");

    await page.locator("#story-picture").click();
    await page.getByRole("menuitem", { name: "Comment on element", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toBeVisible();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Please keep the speaker and audience visible.");
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.getByText("Please keep the speaker and audience visible.", { exact: true })).toBeVisible();
    assert.match(comments[0].anchorKey, /IMG/);
    assert.match(comments[0].anchorKey, /story-photo/);
    assert.equal(comments[0].round, 4);

    await page.locator("#story-picture").click();
    await page.getByRole("menuitem", { name: "Replace or edit picture", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit picture", exact: true })).toBeVisible();
    await expect(page.getByLabel("Replace picture from your device", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rotate right", exact: true })).toBeEnabled();
    await page.getByLabel("Alternative text", { exact: true }).fill("Speaker and audience at the BioHubNet symposium");
    await page.getByLabel("Width (% of content column)", { exact: true }).fill("75");
    await page.getByLabel("Alignment", { exact: true }).selectOption("center");
    await page.getByLabel("Left", { exact: true }).fill("10");
    await page.getByLabel("Width", { exact: true }).fill("80");
    await page.getByRole("button", { name: "Rotate right", exact: true }).click();
    await page.screenshot({ path: "/private/tmp/newsletter-review-interactions-picture-desktop.png" });
    await page.getByRole("button", { name: "Apply changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.equal(imageRequests.length, 1);
    assert.match(imageRequests[0], /asset-original/);
    assert.match(imageRequests[0], /"rotate":90/);
    assert.match(imageRequests[0], /"left":0.1/);
    await expect(page.locator("#story-picture")).toHaveAttribute("src", "https://images.test/asset-1.png");
    await expect(page.locator("#story-picture")).toHaveAttribute("width", "75%");
    await expect(page.locator("#story-picture").locator("..")).toHaveAttribute("href", "https://destinations.test/report");

    await page.locator("#learning").click({ position: { x: 15, y: 10 } });
    // Use the native editing selection without replacing the underlying linked markup.
    await direct.evaluate(el => {
      const text = Array.from(el.childNodes).find(n => n.textContent?.includes("upcoming cohorts"))!;
      const start = text.textContent!.indexOf("upcoming cohorts");
      const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + "upcoming cohorts".length);
      const selected = window.getSelection()!; selected.removeAllRanges(); selected.addRange(range);
    });
    await page.keyboard.insertText("next cohorts");
    await paragraphActions.getByRole("button", { name: "More text tools" }).click();
    await expect(paragraphEditor).toHaveValue(initialParagraph.replace("upcoming cohorts", "next cohorts"));
    await paragraphEditor.evaluate(el => {
      const field = el as HTMLTextAreaElement, start = field.value.indexOf("next cohorts");
      field.setSelectionRange(start, start + "next cohorts".length);
    });
    const format = page.getByRole("group", { name: "Text formatting" });
    await expect(format.getByRole("button")).toHaveText(["Bold", "Italic"]);
    await format.getByRole("button", { name: "Bold" }).click();
    await format.getByRole("button", { name: "Italic" }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(documentWrites.length, 0, "text does not autosave pending picture edits");
    await page.getByRole("button", { name: "Save revision", exact: true }).click();
    await expect.poll(() => documentWrites.length).toBe(1);
    await expect(page.getByRole("button", { name: "Save revision", exact: true })).toBeDisabled();
    await expect(page.locator("#learning")).toHaveText(initialParagraph.replace("upcoming cohorts", "next cohorts"));
    assert.equal(documentWrites[0].expectedRound, 4);
    assert.equal(documentWrites[0].edits.length, 1);
    assert.equal(documentWrites[0].edits[0].marks?.length, 2);
    await expect(page.locator("#learning strong em")).toHaveText("next cohorts");
    await expect(page.locator("#learning a").first()).toHaveAttribute("href", "https://destinations.test/castl");
    assert.equal(documentWrites[0].images.length, 1);
    assert.equal(documentWrites[0].images[0].assetId, "asset-1");
    assert.equal(round, 5);
    assert.equal(comments.length, 1, "saving preserves the previous round's comments");
    assert.notEqual(await page.locator("#story-picture").evaluate(image => image.outerHTML), originalImageMarkup);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Collapse comments", exact: true }).click();
    await page.locator("#story-picture").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "Review element actions" })).toBeVisible();
    const menuBounds = await page.getByRole("menu").boundingBox();
    assert.ok(menuBounds && menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 390);
    await page.getByRole("menuitem", { name: "Replace or edit picture", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit picture", exact: true });
    await expect(dialog).toBeVisible();
    const dimensions = await dialog.evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, top: node.getBoundingClientRect().top, right: node.getBoundingClientRect().right, bottom: node.getBoundingClientRect().bottom }));
    assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `image dialog must not overflow horizontally: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.top >= 0 && dimensions.right <= 390 && dimensions.bottom <= 844);
    await page.screenshot({ path: "/private/tmp/newsletter-review-interactions-picture-mobile.png" });
    await dialog.getByRole("button", { name: "Apply changes", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close edit picture", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#story-picture")).toBeFocused();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("#story-picture").focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: "Replace or edit picture", exact: true }).click();
      const responsiveDialog = page.getByRole("dialog", { name: "Edit picture", exact: true });
      const box = await responsiveDialog.evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, right: node.getBoundingClientRect().right }));
      assert.ok(box.scrollWidth <= box.width + 1 && box.right <= width, `dialog overflow at ${width}px: ${JSON.stringify(box)}`);
      await responsiveDialog.getByRole("button", { name: "Apply changes", exact: true }).focus();
      const applyBounds = await responsiveDialog.getByRole("button", { name: "Apply changes", exact: true }).boundingBox();
      assert.ok(applyBounds && applyBounds.x >= 0 && applyBounds.x + applyBounds.width <= width && applyBounds.y + applyBounds.height <= 900);
      if (width === 320) await page.screenshot({ path: "/private/tmp/newsletter-review-interactions-picture-mobile-controls.png" });
      await page.keyboard.press("Escape");
      await expect(page.locator("#story-picture")).toBeFocused();
    }
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("#learning").focus();
      await page.keyboard.press("F2");
      await expect(direct).toBeFocused();
      await expect(paragraphActions).toBeVisible();
      const bounds = await paragraphActions.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900);
      await direct.press("Escape");
      await expect(page.locator("#learning")).toBeFocused();
    }
    assert.equal(documentWrites.length, 1, "opening or cancelling controls creates no revision");
    await page.setViewportSize({ width: 1360, height: 1000 });
    await page.locator("#learning").click({ position: { x: 15, y: 10 } });
    await expect(direct).toBeFocused();
    await page.keyboard.insertText("Quick ");
    await page.locator("h1").click();
    await expect.poll(() => documentWrites.length).toBe(2);
    assert.equal(documentWrites[1].expectedRound, 5);
    assert.deepEqual(documentWrites[1].images, []);
    assert.equal(comments.length, 1, "autosave preserves historical comments too");
    assert.deepEqual(pageErrors, []);
    console.log("PASS: semantic paragraph/list-item edits, explicit link actions, image comments and crop controls, batch save, preserved links/round comments, mobile bounds and keyboard focus.");
  } catch (error) {
    if (currentPage) await currentPage.screenshot({ path: "/private/tmp/newsletter-review-interactions-failure.png", fullPage: true }).catch(() => undefined);
    throw error;
  } finally { await browser.close(); }
}

void main();
