"use client";

/**
 * Small inputs for the Lucky Flask Pop-Up: a radio group and a quantity
 * stepper. Plain buttons with ARIA rather than native inputs, so they can
 * look like swatches and pills while still behaving like radios for a
 * keyboard (one tab stop, arrow keys move and select) and a screen reader.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { MAX_QTY, MIN_QTY } from "@/lib/merch/store";
import { cn } from "@/lib/utils";

export interface RadioOption<T extends string> {
  value: T;
  /** Accessible name. The visible content comes from `render`. */
  label: string;
}

export function RadioPills<T extends string>({
  label,
  labelId,
  options,
  value,
  onChange,
  render,
  className,
  optionClassName,
  groupRef,
}: {
  /** Used when there is no visible label to point at. */
  label?: string;
  labelId?: string;
  options: RadioOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  render: (option: RadioOption<T>, checked: boolean) => ReactNode;
  className?: string;
  optionClassName?: (checked: boolean) => string;
  /** Lets a parent send focus here, e.g. "pick a size first". */
  groupRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.value === value);
  // Roving tab stop: the checked radio, or the first when none is.
  const tabStop = current === -1 ? 0 : current;

  function onKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={labelId ? undefined : label}
      aria-labelledby={labelId}
      className={className}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.label}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card-solid",
              optionClassName?.(checked),
            )}
          >
            {render(o, checked)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * − n +. The ends are aria-disabled rather than disabled, so reaching 10
 * does not throw keyboard focus back to the top of the page.
 */
export function QtyStepper({
  value,
  onChange,
  label,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  /** e.g. "Quantity" or "Quantity of Lucky Cat-alyst, White, M". */
  label: string;
  size?: "sm" | "md";
}) {
  const atMin = value <= MIN_QTY;
  const atMax = value >= MAX_QTY;
  const btn = cn(
    "inline-flex shrink-0 items-center justify-center rounded-full text-fg ring-1 ring-inset ring-line transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
    size === "sm" ? "h-8 w-8" : "h-11 w-11",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 [&:not([aria-disabled=true])]:hover:bg-elevated",
  );
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={btn}
        aria-label="One fewer"
        aria-disabled={atMin}
        onClick={() => !atMin && onChange(value - 1)}
      >
        <Minus size={size === "sm" ? 13 : 16} aria-hidden />
      </button>
      <output
        aria-live="polite"
        className={cn(
          "min-w-[2.25rem] text-center font-mono font-bold tabular-nums text-fg",
          size === "sm" ? "text-sm" : "text-base",
        )}
      >
        {value}
      </output>
      <button
        type="button"
        className={btn}
        aria-label="One more"
        aria-disabled={atMax}
        onClick={() => !atMax && onChange(value + 1)}
      >
        <Plus size={size === "sm" ? 13 : 16} aria-hidden />
      </button>
    </div>
  );
}
