"use client";
/**
 * Daily-fresh theme card. Shows once per calendar day on the dashboard,
 * suggesting a different theme. Three actions:
 *
 *   • "Try it"   — applies the theme for THIS session only (no
 *                  localStorage write). Lets the user see the theme
 *                  in action before committing.
 *   • "Keep it"  — persists the theme to localStorage as their saved
 *                  choice. Only shown after Try (when isPreviewing is
 *                  true) to keep the initial card minimal.
 *   • "Maybe later" — dismiss for today; revert to saved theme if
 *                     we were previewing.
 *
 * Dismissal is per-calendar-day (key includes today's YYYY-MM-DD) so
 * tomorrow brings a fresh suggestion. Once a user "keeps" a daily
 * suggestion, we don't pester them again about that same theme — the
 * card just won't suggest the theme they're already on.
 *
 * Sakura (limited-time, May 2026) preempts the rotation while it's
 * in its window — see suggestTodaysTheme() in ThemeProvider.
 */
import { useEffect, useState } from "react";
import { Sparkles, X, Check } from "lucide-react";
import {
  useTheme,
  THEMES,
  suggestTodaysTheme,
  type ThemeId,
} from "@/components/ui/ThemeProvider";
import { cn } from "@/lib/utils";

const SWATCH: Record<ThemeId, [string, string, string]> = {
  light:      ["#ffffff", "#3b6cef", "#0b1b3b"],
  rosalind:   ["#fbf6ec", "#485940", "#a8625a"],
  hitech:     ["#06121f", "#00d4ff", "#e3f7ff"],
  sakura:     ["#fffaf9", "#d04c61", "#3a1f24"],
  icecream:   ["#fff8f3", "#c5234a", "#b8e0d2"],
  greenwood:  ["#f7faf2", "#456224", "#c6a449"],
  artdeco:    ["#ece0cd", "#4a7b83", "#c98a5f"],
  canada:     ["#ffffff", "#dc1f2d", "#23161a"],
  endofsummer: ["#faf4ea", "#c87f22", "#2a2016"],
  harvest:     ["#f6efe2", "#a3481c", "#2b1f14"],
};

function todayKey(): string {
  const d = new Date();
  return `bhn-daily-theme-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyThemeCard() {
  const { theme, savedTheme, setTheme, isPreviewing } = useTheme();
  const [suggestion, setSuggestion] = useState<ThemeId | null>(null);
  const [dismissed, setDismissed] = useState(true); // start true to avoid SSR flash

  useEffect(() => {
    // Compute suggestion + read dismissal state after mount so we can
    // touch localStorage and Date safely.
    const seen = (() => {
      try { return localStorage.getItem(todayKey()); } catch { return null; }
    })();
    if (seen) {
      setDismissed(true);
      return;
    }
    const s = suggestTodaysTheme(savedTheme);
    if (!s || s === theme) {
      // No reasonable suggestion (already on the theme of the day, or
      // the active set is empty); don't show.
      setDismissed(true);
      return;
    }
    setSuggestion(s);
    setDismissed(false);
  }, [savedTheme, theme]);

  function markSeen(value: "tried" | "kept" | "dismissed") {
    try { localStorage.setItem(todayKey(), value); } catch {}
  }

  function tryIt() {
    if (!suggestion) return;
    setTheme(suggestion, { persist: false });
    markSeen("tried");
  }

  function keepIt() {
    if (!suggestion) return;
    setTheme(suggestion, { persist: true });
    markSeen("kept");
    setDismissed(true);
  }

  function dismiss() {
    if (isPreviewing && savedTheme) {
      // Revert to the user's persisted choice.
      setTheme(savedTheme, { persist: true });
    }
    markSeen("dismissed");
    setDismissed(true);
  }

  if (dismissed || !suggestion) return null;

  const meta = THEMES.find((t) => t.id === suggestion);
  if (!meta) return null;
  const [card, accent, fg] = SWATCH[suggestion];
  const isLimited = "limited" in meta && meta.limited;

  return (
    <div
      className={cn(
        "relative mb-5 rounded-2xl border p-4 sm:p-5 flex items-center gap-4 overflow-hidden",
        "border-brand-200 bg-card",
      )}
      role="region"
      aria-label="Theme of the day"
    >
      {/* Soft brand wash, lower-left */}
      <div
        className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full pointer-events-none opacity-60"
        style={{ background: `radial-gradient(circle, ${accent}26 0%, transparent 70%)` }}
        aria-hidden
      />
      {/* Swatch */}
      <span
        className="relative shrink-0 inline-block overflow-hidden border border-line shadow-sm"
        style={{
          width: 44, height: 44, background: card,
          borderRadius: suggestion === "hitech" ? 6 : 14,
        }}
        aria-hidden
      >
        <span className="absolute inset-y-0 left-0" style={{ width: "45%", background: accent }} />
        <span className="absolute right-1.5 top-1.5 w-2 h-2 rounded-full" style={{ background: fg }} />
      </span>

      {/* Copy */}
      <div className="min-w-0 flex-1 relative">
        <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-subtle inline-flex items-center gap-1">
          <Sparkles size={11} className="text-brand-600" />
          Today&apos;s theme
          {isLimited && (
            <span
              className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold tracking-[0.18em] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200"
              title={"endsOn" in meta && meta.endsOn ? `Available until ${meta.endsOn}` : "Limited"}
            >
              Limited
            </span>
          )}
        </p>
        <h3 className="text-base font-semibold text-fg leading-snug mt-0.5">
          {meta.name}
        </h3>
        <p className="text-xs text-muted leading-snug mt-0.5">{meta.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 relative">
        {!isPreviewing ? (
          <button
            type="button"
            onClick={tryIt}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white"
          >
            Try it
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={keepIt}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white"
            >
              <Check size={11} /> Keep it
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-line text-muted hover:text-fg hover:border-line-strong"
            >
              Maybe later
            </button>
          </>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss theme suggestion"
          className="p-1.5 rounded-full text-subtle hover:text-fg hover:bg-elevated"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
