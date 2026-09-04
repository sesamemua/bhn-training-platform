"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Palette, Check, Sparkles, ArrowRight } from "lucide-react";
import {
  useTheme, THEMES, activeThemes, THEME_CATEGORIES,
  type ThemeId, type ThemeCategory,
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
  harvest:    ["#f6eee1", "#9f482f", "#5b2735"],
};

// Each theme picks its own corner-roundness for the swatch, mirroring
// its own --radius scale so the picker previews the silhouette too.
const SWATCH_RADIUS: Record<ThemeId, string> = {
  light:      "10px",
  rosalind:   "14px",
  hitech:     "4px",
  sakura:     "14px",
  icecream:   "20px",
  greenwood:  "14px",
  artdeco:    "3px",
  canada:     "14px",
  endofsummer: "14px",
  harvest:    "14px",
};

function Swatch({ id, size = 24 }: { id: ThemeId; size?: number }) {
  const [card, accent, fg] = SWATCH[id];
  const radius = SWATCH_RADIUS[id];
  return (
    <span
      className="relative inline-block overflow-hidden border border-line shadow-sm"
      style={{ width: size, height: size, background: card, borderRadius: radius }}
    >
      <span
        className="absolute inset-y-0 left-0"
        style={{ width: "45%", background: accent }}
      />
      <span
        className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full"
        style={{ background: fg }}
      />
    </span>
  );
}

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = THEMES.find((t) => t.id === theme);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          // Compact mode uses min-h/min-w 44 px so the touch target
          // clears the WCAG 2.5.5 Level AAA threshold even though
          // the icon itself is 16 px.
          "flex items-center gap-2.5 rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
          compact
            ? "min-h-[44px] min-w-[44px] justify-center p-2 hover:bg-elevated text-muted hover:text-fg"
            : "px-3 py-2 w-full hover:bg-elevated text-muted hover:text-fg"
        )}
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Palette size={16} aria-hidden />
        {!compact && (
          <>
            <span className="flex-1 text-left">
              <span className="block leading-tight">Theme</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-subtle">
                {current?.name}
              </span>
            </span>
            <Swatch id={theme} size={22} />
          </>
        )}
      </button>

      {open && (
        <ThemeMenu
          theme={theme}
          onPick={(id) => { setTheme(id); setOpen(false); }}
        />
      )}
    </div>
  );
}

/**
 * Grouped theme menu — renders the three category sections (Classic /
 * Flavours / Limited time) with a small header per group. Items
 * inside a section are shown in registry order.
 *
 * Pulled out as its own component so the menu logic (sections,
 * active state, limited pill) doesn't crowd the trigger button code.
 */
