import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { htmlImageSource } from "../../src/lib/page-review/html-image-source";

const { JSDOM } = createRequire(import.meta.url)("jsdom");
interface ImageUploadRequest { method: string; body: FormData; headers: Record<string, string>; signal: AbortSignal }

function fixture(assetId: string | null = "original-asset") {
  const dom = new JSDOM(`<!doctype html><a href="https://example.com/report"><picture><source srcset="old.webp" media="(min-width: 600px)"><img src="https://cdn.example.com/original.png" alt="On stage" width="620" height="300" align="left" style="width:100%;height:auto" data-nl-image="image-a"></picture></a>`, { runScripts: "outside-only", url: "https://newsletter.test/" });
  const win = dom.window;
  win.HTMLCanvasElement.prototype.getContext = () => null;
  win.eval(`
    var htmlReview=true,originalReviewImages=Array.from(document.querySelectorAll('img')),inlineEdit={allowed:true,saving:false,round:5,revision:'hash',issueRevision:'timestamp',images:[{index:0,assetId:${JSON.stringify(assetId)}}]},state={saving:false},credential='fixture',endpoint='/review';
    var style=document.createElement('style');document.head.append(style);
    function make(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(typeof text==='string')node.textContent=text;return node;}
    function renderCommentCopy(){} function isLocked(){return false;}
    function createHtmlReviewDialog(title){var node=make('dialog'),body=make('div'),footer=make('div');node.setAttribute('data-bhn-review-ui','');node.append(body,footer);document.body.append(node);var result={node,body,footer,onClose:null,close:function(){node.remove();if(result.onClose)result.onClose();}};return result;}
  `);
  win.eval(htmlImageSource());
  return { dom, win, img: win.document.querySelector("img") as HTMLImageElement, original: win.document.body.innerHTML };
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test("image controls stage one image edit and preserve the linked document until Save revision", async () => {
  const { dom, win, img, original } = fixture();
  win.openHtmlImageEditor(img);
  const editor = win.htmlImageEditor;
  assert.equal(editor.dialog.node.getAttribute("data-bhn-review-ui"), "");
  editor.alt.value = "Chris speaking to the audience";
  editor.width.value = "75";
  editor.width.dispatchEvent(new win.Event("input"));
  editor.align.value = "center";
  editor.align.dispatchEvent(new win.Event("change"));
  await win.applyHtmlImage(editor);
  assert.equal(win.htmlImageDirty(), true);
  assert.deepEqual(json(win.getHtmlImageEdits()), [{ index: 0, before: { src: "https://cdn.example.com/original.png", alt: "On stage" }, alt: "Chris speaking to the audience", width: 75, align: "center" }]);
  assert.equal(img.closest("a")?.getAttribute("href"), "https://example.com/report");
  assert.equal(img.style.width, "75%");
  assert.equal(img.style.marginLeft, "auto");
  assert.equal(win.document.querySelector("dialog"), null);
  win.resetHtmlImages();
  assert.equal(win.htmlImageDirty(), false);
  assert.equal(win.document.body.innerHTML, original);
  dom.window.close();
});

test("cancel and explicit removal confirmation preserve original picture and restore exact attributes", () => {
  const { dom, win, img, original } = fixture();
  win.openHtmlImageEditor(img);
  win.htmlImageEditor.alt.value = "Not applied";
  win.closeHtmlImageEditor();
  assert.equal(win.htmlImageDirty(), false);
  assert.equal(win.document.body.innerHTML, original);
  win.openHtmlImageEditor(img);
  const editor = win.htmlImageEditor;
  editor.remove.click();
  assert.equal(win.htmlImageDirty(), false, "asking for confirmation must not remove anything");
  (Array.from(editor.dialog.body.querySelectorAll("button")) as HTMLButtonElement[]).find(button => button.textContent === "Confirm removal")?.click();
  assert.equal(img.isConnected, true, "preview retains image indexes");
  assert.equal(img.style.display, "none");
  assert.deepEqual(json(win.getHtmlImageEdits()), [{ index: 0, before: { src: "https://cdn.example.com/original.png", alt: "On stage" }, remove: true }]);
  win.resetHtmlImages();
  assert.equal(win.document.body.innerHTML, original);
  dom.window.close();
});

test("upload and baked crop use the authorized document API; only Apply changes stages a replacement", async () => {
  const { dom, win, img, original } = fixture();
  const calls: { url: string; request: ImageUploadRequest }[] = [];
  win.fetch = async (url: string, request: ImageUploadRequest) => {
    calls.push({ url, request });
    return { ok: true, json: async () => ({ ok: true, asset: { id: calls.length === 1 ? "new-asset" : "cropped-asset", url: `https://cdn.example.com/new-${calls.length}.png`, alt: "", width: 900, height: 600 } }) };
  };
  win.openHtmlImageEditor(img);
  const editor = win.htmlImageEditor;
  await win.uploadHtmlImage(editor, new win.File(["image"], "photo.png", { type: "image/png" }));
  assert.equal(img.getAttribute("src"), "https://cdn.example.com/original.png");
  assert.equal(win.htmlImageDirty(), false);
  editor.cropFields.left.value = "10";
  editor.cropFields.width.value = "80";
  editor.rotate = 90;
  editor.flipX = true;
  await win.applyHtmlImage(editor);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request.method, "POST");
  assert.equal(calls[0].request.body.get("expectedRound"), "5");
  assert.equal((calls[0].request.body.get("file") as File).name, "photo.png");
  assert.equal(calls[1].request.body.get("assetId"), "new-asset");
  assert.deepEqual(JSON.parse(String(calls[1].request.body.get("transform"))), { crop: { left: .1, top: 0, width: .8, height: 1 }, rotate: 90, flipX: true, flipY: false });
  assert.deepEqual(json(win.getHtmlImageEdits()), [{ index: 0, before: { src: "https://cdn.example.com/original.png", alt: "On stage" }, assetId: "cropped-asset" }]);
  assert.equal(img.getAttribute("src"), "https://cdn.example.com/new-2.png");
  assert.equal(win.document.querySelector("source").getAttribute("media"), "not all");
  win.resetHtmlImages();
  assert.equal(win.document.body.innerHTML, original);
  dom.window.close();
});

