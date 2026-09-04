"use client";
/**
 * Harvest atmosphere layer — turns the fall theme from a static
 * rust-on-oat palette into leaves coming down over a woodsmoke haze.
 *
 * What it adds when `theme === "harvest"`:
 *
 *   • Falling leaves — a plain lobed leaf silhouette (not the Canadian
 *     maple outline CanadaAtmosphere uses, deliberately — the two
 *     falling-leaf themes share a tumble mechanic but shouldn't look
 *     like reskins of each other) in rust, burgundy, goldenrod and
 *     deep umber, each with its own duration, delay, sway amplitude,
 *     start angle, and scale.
 *
 *   • Woodsmoke haze — a low, slow-breathing brown-grey wash at the
 *     bottom of the viewport. Distinct from End of Summer's amber
 *     sun-haze and Canada's red leaf-drift mist: this one reads as
 *     smoke, not light.
 *
 *   • Scene caption (bottom-right) — short fall observations cycling
 *     every 18 s, matching the Sakura / Greenwood / Canada / End of
 *     Summer cadence.
 *
 * Follows the exact same mounting contract as the other atmospheres:
 * fixed, pointer-events-none, aria-hidden, and returns null under
 * prefers-reduced-motion (the palette stays, nothing moves).
 *
 * Mounted once inside <Providers>; bails immediately for every other
 * theme, so it costs nothing while inactive.
 */
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ui/ThemeProvider";

interface FallingLeaf {
  id: number;
  leftPct: number;
  delaySec: number;
  durationSec: number;
  startRotation: number;
  swayPx: number;
  scale: number;
  hue: string;
  opacity: number;
}

const LEAF_COUNT = 10;

/** Rust, burgundy, goldenrod, umber — the harvest brand ramp plus one
 *  burgundy note so the field doesn't read as pure orange. */
const HUES = [
  "#a3481c", // rust (brand-600)
  "#c76f2e", // warm rust (brand-400)
  "#6b1f1a", // burgundy
  "#833a17", // deep umber (brand-700)
  "#c4913a", // goldenrod
  "#8a2f1f", // wine-rust
];

/** Short fall observations. A phrase, not a sentence — ambient flavour,
 *  same register as the other atmospheres' captions. */
const CAPTIONS = [
  "leaves down, air sharper",
  "first woodsmoke of the year",
  "the light goes low by five",
  "sweaters out, windows cracked",
  "a leaf lets go without a sound",
  "the maples went first this year",
  "harvest tables, long shadows",
  "the last warm afternoon, probably",
];

export function HarvestAtmosphere() {
  const { theme } = useTheme();
  const isActive = theme === "harvest";

  const [reducedMotion, setReducedMotion] = useState(false);
  const [captionIdx, setCaptionIdx] = useState(0);
  const [captionEpoch, setCaptionEpoch] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isActive || reducedMotion) return;
    const id = setInterval(() => {
      setCaptionIdx((prev) => {
        if (CAPTIONS.length <= 1) return 0;
        let next = Math.floor(Math.random() * CAPTIONS.length);
        let guard = 0;
        while (next === prev && guard++ < 5) {
          next = Math.floor(Math.random() * CAPTIONS.length);
        }
        return next;
      });
      setCaptionEpoch((e) => e + 1);
    }, 18_000);
    return () => clearInterval(id);
  }, [isActive, reducedMotion]);

  /** Randomised once per mount, same reason the other atmospheres
   *  memoise: a re-shuffle on every render would break the browser's
   *  composited-layer reuse for the falling leaves. */
  const leaves = useMemo<FallingLeaf[]>(
    () =>
      Array.from({ length: LEAF_COUNT }, (_, i) => ({
        id: i,
        leftPct: Math.random() * 100,
        delaySec: Math.random() * 28,
        durationSec: 22 + Math.random() * 16,
        startRotation: Math.random() * 360,
        swayPx: 55 + Math.random() * 100,
        scale: 0.5 + Math.random() * 0.75,
        hue: HUES[Math.floor(Math.random() * HUES.length)],
        opacity: 0.6 + Math.random() * 0.3,
      })),
    [],
  );

  if (!isActive) return null;

  // Reduced-motion users still get the Harvest palette, just no
  // animation — the theme is fully functional, only static.
  if (reducedMotion) return null;

  return (
    <div
      aria-hidden
      className="harvest-atmosphere pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      {/* Woodsmoke — low, slow-breathing brown-grey wash. */}
      <div className="harvest-smoke" />

      {/* Falling leaves */}
      <div className="harvest-leaves">
        {leaves.map((leaf) => (
          <span
            key={leaf.id}
            className="harvest-leaf"
            style={
              {
                left: `${leaf.leftPct}%`,
                animationDelay: `${leaf.delaySec}s`,
                animationDuration: `${leaf.durationSec}s`,
                ["--leaf-sway"]: `${leaf.swayPx}px`,
                ["--leaf-start-rot"]: `${leaf.startRotation}deg`,
                ["--leaf-scale"]: leaf.scale,
                color: leaf.hue,
                opacity: leaf.opacity,
              } as React.CSSProperties
            }
          >
            {/* A plain lobed leaf: pointed oval body, a visible center
                vein, and a short stem — reads as "a leaf" at the small
                sizes these render at, without borrowing Canada's maple
                outline. */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.2C7.6 4.3 4 9 4 14.2 4 18.8 7.8 22 12 22s8-3.2 8-7.8C20 9 16.4 4.3 12 2.2Z"
                fill="currentColor"
              />
              <path
                d="M12 5.5V19"
                stroke="rgba(0,0,0,0.28)"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
              <path
                d="M12 22v3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
        ))}
      </div>

      {/* Scene caption — bottom-right, rotates every 18 s. Fresh React
          key on each rotation so the fade-in keyframe restarts. */}
      <div className="harvest-caption">
        <span aria-hidden className="harvest-caption-marker" />
        <span key={captionEpoch} className="harvest-caption-text">
          {CAPTIONS[captionIdx % CAPTIONS.length]}
        </span>
      </div>
    </div>
  );
}
