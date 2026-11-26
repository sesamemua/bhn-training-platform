import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { editableTextNodes } from "./editable-text";
import { isWholeDocument, stripScripts } from "./paste-document";

export const htmlRevision = (html: string) => createHash("sha256").update(html).digest("hex");
export interface TextEdit { index: number; before: string; after: string; list?: boolean }

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
      const node = nodes[edit.index];
      if (!edit.list) { node.data = edit.after; continue; }
      const paragraph = node.parentElement;
      const items = edit.after.split("\n").map(item => item.trim()).filter(Boolean);
      if (paragraph?.tagName !== "P" || paragraph.childNodes.length !== 1 || !items.length || items.length > 30)
        throw new Error("The selected text changed or cannot be formatted as a list. Use a plain paragraph.");
      const list = dom.window.document.createElement("ul");
      for (const attribute of paragraph.attributes) list.setAttribute(attribute.name, attribute.value);
      list.style.listStyleType = "disc";
      list.style.paddingLeft = "24px";
      for (const item of items) {
        const li = dom.window.document.createElement("li");
        li.textContent = item;
        list.append(li);
      }
      paragraph.replaceWith(list);
    }
    return whole ? dom.serialize() : dom.window.document.body.innerHTML;
  } finally { dom.window.close(); }
}
