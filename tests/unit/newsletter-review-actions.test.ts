import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
const { JSDOM, VirtualConsole } = createRequire(import.meta.url)("jsdom");

async function fixture(editable = true, contextualHtml = true) {
  const errors: Error[] = [], requests: { method: string; body: string }[] = [], opened: unknown[][] = [];
  const console = new VirtualConsole(); console.on("jsdomError", (error: Error) => errors.push(error));
  const dom = new JSDOM(`<!doctype html><html><head><title>Newsletter</title></head><body>
    <h2>Training highlights</h2><p id="training">Build practical skills with <a href="https://castl.example"><strong>CASTL</strong></a> and <a href="https://biozone.example">BioZone</a> this fall.</p>
    <ul><li id="funding">Master’s and PhD trainees receive <strong>$25,000</strong>.</li></ul>
    <p id="plain">A plain paragraph.</p>
    <a href="https://event.example"><img id="graphic" alt="Event invitation" src="https://images.example/event.png"></a>
    <p><a id="unsafe" href="javascript:alert(1)">Unsafe URL</a></p></body></html>`, {
    url: "https://review.test/review-paste/token", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: console,
  });
  const { window } = dom, doc: Document = window.document;
  const script = doc.createElement("script"); script.dataset.round = "1"; script.dataset.viewer = "signed-staff";
  Object.defineProperty(doc, "currentScript", { configurable: true, value: script });
  window.open = (...args: unknown[]) => { opened.push(args); return null; };
  window.fetch = async (url: string, options: { method?: string; body?: string } = {}) => {
    if (options.method === "PATCH") { requests.push({ method: "PATCH", body: options.body || "" }); return { ok: false, json: async () => ({ error: "Simulated conflict: your edits remain available." }) }; }
    const data = url.endsWith("/document")
      ? { ok: true, editable, round: 1, revision: "a".repeat(64), issueRevision: "2026-11-26T12:00:00.000Z", images: [{ index: 0, assetId: "asset-event" }] }
      : { ok: true, review: { title: "November newsletter", round: 1, status: "open" }, comments: [], viewer: { name: "Editor", kind: "user", role: "instructor" } };
    return { ok: true, json: async () => data };
  };
  window.eval(overlaySource("https://review.test/api/public/page-review/token", "Newsletter", true, null, "report", { contextualHtml }));
  await new Promise(resolve => setTimeout(resolve, 20));
  const click = (node: Element) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
  const button = (label: string, within: ParentNode = doc) => {
    const found = Array.from(within.querySelectorAll("button")).find(node => node.textContent === label);
    assert.ok(found, `button ${label} exists`); return found;
  };
  const close = () => { window.__bhnReviewCleanup?.(); window.close(); };
  return { dom, window, doc, click, button, close, errors, requests, opened };
}

