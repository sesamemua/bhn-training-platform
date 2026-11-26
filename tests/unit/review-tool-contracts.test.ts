import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { commentCopySource } from "../../src/lib/page-review/comment-copy-source";
import type { ReviewMediaTools } from "../../src/lib/page-review/media-tools";

test("one toolbar delegates the same edit tool to different media implementations", () => {
  for (const operation of ["HTML text patch", "Report JSON field update"]) {
    const document = new JSDOM('<main id="bhn-review-overlay"></main>').window.document;
    const called: string[] = [];
    const adapter: ReviewMediaTools = { editText: {
      getState: () => ({ enabled: true, dirty: true, saving: false, error: "" }),
      save: async () => { called.push(operation); }, discard: () => { called.push("discard"); },
    } };
    const make = (tag: string, cls = "", text = "") => { const node = document.createElement(tag); node.className = cls; node.textContent = text; return node; };
    const addButton = (text: string, cls: string, click: () => void) => { const button = make("button", cls, text); button.addEventListener("click", click); return button; };
    const mount = new Function("document", "make", "addButton", "state", "style", "reviewMediaTools", "contextualReview", "root",
      commentCopySource() + ";renderCommentCopy();return commentActionDock;");
    const dock = mount(document, make, addButton, { viewer: {}, review: { title: "Review", round: 1 }, comments: [], draft: "", replyTo: null, editingId: null },
      { textContent: "" }, adapter, true, document.querySelector("main"));
    assert.equal(document.querySelector("main")!.contains(dock), false);
    const buttons = Array.from(dock.querySelectorAll("button")) as HTMLButtonElement[];
    buttons.find(b => b.textContent === "Save revision")!.click();
    buttons.find(b => b.textContent === "Discard edits")!.click();
    assert.deepEqual(called, [operation, "discard"]);
    assert.doesNotMatch(commentCopySource(), /\bhtmlReview\b|pastedHtml|\/document/);
  }
});
