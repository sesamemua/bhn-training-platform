"use client";

/**
 * A small card that opens beside its trigger on hover or keyboard focus.
 *
 * Fixed to the viewport rather than absolutely placed, so a table's
 * scrolling container cannot clip it, and kept inside the window's edges.
 */
import { useId, useRef, useState, type ReactNode } from "react";

export function HoverCard({ trigger, children, width = 288, className = "" }: {
  trigger: ReactNode;
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 });
  };
  const hide = () => setAt(null);
  return (
    <span
      ref={ref}
      tabIndex={0}
      aria-describedby={at ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-flex cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      {trigger}
      {at && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none fixed z-[60] rounded-lg border bg-card-solid px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-fg shadow-xl ${className}`}
          style={{ left: at.left, top: at.top, width }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