function ThemeMenu({
  theme, onPick,
}: {
  theme: ThemeId;
  onPick: (id: ThemeId) => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<ThemeCategory, typeof THEMES[number][]> = {
      classic: [],
      flavour: [],
      limited: [],
    };
    for (const t of activeThemes()) {
      out[t.category as ThemeCategory].push(t);
    }
    return out;
  }, []);

  // Pick the FIRST limited-time theme the user hasn't already
  // selected — that's the candidate for the featured "try this
  // limited-time theme" promo at the top of the menu. (Currently
  // Sakura through 31 May 2026.)
  const featured = grouped.limited.find((t) => t.id !== theme) ?? null;

  // Categories rendered in this fixed order.
  const order: ThemeCategory[] = ["classic", "flavour", "limited"];

  return (
    <div
      // Wider (440px) so the now-one-line descriptions don't wrap
      // and pad row height. max-w-[92vw] keeps the menu inside the
      // viewport on narrow screens.
      className="absolute bottom-full left-0 mb-2 popover p-1.5 z-30 w-[440px] max-w-[92vw] max-h-[70vh] overflow-y-auto animate-fade-in"
      role="menu"
      aria-label="Choose theme"
    >
      {featured && (
        <FeaturedLimitedPromo
          theme={featured}
          onPick={onPick}
        />
      )}
      {order.map((cat) => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        const meta = THEME_CATEGORIES[cat];
        return (
          <div key={cat} className="mb-1.5 last:mb-0">
            {/* Single-line category header — subtitle dropped to halve
                the per-section vertical cost. Section meta.subtitle
                still appears on /themes if anyone wants the longer
                framing. */}
            <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
              {meta.label}
            </p>
            {items.map((t) => {
              const active = theme === t.id;
              const isLimited = "limited" in t && t.limited;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onPick(t.id)}
                  role="menuitemradio"
                  aria-checked={active}
                  className={cn(
                    "group/themerow w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    active ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-elevated"
                  )}
                >
                  <Swatch id={t.id} size={22} />
                  <span className="flex-1 min-w-0">
                    <span className={cn(
                      "flex items-center gap-1.5 text-[12.5px] font-medium leading-tight",
                      active ? "text-brand-700" : "text-fg"
                    )}>
                      {t.name}
                      {isLimited && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200"
                          title="Limited-time theme"
                        >
                          <Sparkles size={9} /> Limited
                        </span>
                      )}
                    </span>
                    {/* Description clamped to one line — short on
                        purpose; longer-form inspo lives on /themes. */}
                    <span className="block text-[10.5px] text-subtle leading-tight mt-0.5 line-clamp-1">
                      {t.description}
                    </span>
                  </span>
                  {active && (
                    <>
                      <Check size={13} className="text-brand-600 shrink-0" aria-hidden />
                      <span className="sr-only">Currently selected</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Discovery link — compact, single-line. */}
      <div className="border-t border-line mt-1.5 pt-1.5 px-1">
        <Link
          href="/themes"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11.5px] font-medium text-muted hover:bg-elevated hover:text-fg transition-colors"
        >
          <Sparkles size={11} className="text-brand-600 shrink-0" />
          <span className="flex-1">Vote on themes &amp; suggest a new one</span>
          <ArrowRight size={11} className="text-subtle shrink-0" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Featured promo card at the top of the picker dropdown for the
 * current limited-time theme. Replaces the dashboard's old
 * DailyThemeCard — discovery happens where the action does, so a
 * trainee who opens the palette sees the "try Sakura" CTA front-
 * and-centre instead of scrolling past it into the Limited
 * section. The card carries its own theme-coloured wash so it
 * pops on every base palette.
 */
function FeaturedLimitedPromo({
  theme: t,
  onPick,
}: {
  theme: typeof THEMES[number];
  onPick: (id: ThemeId) => void;
}) {
  const [card, accent, fg] = SWATCH[t.id];
  const endsOn = "endsOn" in t && t.endsOn ? t.endsOn : null;

  // "X days left" countdown — computed client-side from today's
  // calendar date so it stays accurate without a server round-trip.
  // Only renders inside the Try button (never as the headline copy)
  // so a stale value never becomes the focal text.
  let daysLeft: number | null = null;
  if (endsOn) {
    const end = new Date(endsOn + "T23:59:59").getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = end - today.getTime();
    daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  return (
    <div
      // Quieter ring + neutral card — the THEME's own accent does
      // the colour-work via the corner washes below, instead of a
      // global rose tint that fights the rest of the muted menu.
      className="relative mb-2 overflow-hidden rounded-2xl ring-1 ring-line bg-card"
      role="region"
      aria-label={`Featured limited-time theme: ${t.name}`}
    >
      {/* Theme-coloured corner washes — softened from before, so
          the card hints at the theme's palette without competing
          with the rest of the menu. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-30"
        style={{ background: accent }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-10 w-24 h-24 rounded-full blur-2xl opacity-15"
        style={{ background: fg }}
      />

      {/* Single-row layout: swatch · name + tagline · Try CTA.
          Half the height of the previous stacked card; works because
          the wider dropdown gives horizontal room for the lockup. */}
      <div className="relative p-2.5 flex items-center gap-2.5">
        <span
          className="relative shrink-0 inline-block overflow-hidden border border-line shadow-sm"
          style={{
            width: 38, height: 38,
            background: card,
            borderRadius: SWATCH_RADIUS[t.id],
          }}
          aria-hidden
        >
          <span className="absolute inset-y-0 left-0" style={{ width: "45%", background: accent }} />
          <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full" style={{ background: fg }} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[12.5px] font-bold text-fg leading-tight truncate">
              Try {t.name}
            </h3>
            <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold uppercase tracking-[0.16em] px-1 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
              <Sparkles size={8} aria-hidden /> Limited
            </span>
          </div>
          <p className="text-[10.5px] text-muted leading-tight mt-0.5 line-clamp-1">
            {t.description}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onPick(t.id)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-brand-600 hover:bg-brand-700 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
        >
          <Sparkles size={10} aria-hidden />
          Try
          {daysLeft != null && (
            <span className="font-mono font-normal opacity-80">
              · {daysLeft === 0 ? "last day" : `${daysLeft}d`}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export function ThemeCycler() {
  const { theme, setTheme } = useTheme();
  function cycle() {
    const idx = THEMES.findIndex((t) => t.id === theme);
    setTheme(THEMES[(idx + 1) % THEMES.length].id);
  }
  return (
    <button
      type="button"
      onClick={cycle}
      // Same 44 px floor as ThemePicker so the swatch button is a
      // legit touch target on mobile.
      className="min-h-[44px] min-w-[44px] justify-center p-2 rounded-xl text-muted hover:bg-elevated hover:text-fg transition-colors flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
      aria-label="Cycle theme"
      title={`Theme: ${theme}`}
    >
      <Swatch id={theme} size={18} />
    </button>
  );
}
