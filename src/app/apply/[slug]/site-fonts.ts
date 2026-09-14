/**
 * The biohubnet.ca faces, for forms drawn in the site skin.
 *
 * The same three the symposium page loads: Libre Baskerville for titles,
 * IBM Plex Sans for reading, IBM Plex Mono for eyebrows and buttons.
 *
 * `preload: false` because this route is shared. Every /apply/<slug> page
 * imports this module, v1 included, and a preload tag makes the browser
 * fetch the file whether or not anything on the page uses it. Without one,
 * a face downloads only when an element asks for it — which only happens
 * under `.bhn-site`. The price is a brief swap on the v2 page, kept small
 * by next/font's metric-matched fallbacks.
 *
 * Only the CSS variables are used, never `.className`: site-theme.css
 * decides where each face goes, so the variables are all the page needs.
 */
import { IBM_Plex_Mono, IBM_Plex_Sans, Libre_Baskerville } from "next/font/google";

export const bhnSerif = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bhn-serif",
  preload: false,
});

export const bhnSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bhn-sans",
  preload: false,
});

export const bhnMono = IBM_Plex_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bhn-mono",
  preload: false,
});

/** The three variable classes, for the element that carries `.bhn-site`. */
export const SITE_FONT_VARIABLES = `${bhnSerif.variable} ${bhnSans.variable} ${bhnMono.variable}`;