test("external images explain crop limitations; permission failures and upload conflicts do not alter content", async () => {
  const { dom, win, img, original } = fixture(null);
  win.inlineEdit.allowed = false;
  win.openHtmlImageEditor(img);
  assert.equal(win.document.querySelector("dialog"), null);
  win.inlineEdit.allowed = true;
  win.openHtmlImageEditor(img);
  const editor = win.htmlImageEditor;
  assert.equal(editor.cropControls.disabled, true);
  assert.equal(editor.externalNote.hidden, false);
  win.fetch = async () => ({ ok: false, json: async () => ({ error: "A newer revision is available." }) });
  await win.uploadHtmlImage(editor, new win.File(["image"], "photo.png", { type: "image/png" }));
  assert.equal(editor.error.textContent, "A newer revision is available.");
  assert.equal(editor.error.hidden, false);
  assert.equal(win.htmlImageDirty(), false);
  win.cleanupHtmlImageEditor();
  assert.equal(win.document.body.innerHTML, original);
  dom.window.close();
});

test("opening and applying an unchanged image is a no-op, and invalid crops are not staged", async () => {
  const { dom, win, img, original } = fixture();
  win.openHtmlImageEditor(img);
  await win.applyHtmlImage(win.htmlImageEditor);
  assert.equal(win.htmlImageDirty(), false);
  assert.equal(win.document.body.innerHTML, original);
  win.openHtmlImageEditor(img);
  const editor = win.htmlImageEditor;
  editor.cropFields.left.value = "25";
  editor.cropFields.width.value = "90";
  await win.applyHtmlImage(editor);
  assert.match(editor.error.textContent, /Keep the crop inside/);
  assert.equal(editor.error.hidden, false);
  assert.equal(win.htmlImageDirty(), false);
  assert.notEqual(win.document.querySelector("dialog"), null, "keep the editor open to correct the crop");
  win.cleanupHtmlImageEditor();
  assert.equal(win.document.body.innerHTML, original);
  dom.window.close();
});
