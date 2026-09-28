"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { history, undo, redo } from "@tiptap/pm/history";
import { keymap } from "@tiptap/pm/keymap";
import { socialTextDecorations, socialTextDocument } from "@/lib/social/markup";

export function SocialMarkedText({ value, before, label, readOnly, onChange, onBlur }: {
  value: string;
  before: string;
  label: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const [tooLong, setTooLong] = useState(false);

  useLayoutEffect(() => {
    if (!host.current) return;
    const view = editor.current ?? new EditorView(host.current, {
      state: EditorState.create({
        doc: socialTextDocument(value),
        plugins: [history(), keymap({ "Mod-z": undo, "Mod-Shift-z": redo, "Mod-y": redo })],
      }),
    });
    editor.current = view;
    view.setProps({
      editable: () => !readOnly,
      attributes: {
        role: "textbox", "aria-label": `Post text for ${label}`, "aria-multiline": "true",
        "aria-readonly": String(readOnly), spellcheck: "true",
        class: "min-h-20 whitespace-pre-wrap break-words rounded-[2px] text-[16px] leading-[1.5] text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-[14px]",
      },
      decorations: (state) => socialTextDecorations(state.doc, before),
      dispatchTransaction: (transaction) => {
        if (transaction.docChanged && transaction.doc.textContent.length > 6000) {
          setTooLong(true); return;
        }
        setTooLong(false);
        const next = view.state.apply(transaction);
        view.updateState(next);
        if (transaction.docChanged) onChange(next.doc.textContent);
      },
      handleKeyDown: (current, event) => {
        if (event.key !== "Enter" || event.isComposing) return false;
        current.dispatch(current.state.tr.insertText("\n").scrollIntoView());
        return true;
      },
      handlePaste: (current, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return false;
        current.dispatch(current.state.tr.insertText(text.replace(/\r\n?/g, "\n")).scrollIntoView());
        return true;
      },
      clipboardTextSerializer: (slice) => slice.content.textBetween(0, slice.content.size, ""),
      handleDOMEvents: { blur: () => { onBlur(); return false; } },
    });
    if (view.state.doc.textContent !== value) {
      const transaction = view.state.tr.insertText(value, 0, view.state.doc.content.size).setMeta("addToHistory", false);
      transaction.setSelection(TextSelection.create(transaction.doc, Math.min(view.state.selection.head, value.length)));
      view.updateState(view.state.apply(transaction));
    }
  }, [value, before, label, readOnly, onChange, onBlur]);

  useEffect(() => () => { editor.current?.destroy(); editor.current = null; }, []);

  return <>
    <div ref={host} />
    {tooLong && <p role="alert" className="mt-2 text-[13px] text-rose-800">Posts are limited to 6,000 characters.</p>}
  </>;
}