test("newsletter link clicks expose explicit actions and one whole-paragraph editor", async () => {
  const f = await fixture();
  try {
    const paragraph = f.doc.querySelector("#training")!, link = paragraph.querySelector("a")!;
    assert.equal(f.doc.querySelectorAll("[contenteditable],[data-bhn-inline-text]").length, 0);
    f.click(link.querySelector("strong")!);
    assert.deepEqual(Array.from(f.doc.querySelectorAll('[role=menu] button')).map(n => n.textContent), ["Open link", "Comment on element", "Quick edit", "Edit text"]);
    f.click(f.button("Open link")); assert.deepEqual(f.opened, [["https://castl.example/", "_blank", "noopener,noreferrer"]]);
    f.click(link); f.click(f.button("Edit text"));
    const dialog = f.doc.querySelector("dialog")!, input = dialog.querySelector("textarea")!;
    assert.equal(dialog.querySelectorAll("textarea").length, 1);
    assert.equal(input.value, paragraph.textContent);
    input.value = "Strengthen practical skills with CASTL and BioZone this winter.";
    f.click(f.button("Apply changes", dialog));
    assert.equal(f.doc.querySelector("dialog"), null);
    assert.equal(paragraph.textContent, "Strengthen practical skills with CASTL and BioZone this winter.");
    assert.equal(paragraph.querySelector("a strong")?.textContent, "CASTL");
    assert.equal(paragraph.querySelector("a")?.getAttribute("href"), "https://castl.example");
    f.click(link); assert.equal(f.button("Comment on element").disabled, true);
    f.click(f.button("Edit text")); const second = f.doc.querySelector("dialog")!;
    second.querySelector("textarea")!.value = "Strengthen practical skills with CASTL and BioZone this spring.";
    f.click(f.button("Apply changes", second));
    f.click(f.button("Save revision")); await new Promise(resolve => setTimeout(resolve, 0));
    const payload = JSON.parse(f.requests[0].body);
    assert.ok(payload.edits.some((edit: { before: string; after: string }) => edit.before === " this fall." && edit.after === " this spring."), "reopening uses the original baseline, not the previous staged text");
    assert.deepEqual(payload.images, []);
    f.click(f.button("Discard edits")); assert.equal(paragraph.textContent, "Build practical skills with CASTL and BioZone this fall.");
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("keyboard actions, modal focus trap and Escape preserve the semantic item", async () => {
  const f = await fixture();
  try {
    const item = f.doc.querySelector("#funding") as HTMLElement; item.focus();
    item.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    f.click(f.button("Edit text")); const dialog = f.doc.querySelector("dialog")!, input = dialog.querySelector("textarea")!;
    assert.equal(input.value, "Master’s and PhD trainees receive $25,000.");
    const apply = f.button("Apply changes", dialog); apply.focus();
    apply.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(f.doc.activeElement, f.button("Close", dialog));
    input.focus(); input.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    assert.equal(f.doc.querySelector('[role=menu]'), null, "typing inside editor does not activate page actions");
    input.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(f.doc.querySelector("dialog"), null); assert.equal(f.doc.activeElement, item);
    const space = new f.window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    f.doc.body.dispatchEvent(space); assert.equal(space.defaultPrevented, false, "Space on the page background retains normal scrolling");
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("quick edit stages inline and the pop-up previews a limited semantic bullet list", async () => {
  const f = await fixture();
  try {
    const paragraph = f.doc.querySelector("#plain")!;
    f.click(paragraph);
    const quick = f.doc.querySelector('[data-bhn-rv-inline-text]')!;
    assert.equal(f.doc.querySelector("dialog"), null);
    assert.equal(f.doc.activeElement, quick);
    quick.textContent = "A quick change.";
    quick.dispatchEvent(new f.window.Event("input", { bubbles: true }));
    quick.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert.equal(paragraph.textContent, "A quick change.");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(f.requests.length, 1, "the direct editor automatically attempts a revision save");
    f.click(paragraph); f.click(f.button("More text tools"));
    const dialog = f.doc.querySelector("dialog")!;
    dialog.querySelector("textarea")!.value = "First bullet\nSecond <b>bullet</b>";
    f.click(f.button("Bulleted list", dialog));
    assert.equal(dialog.querySelectorAll("ul li").length, 2);
    f.click(f.button("Done", dialog));
    assert.equal(f.doc.querySelector("#plain")!.tagName, "UL");
    assert.equal(f.doc.querySelector("#plain b"), null);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(f.requests[1].body).edits.map(({ before, after, list }: { before: string; after: string; list: boolean }) => ({ before, after, list })),
      [{ before: "A plain paragraph.", after: "First bullet\nSecond <b>bullet</b>", list: true }]);
    f.click(f.button("Discard edits"));
    assert.equal(f.doc.querySelector("#plain"), paragraph);
    assert.equal(paragraph.textContent, "A plain paragraph.");
    f.click(f.doc.querySelector("#training")!); f.click(f.button("More text tools"));
    const formatting = f.doc.querySelector("dialog [aria-label='Text formatting']")!;
    assert.deepEqual(Array.from(formatting.querySelectorAll("button")).map(button => button.textContent), ["Bold", "Italic"],
      "linked copy keeps its markup; only plain paragraphs can become lists");
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("selected formatting stages without overwriting links and discards back to original markup", async () => {
  const f = await fixture();
  try {
    const paragraph = f.doc.querySelector("#training")!, before = paragraph.innerHTML;
    f.click(paragraph); f.click(f.button("More text tools"));
    const dialog = f.doc.querySelector("dialog")!, field = dialog.querySelector("textarea")!;
    const start = field.value.indexOf("BioZone");
    field.setSelectionRange(start, start + "BioZone".length);
    f.click(f.button("Italic", dialog));
    assert.equal(dialog.querySelector("[aria-label='Formatting preview'] em")?.textContent, "BioZone");
    f.click(f.button("Done", dialog));
    assert.equal(paragraph.querySelector('a[href="https://biozone.example"] em')?.textContent, "BioZone");
    await new Promise(resolve => setTimeout(resolve, 0));
    const [patch] = JSON.parse(f.requests[0].body).edits;
    assert.equal(patch.after, patch.before, "formatting-only edits still save");
    assert.deepEqual(patch.marks, [{ kind: "italic", start: 0, end: 7 }]);
    f.click(f.button("Discard edits"));
    assert.equal(paragraph.innerHTML, before);
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("linked image actions stage image-only edits without editor preview images entering the baseline", async () => {
  const f = await fixture();
  try {
    const img = f.doc.querySelector("#graphic")!; f.click(img);
    assert.deepEqual(Array.from(f.doc.querySelectorAll('[role=menu] button')).map(n => n.textContent), ["Open link", "Comment on element", "Replace or edit picture"]);
    f.click(f.button("Replace or edit picture")); const dialog = f.doc.querySelector("dialog")!;
    const alt = Array.from(dialog.querySelectorAll("label")).find(n => n.textContent === "Alternative text")!.querySelector("input")!;
    alt.value = "Updated event invitation"; f.click(f.button("Apply changes", dialog));
    assert.equal(img.getAttribute("alt"), "Updated event invitation");
    f.click(f.button("Save revision")); await new Promise(resolve => setTimeout(resolve, 0));
    const payload = JSON.parse(f.requests[0].body); assert.deepEqual(payload.edits, []);
    assert.deepEqual(payload.images, [{ index: 0, before: { src: "https://images.example/event.png", alt: "Event invitation" }, alt: "Updated event invitation" }]);
    f.click(f.button("Discard edits")); assert.equal(img.getAttribute("alt"), "Event invitation");
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("read-only viewers cannot edit and unsafe link protocols never get an Open link action", async () => {
  const f = await fixture(false);
  try {
    f.click(f.doc.querySelector("#unsafe")!);
    assert.equal(Array.from(f.doc.querySelectorAll('[role=menu] button')).some(n => n.textContent === "Open link"), false);
    assert.equal(f.button("Edit text").disabled, true); assert.deepEqual(f.opened, []); assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("ambiguous block edits preserve the entered draft and pick mode comments on the entire paragraph", async () => {
  const f = await fixture();
  try {
    const paragraph = f.doc.querySelector("#training")!, original = paragraph.textContent, link = paragraph.querySelector("a")!;
    f.click(link); f.click(f.button("Edit text")); const dialog = f.doc.querySelector("dialog")!, input = dialog.querySelector("textarea")!;
    input.value = "A completely different paragraph without the inline anchors.";
    f.click(f.button("Apply changes", dialog));
    assert.equal(paragraph.textContent, original); assert.equal(input.value, "A completely different paragraph without the inline anchors.");
    assert.match(dialog.querySelector('[role=alert]')?.textContent || "", /formatting boundary/);
    f.click(f.button("Cancel", dialog));
    f.click(f.button("Comment on an element")); f.click(link.querySelector("strong")!);
    assert.equal(f.doc.querySelector('[role=menu]'), null);
    assert.equal(f.doc.querySelector('.bhn-rv-compose .bhn-rv-quote')?.textContent, original);
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});

test("non-newsletter review mode retains existing element-comment behavior", async () => {
  const f = await fixture(true, false);
  try { f.click(f.doc.querySelector("#training")!); assert.equal(f.doc.querySelector('[role=menu]'), null); assert.ok(f.doc.querySelector('.bhn-rv-compose')); assert.deepEqual(f.errors, []); }
  finally { f.close(); }
});
