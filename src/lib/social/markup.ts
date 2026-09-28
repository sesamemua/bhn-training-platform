import { Schema, type Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { diffWordsWithSpace } from "diff";

export const socialTextSchema = new Schema({ nodes: { doc: { content: "text*", whitespace: "pre" }, text: {} } });

export function socialTextDocument(text: string): Node {
  return socialTextSchema.node("doc", null, text ? socialTextSchema.text(text) : undefined);
}

export function socialTextDecorations(doc: Node, before: string): DecorationSet {
  const decorations: Decoration[] = [];
  let position = 0;
  for (const part of diffWordsWithSpace(before, doc.textContent)) {
    if (part.removed) {
      // Deletions are display-only: never part of the saved or copied document.
      decorations.push(Decoration.widget(position, (view) => {
        const deleted = view.dom.ownerDocument.createElement("del");
        deleted.textContent = part.value;
        deleted.className = "bg-rose-100 text-rose-900 line-through";
        deleted.contentEditable = "false";
        deleted.title = "Deleted text";
        return deleted;
      }, { side: -1, key: `${position}:${part.value}` }));
      continue;
    }
    if (part.added) decorations.push(Decoration.inline(position, position + part.value.length, {
      nodeName: "ins", class: "bg-emerald-100 text-emerald-900 underline",
    }));
    position += part.value.length;
  }
  return DecorationSet.create(doc, decorations);
}
