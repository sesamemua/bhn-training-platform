"use client";
/**
 * End of Summer atmosphere layer — turns the August theme from a static
 * amber-on-linen palette into a late-afternoon field.
 *
 * What it adds when `theme === "endofsummer"`:
 *
 *   • Drifting seed fluff — dandelion/milkweed seeds caught in low sun.
 *     Deliberately unlike Sakura's petals or Canada's tumbling maple
 *     leaves: fluff is buoyant, so these hang and wander sideways far
 *     more than they fall. Long durations, wide sway, high transparency.
 *
 *   • Horizon haze — a warm wash along the bottom of the viewport that
 *     breathes slowly, reading as heat still coming off the ground after
 *     the sun has dropped behind the trees.
 *
 *   • Scene caption (bottom-right) — short late-August observations
 *     cycling every 18 s, matching the Sakura / Greenwood / Canada
 *     cadence.
 *
 * No time-of-day logic — the theme *is* one hour of the day, held. It
 * follows the same mounting contract as the other atmospheres: fixed,
 * pointer-events-none, aria-hidden, and returns null under
 * prefers-reduced-motion (the palette stays, nothing moves).
 *
 * Mounted once inside <Providers>; bails immediately for every other
 * theme, so it costs nothing while inactive.
 */
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ui/ThemeProvider";

interface Seed {
  id: number;
  leftPct: number;
  delaySec: number;
  durationSec: number;
  swayPx: number;
  swaySec: number;
  scale: number;
  opacity: number;
  tint: string;
}

/** Fewer than Sakura's petals: fluff reads as sparse, and a crowded sky
 *  turns "wistful" into "snowstorm". */
const SEED_COUNT = 9;

/** Warm off-whites — seed fluff lit from behind by a low sun. */
const TINTS = ["#fffaf0", "#fdf1dc", "#f8e6c8", "#fff7e6"];

const CAPTIONS = [
  "the light goes gold at six",
  "cicadas winding down",
  "last of the long evenings",
  "sun behind the trees by eight",
  "seed fluff on the breeze",
  "warm ground, cooler air",
];

export function EndOfSummerAtmosphere() {
  const { theme } = useTheme();
  const [reduced, setReduced] = useState(false);
  const [caption, setCaption] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (theme !== "endofsummer" || reduced) return;
    const t = window.setInterval(() => setCaption((c) => (c + 1) % CAPTIONS.length), 18000);
    return () => window.clearInterval(t);
  }, [theme, reduced]);

  /** Randomised once per mount so the field doesn't re-shuffle on every
   *  render — the same reason the other atmospheres memoise. */
  const seeds = useMemo<Seed[]>(
    () =>
      Array.from({ length: SEED_COUNT }, (_, id) => ({
        id,
        leftPct: Math.round((id / SEED_COUNT) * 100 + (Math.random() * 12 - 6)),
        delaySec: Math.round(Math.random() * 26),
        // 26–46s: fluff takes its time.
        durationSec: 26 + Math.round(Math.random() * 20),
        swayPx: 30 + Math.round(Math.random() * 55),
        swaySec: 5 + Math.round(Math.random() * 5),
        scale: 0.65 + Math.random() * 0.7,
        opacity: 0.4 + Math.random() * 0.4,
        tint: TINTS[id % TINTS.length],
      })),
    [],
  );

  if (theme !== "endofsummer" || reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Heat still coming off the ground. */}
      <div
        className="eos-haze absolute inset-x-0 bottom-0 h-[38vh]"
        style={{
          background:
            "linear-gradient(to top, rgba(224,152,54,0.20), rgba(232,178,90,0.09) 45%, transparent)",
          filter: "blur(26px)",
        }}
      />

      {seeds.map((s) => (
        <div
          key={s.id}
          className="eos-seed-wrap absolute top-0"
          style={{
            left: `${s.leftPct}%`,
            animationDelay: `${s.delaySec}s`,
            animationDuration: `${s.durationSec}s`,
          }}
        >
          <div
            className="eos-seed"
            style={
              {
                "--eos-sway": `${s.swayPx}px`,
                animationDuration: `${s.swaySec}s`,
              } as React.CSSProperties
            }
          >
            {/* A seed: filament crown over a small dark achene. */}
            <svg
              width={26 * s.scale}
              height={26 * s.scale}
              viewBox="0 0 26 26"
              fill="none"
              style={{ opacity: s.opacity }}
            >
              <g stroke={s.tint} strokeWidth="1" strokeLinecap="round">
                {Array.from({ length: 9 }, (_, i) => {
                  const a = (i / 9) * Math.PI * 2;
                  return (
                    <line
                      key={i}
                      x1={13}
                      y1={11}
                      x2={13 + Math.cos(a) * 8.5}
                      y2={11 + Math.sin(a) * 8.5}
                    />
                  );
                })}
              </g>
              <line x1="13" y1="11" x2="13" y2="21" stroke={s.tint} strokeWidth="1" />
              <circle cx="13" cy="22" r="1.6" fill="#8a6a3c" />
            </svg>
          </div>
        </div>
      ))}

      <p
        key={caption}
        className="absolute bottom-5 right-6 text-[11px] font-medium tracking-wide"
        style={{ color: "rgba(107,89,66,0.72)", animation: "fadeIn 1.4s ease" }}
      >
        {CAPTIONS[caption]}
      </p>
    </div>
  );
}
