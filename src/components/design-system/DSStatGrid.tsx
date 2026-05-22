"use client";
/**
 * Stat grid + individual Stat primitive. The whole point of having
 * an adaptive primitive here is the cinematic preset wants stats
 * laid out RADICALLY differently:
 *
 *   Classic     — 2x2 / 4x1 grid of bordered cards, each with
 *                 icon + label + value + help, tabular-nums
 *   Cinematic   — single row of inline stats divided by vertical
 *                 hairlines (`divide-x`), gradient-text values,
 *                 small uppercase label above
 *
 * Same JSX in the page either way.
 */
import type { ReactNode } from "react";
import { useDesignSystem } from "@/components/ui/DesignSystemProvider";

const GRADIENT_TONES = ["brand", "violet", "rose", "emerald", "amber"] as const;
export type StatTone = (typeof GRADIENT_TONES)[number];

/** Wraps a row of <DSStat> children. Use this so the layout switch
 *  happens in ONE place, not on every stat. */
export function DSStatGrid({ children }: { children: ReactNode }) {
  const { designSystem } = useDesignSystem();
  if (designSystem === "studio") {
    // Studio tiles use the asymmetric blob-corner radius (organic-card /
    // organic-card-alt) and a translucent backdrop-blur fill. The
    // alternation between the two shapes is handled by DSStat
    // looking at its own index — for that, we pass an `--ds-index`
    // CSS var by cloning the children. Cheapest: just rely on
    // nth-child in CSS via a sibling marker class.
    return (
      <div className="ds-studio-statgrid grid grid-cols-2 gap-3">
        {children}
      </div>
    );
  }
  if (designSystem === "cinematic") {
    // Hairline-divided row, no card chrome — designed to sit either
    // inside the DSPageHeader cinematic body (as the `aside`) or
    // inside a DSSection wash. Same vocabulary as the HR-overview
    // stat triplet: divide-x + tabular gradient numbers + uppercase
    // tracked labels. 2-col on phones so labels don't truncate.
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line">
        {children}
      </div>
    );
  }
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>;
}

interface StatProps {
  /** Pass a React element, NOT a component reference. See the
   *  matching note in DSPageHeader.tsx for the boundary issue. */
  icon?: ReactNode;
  label: string;
  value: number | string;
  help?: string;
  /** Cinematic-only colour ramp for the gradient-text number. Defaults
   *  to brand. Classic ignores this. */
  tone?: StatTone;
  /** Classic-only accent. */
  accent?: "brand";
  /** Cinematic-only: when true, render values + labels in light
   *  tones suitable for a dark surface (i.e. when this DSStat sits
   *  INSIDE a hero's `aside` slot on top of the gradient stage).
   *  Default false → dark gradient values + subtle labels, suitable
   *  for sitting on the page's light `--card` surface. */
  onDark?: boolean;
}

function gradientForTone(tone: StatTone, onDark: boolean): string {
  // Two palettes per tone — one for dark surfaces (hero aside),
  // one for light page surfaces. Callers opt into the dark palette
  // via the `onDark` prop on DSStat. Default is light surface.
  if (onDark) {
    switch (tone) {
      case "violet":
        return "linear-gradient(120deg, #c4b5fd 0%, #ddd6fe 100%)";
      case "rose":
        return "linear-gradient(120deg, #fda4af 0%, #fecdd3 100%)";
      case "emerald":
        return "linear-gradient(120deg, #6ee7b7 0%, #a7f3d0 100%)";
      case "amber":
        return "linear-gradient(120deg, #fcd34d 0%, #fde68a 100%)";
      case "brand":
      default:
        return "linear-gradient(120deg, #ffffff 0%, var(--brand-200, #bae6fd) 100%)";
    }
  }
  // Light surface — use saturated mids so values read as dark
  // editorial numbers on the bright `--card` page bg.
  switch (tone) {
    case "violet":
      return "linear-gradient(120deg, #6d28d9 0%, #4338ca 100%)";
    case "rose":
      return "linear-gradient(120deg, #be123c 0%, #9f1239 100%)";
    case "emerald":
      return "linear-gradient(120deg, #047857 0%, #065f46 100%)";
    case "amber":
      return "linear-gradient(120deg, #b45309 0%, #92400e 100%)";
    case "brand":
    default:
      return "linear-gradient(120deg, var(--brand-700, #1d4f8b) 0%, var(--brand-900, #0e1a3a) 100%)";
  }
}

export function DSStat({
  icon,
  label,
  value,
  help,
  tone = "brand",
  accent,
  onDark = false,
}: StatProps) {
  const { designSystem } = useDesignSystem();
  const formatted = typeof value === "number" ? value.toLocaleString() : value;

  if (designSystem === "studio") {
    // Translucent backdrop-blur tile — designed to sit on a
    // gradient hero. The alternating organic-card / organic-card-alt
    // shape is applied via nth-child in globals.css under the
    // .ds-studio-statgrid > * selectors.
    return (
      <div className="ds-studio-stat bg-white/10 backdrop-blur border border-white/20 px-4 py-3.5">
        <div className="flex items-center gap-2 text-white/75 text-[11px] uppercase tracking-wider">
          {icon}
          {label}
        </div>
        <p className="text-2xl md:text-3xl font-bold mt-1 text-white">{formatted}</p>
        {help && <p className="text-[10px] text-white/70 mt-1">{help}</p>}
      </div>
    );
  }

  if (designSystem === "cinematic") {
    // Editorial stat tile — uppercase tracked label up top, huge
    // gradient-text number, optional help underneath. Sits inside
    // a hairline-divided row (see DSStatGrid). first:pl-0 / last:pr-0
    // keeps the gradient text aligned with the section gutter when
    // used as the leftmost / rightmost stat.
    //
    // Surface awareness — `onDark` flips both the value gradient
    // and the label / help text colours. Light-surface DSStats use
    // dark editorial gradients + `text-subtle` labels; dark-surface
    // ones use bright gradients + `text-white/85` labels.
    const labelCls = onDark ? "text-white/85" : "text-subtle";
    const helpCls  = onDark ? "text-white/70" : "text-subtle";
    const valueShadow = onDark ? "drop-shadow-on-dark-sm" : "";
    return (
      <div className="px-4 sm:px-6 py-3 first:pl-0 last:pr-0">
        <div className={`text-[10px] uppercase tracking-[0.22em] font-bold ${labelCls} inline-flex items-center gap-1.5`}>
          {icon}
          {label}
        </div>
        <p
          className={`text-3xl sm:text-4xl lg:text-5xl font-black tabular-nums tracking-tight leading-none mt-2 ${valueShadow}`}
          style={{
            backgroundImage: gradientForTone(tone, onDark),
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {formatted}
        </p>
        {help && <p className={`text-[10px] ${helpCls} mt-1.5`}>{help}</p>}
      </div>
    );
  }

  // Classic
  return (
    <div
      className={`rounded-xl border ${accent === "brand" ? "border-brand-200 bg-brand-50/40" : "border-line bg-card"} p-3`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-fg tabular-nums mt-1">{formatted}</p>
      {help && <p className="text-[10px] text-subtle mt-0.5">{help}</p>}
    </div>
  );
}
