"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

/**
 * Theme registry. Each entry has:
 *   • id          — DOM data-theme attribute, also localStorage value
 *   • name        — user-facing label
 *   • description — picker tooltip
 *   • category    — "classic" / "flavour" / "limited" — drives the
 *                   picker's section grouping
 *   • endsOn      — optional ISO date; theme is hidden after that day
 *                   (used for limited-time / seasonal themes like Sakura)
 *   • limited     — optional flag rendered as a pill in the picker
 */
export const THEMES = [
  // Classic — foundational themes, always present.
  // Descriptions: ONE punchy sentence each. The picker dropdown
  // shows these inline; longer-form inspo lives in /themes.
  {
    id: "light",
    name: "Daydream",
    description: "Near-white surfaces, ink-blue accents — the platform's default light theme, made for focus that disappears.",
    category: "classic",
  },
  {
    id: "hitech",
    name: "Voltage",
    description: "Neon cyan on near-black — cyberpunk-hour dark mode. Default when your OS is dark.",
    category: "classic",
  },
  {
    id: "rosalind",
    name: "Rosalind",
    description: "Parchment, sage, italic serif. Named for Rosalind Franklin — the crystallographer behind Photograph 51.",
    category: "classic",
  },

  // Flavours — sensory / atmospheric themes.
  {
    id: "icecream",
    name: "Summer Ice Cream",
    description: "Pastel scoops on vanilla — the parlor counter on a hot afternoon. Work shouldn't always look like work.",
    category: "flavour",
  },
  {
    id: "greenwood",
    name: "Greenwood",
    description: "A forest that shifts with your local hour — mist at dawn, dappled noon, golden dusk, fireflies after dark.",
    category: "flavour",
  },
  // Removed (2026-05-27): "atompunk" (Atom Punk) and "aurora" (Aurora)
  // themes. The registry filters them out of the picker, and the
  // localStorage migration in resolveSavedTheme below drops anyone
  // whose saved value points at one of the retired ids — they fall
  // back to the default theme on next load. CSS for both themes
  // remains in globals.css for now (harmless dead style blocks) until
  // a follow-up cleanup pass.

  // Limited-time / seasonal.
  {
    id: "sakura",
    name: "Sakura",
    description: "Cherry-blossom blush + cream — hanami in the browser. Limited time, like the blossoms.",
    category: "limited",
    endsOn: "2026-05-31",
    limited: true,
  },
  {
    id: "artdeco",
    name: "Promenade",
    description: "Powdered Art Deco — apricot, sea-glass teal and sage over warm cream, with crisp geometric edges, a soft sunburst crown and fine line-work. A softer take on the 1925 palette for its 2025 centenary. A limited June engagement.",
    category: "limited",
    endsOn: "2026-06-30",
    limited: true,
  },
  {
    id: "canada",
    name: "O Canada",
    description: "Maple red on fresh white — a Canada Day salute, with maple leaves drifting past. From sea to sea. A limited July engagement.",
    category: "limited",
    endsOn: "2026-07-31",
    limited: true,
  },
  {
    id: "endofsummer",
    name: "End of Summer",
    description: "Sun-bleached linen and low amber light, with seed fluff on the breeze — the last warm weeks, held. A limited August engagement.",
    category: "limited",
    endsOn: "2026-08-31",
    limited: true,
  },
  {
    id: "harvest",
    name: "Harvest",
    description: "Rust, burgundy and goldenrod on warm oat, with leaves drifting down over a low woodsmoke haze. A limited fall engagement.",
    category: "limited",
    endsOn: "2026-11-30",
    limited: true,
  },
] as const;

/** Display labels for each category — surfaced as section headers
 *  in the theme picker. */
export const THEME_CATEGORIES = {
  classic:  { label: "Classic",   subtitle: "The foundation library" },
  flavour:  { label: "Flavours",  subtitle: "Sensory and atmospheric" },
  limited:  { label: "Limited time", subtitle: "Available for a while" },
} as const;
export type ThemeCategory = keyof typeof THEME_CATEGORIES;

export type ThemeId = (typeof THEMES)[number]["id"];

/** Themes still inside their availability window. Expired limited-time
 *  themes drop out (so the picker doesn't show a theme nobody can keep
 *  using past the expiry). */
export function activeThemes(now: Date = new Date()) {
  return THEMES.filter((t) => {
    if (!("endsOn" in t) || !t.endsOn) return true;
    return new Date(t.endsOn + "T23:59:59").getTime() >= now.getTime();
  });
}

interface ThemeContextValue {
  theme: ThemeId;
  /** Switch theme. `persist=false` applies the theme for this session
   *  only — no localStorage write — used by the daily-fresh "try" flow
   *  so users can preview without committing. */
  setTheme: (t: ThemeId, opts?: { persist?: boolean }) => void;
  /** True when the active theme isn't the one persisted to storage —
   *  i.e. the user is in a "previewing" state. The daily-fresh card
   *  uses this to decide whether to show "Keep" / "Revert" actions. */
  isPreviewing: boolean;
  /** Whatever's persisted in localStorage (or null if none) — used so
   *  callers can revert from a preview to the user's saved choice. */
  savedTheme: ThemeId | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  isPreviewing: false,
  savedTheme: null,
});

const STORAGE_KEY = "bhn-theme";

