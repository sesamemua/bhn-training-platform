/**
 * Real-browser regression test for shieldShadowTyping.
 *
 * Reproduces the bug with a stand-in for the Vercel Toolbar: a window
 * capture-phase keydown listener, registered before anything else, that
 * swallows "c" unless the event target is editable. Then types real keys.
 *
 * Run: npx tsx tests/browser/script-editor-typing-shield.ts
 */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { shieldShadowTyping } from "../../src/lib/workspace/typing-shield";

const PAGE = `<!doctype html><meta charset="utf-8">
<body style="font:16px system-ui;padding:20px">
  <input id="outside" placeholder="outside">
  <div id="host" style="margin-top:16px;width:420px;min-height:120px;border:1px solid #ccc"></div>
  <script>
    // Stand-in for the toolbar: registered FIRST, capture phase, same check.
    window.addEventListener("keydown", (e) => {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) e.preventDefault();
    }, true);
    const host = document.getElementById("host");
    const shadow = host.attachShadow({ mode: "open" });
    const content = document.createElement("div");
    content.id = "content";
    content.contentEditable = "true";
    content.style.minHeight = "40px";
    // Mirrors the real editor: label spans are editable islands inside the
    // non-editable Gantt grid, which makes each its own editing host — so
    // focusing one really does move focus away from the document div.
    content.innerHTML = 'Start <div class="gantt" contenteditable="false">grid '
      + '<span id="label" contenteditable="true">label</span></div>';
    shadow.append(content);
    window.__shadow = shadow;
    window.__readOnly = false;
  </script>
</body>`;

const text = (page: import("@playwright/test").Page, sel: string) =>
  page.evaluate((s) => (window as unknown as { __shadow: ShadowRoot }).__shadow.querySelector(s)!.textContent, sel);
const hostFlag = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.getElementById("host")!.getAttribute("contenteditable"));
const clickEnd = (page: import("@playwright/test").Page, sel: string) =>
  page.evaluate((s) => {
    const shadow = (window as unknown as { __shadow: ShadowRoot }).__shadow;
    const el = shadow.querySelector(s) as HTMLElement;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el.firstChild ?? el);
    r.collapse(false);
    const sel = (shadow as unknown as { getSelection?: () => Selection }).getSelection?.() ?? window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  }, sel);

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE);

    // 1. Control — without the shield the stand-in eats "c". If this ever
    //    passes through, the test is no longer reproducing the bug.
    // Counted, not positioned: clickEnd lands after the first text node, so
    // exact strings depend on caret placement rather than on the bug.
    const cs = (t: string | null) => (t ?? "").split("c").length - 1;
    const before = cs(await text(page, "#content"));
    await clickEnd(page, "#content");
    await page.keyboard.type("abc");
    const control = (await text(page, "#content"))!;
    assert.ok(control.includes("ab"), "control: 'a' and 'b' should type");
    assert.equal(cs(control), before, "control: 'c' should be swallowed without the shield");

    // Install the real helper, exactly as the editor does.
    // tsx compiles with keepNames, wrapping functions in an __name() helper
    // that only exists in Node. Shim it so the page runs the exact compiled
    // helper rather than a hand-copied version that could drift.
    await page.evaluate(`var __name = globalThis.__name || ((f) => f);
      (${shieldShadowTyping.toString()})(
      document.getElementById("host"), window.__shadow, () => !window.__readOnly)`);

    // 2. Typing in the editor keeps every "c".
    await page.locator("#outside").click();
    await clickEnd(page, "#content");
    const beforeShield = cs(await text(page, "#content"));
    await page.keyboard.type(" cc");
    assert.equal(cs(await text(page, "#content")), beforeShield + 2, "shielded editor should receive both 'c's");
    assert.equal(await hostFlag(page), "true", "host flagged while focus is inside");

    // 3. Opt-out descendants stay non-editable while the host is flagged.
    const gridEditable = await page.evaluate(() =>
      ((window as unknown as { __shadow: ShadowRoot }).__shadow.querySelector(".gantt") as HTMLElement).isContentEditable);
    assert.equal(gridEditable, false, "contenteditable=false grid must stay non-editable");

    // 4. Moving to another editable element inside the shadow keeps focus there.
    await clickEnd(page, "#label");
    await page.keyboard.type("c");
    assert.equal(await text(page, "#label"), "labelc", "nested editable span receives 'c'");
    const stillInside = await page.evaluate(() =>
      (window as unknown as { __shadow: ShadowRoot }).__shadow.activeElement?.id);
    assert.equal(stillInside, "label", "focus stays on the span it moved to");
    assert.equal(await hostFlag(page), "true", "host still flagged after an inner focus move");

    // 5. Leaving the editor clears the flag and doesn't disturb the next field.
    await page.locator("#outside").click();
    await page.keyboard.type("c");
    assert.equal(await page.locator("#outside").inputValue(), "c", "outside input receives typing normally");
    await page.waitForTimeout(20);
    assert.equal(await hostFlag(page), null, "host flag removed once focus has left");

    // 6. Read-only: the host is never flagged.
    await page.evaluate(() => { (window as unknown as { __readOnly: boolean }).__readOnly = true; });
    await clickEnd(page, "#content");
    assert.equal(await hostFlag(page), null, "read-only editor never flags the host");

    console.log("✓ script editor typing shield: 6 checks passed");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
