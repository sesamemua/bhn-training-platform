"use client";
/**
 * Small uppercase label used above section titles. The shape is
 * shared across design systems — what differs is the tracking +
 * accent treatment.
 *
 *   Classic   — text-only, normal tracking, subtle color
 *   Cinematic — wider tracking, brand-tinted text
 *   Studio    — tracking [0.22em], brand-tinted text, sits inside
 *               a gradient hero so always reads as white-ish on
 *               dark mesh (we use text-white/80 when wrapped in
 *               the hero — but the primitive itself uses brand
 *               by default; pages can override via the `tone`
 *               prop where context warrants)
 *
 * Text only — no leading rule, no gradient hairline, no coloured tick
 * before the label. That was tried (a short gradient hairline glued to
 * the front of the eyebrow) and asked to be removed platform-wide: at
 * this size it reads as a stray rendering artefact rather than an
 * accent, and it pushes the label off the left edge the title below it
 * aligns to. Don't reintroduce it here or copy it into a page-local
 * eyebrow component — this is the one shared primitive precisely so
 * that doesn't happen again.
 */
import { useDesignSystem } from "@/components/ui/DesignSystemProvider";

export function DSEyebrow({ children, tone }: { children: React.ReactNode; tone?: "default" | "onDark" }) {
  const { designSystem } = useDesignSystem();
  const isDark = tone === "onDark";

  if (designSystem === "cinematic") {
    return (
      <p className={"inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] font-bold " + (isDark ? "text-white/85" : "text-brand-700")}>
        {children}
      </p>
    );
  }

  if (designSystem === "studio") {
    return (
      <p className={"inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-semibold " + (isDark ? "text-white/85" : "text-brand-700")}>
        {children}
      </p>
    );
  }

  // Classic
  return (
    <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
      {children}
    </p>
  );
}
