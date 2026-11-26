import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { editableTextNodes } from "./editable-text";
import { isWholeDocument, stripScripts } from "./paste-document";

export const htmlRevision = (html: string) => createHash("sha256").update(html).digest("hex");
export interface TextEdit { index: number; before: string; after: string }

/** Apply plain text only; a reviewer can never submit executable markup or replace link URLs. */
export function editReviewHtml(html: string, edits: TextEdit[]) {
  const whole = isWholeDocument(html);
  const dom = new JSDOM(whole ? stripScripts(html) : "<!doctype html><html><head></head><body>\n" + stripScripts(html) + "\n</body></html>");
  try {
    const nodes = editableTextNodes(dom.window.document);
    const seen = new Set<number>();
    for (const edit of edits) {
      if (seen.has(edit.index) || !nodes[edit.index] || nodes[edit.index].data !== edit.before) throw new Error("The selected text changed. Reload before saving.");
      seen.add(edit.index);
      nodes[edit.index].data = edit.after;
    }
    return whole ? dom.serialize() : dom.window.document.body.innerHTML;
  } finally { dom.window.close(); }
}