/** The theme every public application form renders in, whatever the
 *  visitor's OS or saved preference says. */
export const FORCED_PUBLIC_THEME = "hitech";

/** Surfaces an outside applicant sees, which are always FORCED_PUBLIC_THEME. */
export function isForcedThemeRoute(pathname: string): boolean {
  return pathname.startsWith("/apply/");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("light");
  const [savedTheme, setSavedTheme] = useState<ThemeId | null>(null);

  useEffect(() => {
    /*
     * The pre-paint script already pinned the public forms to dark. This
     * effect used to overwrite that from localStorage a moment later, so
     * a staff member with a saved light theme saw the applicant form in
     * light — the script won, then lost. Bail before touching anything.
     */
    if (isForcedThemeRoute(window.location.pathname)) {
      document.documentElement.dataset.theme = FORCED_PUBLIC_THEME;
      return;
    }
    const saved = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) as ThemeId | null;
    const allowedNow = activeThemes().map((t) => t.id);
    if (saved && (allowedNow as string[]).includes(saved)) {
      setThemeState(saved);
      setSavedTheme(saved);
      document.documentElement.dataset.theme = saved;
    } else {
      // Saved theme is missing OR has expired (e.g. Sakura past May 31) —
      // drop it and fall back to OS preference.
      if (saved) {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // Voltage (formerly Hi-Tech / id stays "hitech" for back-compat
      // with existing localStorage values) is the new dark-mode
      // default — Nightfall was removed from the registry.
      const initial: ThemeId = prefersDark ? "hitech" : "light";
      setThemeState(initial);
      setSavedTheme(null);
      document.documentElement.dataset.theme = initial;
    }
  }, []);

  function setTheme(t: ThemeId, opts?: { persist?: boolean }) {
    const persist = opts?.persist ?? true;
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, t); } catch {}
      setSavedTheme(t);
    }
    try {
      // Only fire analytics if the user has opted in.
      const consentRaw = localStorage.getItem("bhn-consent");
      const okay = consentRaw && JSON.parse(consentRaw)?.analytics === true;
      if (okay) {
        const body = JSON.stringify({
          name: "theme_change",
          path: location.pathname,
          props: { theme: t, persist },
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/analytics/track", new Blob([body], { type: "application/json" }));
        }
      }
    } catch {}
  }

  const isPreviewing = savedTheme !== null && theme !== savedTheme;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isPreviewing, savedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeScript() {
  // Whitelist mirrors THEMES above. If the user has a retired theme
  // saved in localStorage (e.g. "aurora", "modern", "pink"), drop it
  // and fall back to OS preference so we never set data-theme to a
  // value that has no CSS variables defined.
  //
  // We can't import activeThemes() in this server-rendered script, so
  // we compute the active set inline with the same rule (drop themes
  // whose endsOn ISO date has passed).
  const activeIds = activeThemes().map((t) => t.id);
  const allowedJson = JSON.stringify(activeIds);
  // Migration: users who had the retired "dark" theme saved are
  // mapped to "hitech" (Voltage) so they keep their dark-mode look
  // instead of being kicked back to light.
  /*
   * Public application forms are always dark.
   *
   * /apply/* is the one surface an outside applicant sees, and it should
   * look the same for all of them — not light for one and a seasonal
   * theme for the next because of what their laptop prefers or what a
   * staff member once picked on this browser. There is no theme picker
   * on those pages, so this is the whole of "they cannot choose it".
   *
   * Decided here rather than in the page so it is applied before first
   * paint: setting it later would flash light and then correct itself.
   * A saved theme is deliberately read but not applied — staff keep
   * their choice everywhere else in the same browser.
   */
  const code = `(function(){try{var forced=location.pathname.indexOf('/apply/')===0;if(forced){document.documentElement.setAttribute('data-theme','${FORCED_PUBLIC_THEME}');return;}var allow=${allowedJson};var s=localStorage.getItem('${STORAGE_KEY}');if(s==='dark'){s='hitech';try{localStorage.setItem('${STORAGE_KEY}','hitech');}catch(_){}}var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s&&allow.indexOf(s)>=0)?s:(d?'hitech':'light');if(s&&allow.indexOf(s)<0){try{localStorage.removeItem('${STORAGE_KEY}');}catch(_){}}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

/**
 * Pick a "theme of the day" suggestion. The current limited-time theme
 * preempts as long as it's in its availability window (lets us highlight
 * the seasonal drop); once it expires we rotate through the rest of the
 * registry by day-of-year. We skip the user's currently-saved theme so
 * the suggestion is always something different.
 */
export function suggestTodaysTheme(currentlySaved: ThemeId | null, now: Date = new Date()): ThemeId | null {
  const active = activeThemes(now);
  // Limited-time preempt — promote whichever seasonal drop is currently in
  // its window. Found by category rather than by id: this used to name
  // "canada" directly, so the preempt quietly stopped working the day that
  // theme expired and nobody noticed until the next drop was built.
  const featured = active.find((t) => t.category === "limited");
  if (featured && currentlySaved !== featured.id) return featured.id;

  const pool = active.map((t) => t.id).filter((id) => id !== currentlySaved);
  if (pool.length === 0) return null;
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000
  );
  return pool[dayOfYear % pool.length];
}
