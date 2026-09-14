/**
 * Which public form pages are drawn in the biohubnet.ca skin — decided
 * from the address alone.
 *
 * The theme on <html> has to be on the page before first paint, and the
 * only thing that runs that early is an inline script in the root layout.
 * It cannot read the database, so the list is in code. The form's own
 * `presentation.theme` still decides the markup under it (page.tsx); this
 * decides the ground that markup lands on.
 *
 * v1 of the Training Week form is deliberately NOT on the list. People
 * registered on it in the dark public theme, and it stays exactly that.
 *
 * Pure: no React, no DOM.
 */

/** Slugs, exactly as they appear in /apply/<slug>. */
export const SITE_THEMED_FORM_SLUGS = ["training-week-registration-2026-v2"] as const;

/**
 * The data-theme id for the site skin.
 *
 * Not a theme anybody picks, so it is never in THEMES: the picker must not
 * offer it, and a saved "bhnsite" in localStorage is dropped like any
 * other unknown id on every page this list does not cover.
 */
export const SITE_THEME = "bhnsite";

/** Every other public form, whatever the visitor's OS or saved choice says. */
export const PUBLIC_FORM_THEME = "hitech";

export type ForcedTheme = typeof SITE_THEME | typeof PUBLIC_FORM_THEME;

/** The theme a path is pinned to, or null for a path that follows the visitor. */
export function forcedThemeFor(pathname: string): ForcedTheme | null {
  // location.pathname never carries these, but a path handed over from a
  // router or a test might, and "…-v2?utm=luma" is still the v2 page.
  const path = pathname.split(/[?#]/)[0];
  if (!path.startsWith("/apply/")) return null;
  const slug = path.slice("/apply/".length).split("/")[0];
  return (SITE_THEMED_FORM_SLUGS as readonly string[]).includes(slug) ? SITE_THEME : PUBLIC_FORM_THEME;
}

/**
 * forcedThemeFor again, as ES5 source for the pre-paint script.
 *
 * Written out rather than taken from Function.prototype.toString: the
 * bundler is free to rename, down-level or minify the compiled function,
 * and this string is pasted into a <script> verbatim. Two copies of one
 * rule is how they drift, so tests/unit/site-theme.test.ts runs both over
 * the same paths and fails the moment they disagree.
 */
export const FORCED_THEME_SCRIPT =
  `function(p){p=String(p).split(/[?#]/)[0];if(p.indexOf('/apply/')!==0)return null;` +
  `var s=${JSON.stringify(SITE_THEMED_FORM_SLUGS)};` +
  `return s.indexOf(p.slice(7).split('/')[0])>=0?'${SITE_THEME}':'${PUBLIC_FORM_THEME}';}`;
