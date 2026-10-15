"use client";
/**
 * Pumpkin (Halloween) atmosphere — bats crossing the screen over a low
 * dusk-purple fog, with a caption cycling October observations. Same
 * mounting contract as the other atmospheres: fixed, pointer-events-none,
 * aria-hidden, nothing for any other theme, and nothing moving under
 * prefers-reduced-motion (the palette stays).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTheme } from "@/components/ui/ThemeProvider";

const BAT_COUNT = 7;
const CAPTIONS = [
  "porch lights and paper bats",
  "the pumpkins are carved",
  "dark by six, candles lit",
  "a cold wind through the leaves",
  "costumes in the lab coat closet",
  "something rustled in the hedge",
  "the last of the candy corn",
  "fog on the playing fields",
];

/** Prefers-reduced-motion, read as a live value rather than set from an effect. */
function useReducedMotion() {
  return useSyncExternalStore(
    (on) => { const mq = window.matchMedia("(prefers-reduced-motion: reduce)"); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}
/** A fixed scatter (0–1) for item i, property k: varied, but the same on every render. */
const scatter = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

export function PumpkinAtmosphere() {
  const { theme } = useTheme();
  const isActive = theme === "pumpkin";
  const reducedMotion = useReducedMotion();
  const [captionIdx, setCaptionIdx] = useState(0);

  useEffect(() => {
    if (!isActive || reducedMotion) return;
    const id = setInterval(() => setCaptionIdx((i) => (i + 1) % CAPTIONS.length), 18_000);
    return () => clearInterval(id);
  }, [isActive, reducedMotion]);

  // A fixed scatter: each bat its own height, speed, start and size.
  const bats = useMemo(
    () => Array.from({ length: BAT_COUNT }, (_, i) => ({
      id: i,
      top: 6 + scatter(i, 1) * 55,
      delay: scatter(i, 2) * 30,
      duration: 18 + scatter(i, 3) * 16,
      bob: 12 + scatter(i, 4) * 30,
      size: 18 + scatter(i, 5) * 18,
      flap: 0.32 + scatter(i, 6) * 0.25,
      opacity: 0.35 + scatter(i, 7) * 0.35,
      reverse: scatter(i, 8) < 0.4,
    })),
    [],
  );

  if (!isActive || reducedMotion) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      <div className="pumpkin-fog" />
      {bats.map((b) => (
        <span
          key={b.id}
          className={`pumpkin-bat ${b.reverse ? "pumpkin-bat-reverse" : ""}`}
          style={{
            top: `${b.top}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.duration}s`,
            ["--bat-bob" as string]: `${b.bob}px`, width: b.size, height: b.size * 0.5, opacity: b.opacity,
          }}
        >
          <svg viewBox="0 0 64 32" width="100%" height="100%" className="pumpkin-bat-wings" style={{ animationDuration: `${b.flap}s` }}>
            <path
              fill="currentColor"
              d="M32 10c-2-3-4-4-5-3-1 1 0 3-1 4-3-6-10-9-18-8 4 2 6 6 6 9-2-1-5-1-7 1 3 1 6 3 7 6 3-2 7-2 10 1 1-3 4-5 6-5 1 3 2 5 2 7 0-2 1-4 2-7 2 0 5 2 6 5 3-3 7-3 10-1 1-3 4-5 7-6-2-2-5-2-7-1 0-3 2-7 6-9-8-1-15 2-18 8-1-1 0-3-1-4-1-1-3 0-5 3z"
            />
          </svg>
        </span>
      ))}
      <div className="seasonal-caption pumpkin-caption">
        <span key={captionIdx} className="seasonal-caption-text">{CAPTIONS[captionIdx]}</span>
      </div>
    </div>
  );
}
