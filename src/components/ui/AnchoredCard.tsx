"use client";

/**
 * Where a confirmation or a small input opens: right beside the control
 * that asked for it, never as a browser dialog or a centred modal.
 *
 * The anchor is the element last pressed (tracked for a few seconds) or,
 * failing that, the focused one — so `await confirmDialog(...)` called
 * from a click handler opens under that button without the call site
 * passing anything. Below it when there is room, above it when not, kept
 * inside the window. Esc and a click anywhere else cancel.
 */
import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";

let lastPress: { el: Element; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => { lastPress = { el: e.target as Element, at: Date.now() }; }, true);
}

const CONTROL = "button, a, [role=button], input, select, textarea, label, summary";

/** The box of the control that just asked — or null when there is none to point at. */
export function currentAnchor(): DOMRect | null {
  if (typeof document === "undefined") return null;
  const pressed = lastPress && Date.now() - lastPress.at < 4000 && lastPress.el.isConnected ? lastPress.el : null;
  const el = pressed ?? document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const target = el.closest(CONTROL) ?? el;
  const r = target.getBoundingClientRect();
  return r.width || r.height ? r : null;
}

export function AnchoredCard({ anchor, onDismiss, children, label, role = "dialog", width = 352 }: {
  anchor: DOMRect | null;
  onDismiss: () => void;
  children: ReactNode;
  label?: string;
  role?: "dialog" | "alertdialog";
  width?: number;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const h = card.current?.offsetHeight ?? 160;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 6, w = Math.min(width, vw - 16);
    if (!anchor) { setPos({ left: Math.round((vw - w) / 2), top: Math.round(vh * 0.2) }); return; }
    const left = Math.max(8, Math.min(anchor.left, vw - w - 8));
    const below = anchor.bottom + gap;
    const top = below + h <= vh - 8 ? below : Math.max(8, anchor.top - gap - h);
    setPos({ left, top });
  }, [anchor, width]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!card.current?.contains(e.target as Node)) onDismiss(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onDismiss(); } };
    // Wait a tick so the press that opened this does not close it.
    const t = setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onDismiss]);

  return (
    <div
      ref={card}
      role={role}
      aria-label={label}
      className="fixed z-[70] overflow-hidden rounded-xl border border-line bg-card-solid shadow-2xl ring-1 ring-line/40"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: `min(${width}px, calc(100vw - 16px))`, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>
  );
}
