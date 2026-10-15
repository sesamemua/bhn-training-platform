"use client";
/**
 * Winter atmosphere — snow coming down over a low frost haze, with a
 * caption cycling winter observations. Same mounting contract as the
 * other atmospheres: fixed, pointer-events-none, aria-hidden, nothing
 * at all for any other theme, and nothing moving under
 * prefers-reduced-motion (the palette stays).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTheme } from "@/components/ui/ThemeProvider";

const FLAKE_COUNT = 26;
const CAPTIONS = [
  "first snow, quiet streets",
  "breath you can see",
  "the light gone by four thirty",
  "boots by the door",
  "frost on the lab windows",
  "a hot drink between experiments",
  "salt on every sidewalk",
  "the hush after a snowfall",
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

export function WinterAtmosphere() {
  const { theme } = useTheme();
  const isActive = theme === "winter";
  const reducedMotion = useReducedMotion();
  const [captionIdx, setCaptionIdx] = useState(0);

  useEffect(() => {
    if (!isActive || reducedMotion) return;
    const id = setInterval(() => setCaptionIdx((i) => (i + 1) % CAPTIONS.length), 18_000);
    return () => clearInterval(id);
  }, [isActive, reducedMotion]);

  // A fixed scatter, so the flakes keep their composited layers between renders.
  const flakes = useMemo(
    () => Array.from({ length: FLAKE_COUNT }, (_, i) => ({
      id: i,
      left: scatter(i, 1) * 100,
      delay: scatter(i, 2) * 24,
      duration: 14 + scatter(i, 3) * 16,
      sway: 20 + scatter(i, 4) * 60,
      size: 4 + scatter(i, 5) * 9,
      opacity: 0.45 + scatter(i, 6) * 0.45,
      star: scatter(i, 7) < 0.35,
    })),
    [],
  );

  if (!isActive || reducedMotion) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      <div className="winter-frost" />
      {flakes.map((f) => (
        <span
          key={f.id}
          className="winter-flake"
          style={{
            left: `${f.left}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s`,
            ["--flake-sway" as string]: `${f.sway}px`, width: f.size, height: f.size, opacity: f.opacity,
          }}
        >
          {f.star ? (
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
            </svg>
          ) : null}
        </span>
      ))}
      <div className="seasonal-caption winter-caption">
        <span key={captionIdx} className="seasonal-caption-text">{CAPTIONS[captionIdx]}</span>
      </div>
    </div>
  );
}
