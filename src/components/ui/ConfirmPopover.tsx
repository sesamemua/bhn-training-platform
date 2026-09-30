"use client";

/**
 * A confirmation that opens beside the button that asked for it — never a
 * browser dialog, never a centred modal. Esc or a click elsewhere cancels.
 *
 * With `input`, it also takes a line of text (a name, a rename) in place
 * of window.prompt().
 *
 *   <ConfirmPopover message="Delete this sign?" confirmLabel="Delete" tone="danger" onConfirm={remove}>
 *     {(open) => <button onClick={open}>×</button>}
 *   </ConfirmPopover>
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ConfirmPopover({
  children, message, detail, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default",
  align = "end", input, onConfirm,
}: {
  children: (open: () => void, isOpen: boolean) => ReactNode;
  message: ReactNode;
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Which edge of the trigger the popover lines up with. */
  align?: "start" | "end";
  input?: { initial?: string; placeholder?: string; maxLength?: number };
  onConfirm: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(input?.initial ?? "");
  const box = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLInputElement & HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    setValue(input?.initial ?? "");
    const t = setTimeout(() => first.current?.focus(), 0);
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = !input || value.trim().length > 0;
  const confirm = () => { if (!ok) return; setOpen(false); onConfirm(value.trim()); };

  return (
    <span ref={box} className="relative inline-flex">
      {children(() => setOpen((v) => !v), open)}
      {open && (
        <span
          role="dialog"
          aria-labelledby={id}
          className={`absolute top-full z-50 mt-1.5 w-72 rounded-xl border border-line bg-card-solid p-3 text-left shadow-xl ${align === "end" ? "right-0" : "left-0"}`}
        >
          <span id={id} className="block text-[12.5px] font-semibold leading-snug text-fg">{message}</span>
          {detail && <span className="mt-1 block text-[11.5px] leading-snug text-muted">{detail}</span>}
          {input && (
            <input
              ref={first}
              value={value}
              maxLength={input.maxLength ?? 120}
              placeholder={input.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } }}
              className="mt-2 w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none"
            />
          )}
          <span className="mt-2.5 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated">
              {cancelLabel}
            </button>
            <button
              ref={input ? undefined : first}
              type="button"
              onClick={confirm}
              disabled={!ok}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50 ${tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"}`}
            >
              {confirmLabel}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
