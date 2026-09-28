import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@tiptap/pm/state";
import { socialTextDecorations, socialTextDocument } from "../../src/lib/social/markup";

test("inline markup never changes the plain text, including line breaks and deleted content", () => {
  for (const [before, after] of [
    ["Hello old world", "Hello new world"],
    ["First\n\nSecond", "First\nChanged\nSecond"],
    ["Remove me", ""],
    ["", "New post"],
    ["Hello", "<script>alert('text only')</script>"],
  ]) {
    const doc = socialTextDocument(after);
    assert.equal(doc.type.whitespace, "pre");
    const state = EditorState.create({ doc });
    const markup = socialTextDecorations(doc, before).find();
    assert.ok(markup.length > 0);
    assert.equal(state.doc.textContent, after);
    assert.equal(state.doc.slice(0, doc.content.size).content.textBetween(0, doc.content.size, ""), after);
    for (const item of markup) {
      assert.ok(item.from >= 0 && item.to <= after.length);
      if (item.from === item.to) assert.equal(item.spec.side, -1);
    }
    const changed = state.apply(state.tr.insertText("!", 0));
    assert.equal(changed.doc.textContent, `!${after}`);
  }
  assert.equal(socialTextDecorations(socialTextDocument("Same"), "Same").find().length, 0);
});
