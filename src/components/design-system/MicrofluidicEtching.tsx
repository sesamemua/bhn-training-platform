"use client";
/**
 * The microfluidic chip etched into the page header — channels,
 * serpentine mixers, chambers, a T-junction and a droplet generator —
 * now with fluid moving through it: the brand-coloured runs flow along
 * their channels, the chamber slowly fills and empties, and droplets
 * leave the generator one after another.
 *
 * One tile (480 × 180) drawn once in <defs> and placed in a grid with
 * <use>, so the animation is written once and runs in every copy. SMIL
 * rather than CSS, because it animates inside reused content in every
 * browser. Under prefers-reduced-motion the same etching is drawn
 * still.
 *
 * It fades out toward the left so it never sits behind the title, and
 * is held back further on narrow screens where the text runs the full
 * width.
 */
import { useSyncExternalStore } from "react";

const COLS = 6;
const ROWS = 3;
const TILE_W = 480;
const TILE_H = 180;
const FLUID = "var(--brand-400, #38bdf8)";

/** Paths the fluid runs along, and how long one pulse takes to travel. */
const FLOWS = [
  { d: "M0 50 H60 V26 H78 V74 H96 V26 H114 V74 H132 V50 H170", dur: 3.2 },
  { d: "M210 50 H260 V130 H300 V150 H318 V110 H336 V150 H354 V110 H372 V130 H480", dur: 4.4 },
  { d: "M0 130 H100", dur: 2.2 },
  { d: "M160 130 H260", dur: 2.2 },
];

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => { const mq = window.matchMedia("(prefers-reduced-motion: reduce)"); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

export function MicrofluidicEtching() {
  const still = useReducedMotion();
  const fade = "linear-gradient(90deg, transparent 0%, transparent 18%, rgba(0,0,0,0.2) 45%, #000 75%)";
  return (
    // The fade is measured against the header, so it sits on the wrapper, not on the (wider) drawing.
    <div className="absolute inset-0 overflow-hidden opacity-45 lg:opacity-100" style={{ maskImage: fade, WebkitMaskImage: fade }}>
    <svg
      className="absolute left-0 top-0"
      width={COLS * TILE_W}
      height={ROWS * TILE_H}
      viewBox={`0 0 ${COLS * TILE_W} ${ROWS * TILE_H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: "none" }}
    >
      <defs>
        <g id="ds-microfluidic-tile">
          {/* Channels: a dark groove with a lighter lip, so they read as cut into the surface. */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <g stroke="#0c0d0f" strokeWidth="5" opacity="0.55">
              <path d="M0 50 H60 V26 H78 V74 H96 V26 H114 V74 H132 V50 H170" />
              <path d="M210 50 H360 M260 50 V130 M345 20 V80 M360 50 H480" />
              <path d="M0 130 H100 M160 130 H300 V150 H318 V110 H336 V150 H354 V110 H372 V130 H480" />
            </g>
            <g stroke="#8b949e" strokeWidth="1.25" opacity="0.5">
              <path d="M0 50 H60 V26 H78 V74 H96 V26 H114 V74 H132 V50 H170" />
              <path d="M210 50 H360 M260 50 V130 M345 20 V80 M360 50 H480" />
              <path d="M0 130 H100 M160 130 H300 V150 H318 V110 H336 V150 H354 V110 H372 V130 H480" />
              <circle cx="190" cy="50" r="20" />
              <rect x="100" y="116" width="60" height="28" rx="14" />
              <circle cx="345" cy="15" r="5" />
              <circle cx="345" cy="85" r="5" />
            </g>

            {/* Fluid: short pulses travelling along the channels. */}
            <g stroke={FLUID} strokeWidth="2" opacity="0.7">
              {FLOWS.map((f, i) => (
                <path key={i} d={f.d} strokeDasharray="14 22">
                  {!still && <animate attributeName="stroke-dashoffset" from="0" to="-36" dur={`${f.dur / 3}s`} repeatCount="indefinite" />}
                </path>
              ))}
            </g>
          </g>

          {/* The reaction chamber filling and emptying. */}
          <circle cx="190" cy="50" r="13" fill={FLUID} fillOpacity="0.16" stroke={FLUID} strokeOpacity="0.55" strokeWidth="2">
            {!still && <animate attributeName="r" values="8;14;8" dur="5s" repeatCount="indefinite" />}
            {!still && <animate attributeName="fill-opacity" values="0.08;0.26;0.08" dur="5s" repeatCount="indefinite" />}
          </circle>

          {/* Droplets pinched off at the generator and carried downstream. */}
          <g fill={FLUID} opacity="0.75">
            {[0, 1, 2, 3, 4].map((n) => (
              still
                ? <circle key={n} cx={378 + n * 22} cy="50" r="3" />
                : (
                  <circle key={n} r="3" cx="0" cy="0">
                    <animateMotion path="M348 50 H480" dur="3.5s" begin={`${-n * 0.7}s`} repeatCount="indefinite" />
                  </circle>
                )
            ))}
          </g>

          {/* Junction nodes. */}
          <g fill="#8b949e" opacity="0.55">
            <circle cx="260" cy="50" r="2.5" />
            <circle cx="260" cy="130" r="2.5" />
            <circle cx="345" cy="50" r="2.5" />
          </g>
        </g>
      </defs>
      {Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => <use key={`${r}-${c}`} href="#ds-microfluidic-tile" x={c * TILE_W} y={r * TILE_H} />),
      )}
    </svg>
    </div>
  );
}
