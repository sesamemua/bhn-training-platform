"use client";
/**
 * The microfluidic chips etched into the page header — each one running
 * an assay, start to finish, rather than looping the same pulse:
 *
 *   1. sample  — the sample is drawn in from its inlet
 *   2. reagent — a reagent arrives at the T-junction from above
 *   3. mix     — the two travel the serpentine mixer together
 *   4. load    — the reaction chamber fills
 *   5. react   — it incubates, and comes out positive (it turns green)
 *                or negative (it greys)
 *   6. droplets— oil pinches the product into droplets, which run past
 *                the detector; it flashes for each positive droplet
 *   7. flush   — the chip clears, rests, and starts a new run
 *
 * Every run is its own: a different reagent, a different result, a
 * different number of droplets, different pauses — and every chip on
 * the header runs on its own clock, so the field is never in step.
 *
 * Driven by timers and CSS transitions (timers keep going in a
 * background tab; animation frames do not). Under prefers-reduced-motion
 * the chips are drawn still, mid-run. Fades out toward the left so it
 * never sits behind the title.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

const COLS = 4;
const ROWS = 3;
const W = 480;
const H = 150;

const P = {
  sample: "M29 60 H110",
  reagent: "M110 23 V60",
  mixer: "M110 60 H130 V38 H148 V82 H166 V38 H184 V82 H202 V60 H244",
  link: "M284 60 H330",
  oilTop: "M330 27 V60",
  oilBottom: "M330 93 V60",
  outlet: "M330 60 H470",
};
const SAMPLE = "var(--brand-400, #38bdf8)";
const REAGENTS = ["#f2b45a", "#f472b6", "#c084fc"];
const POSITIVE = "#34d399";
const NEGATIVE = "#8b949e";
const OIL = "#9aa4ae";

type Stage = "idle" | "sample" | "reagent" | "mix" | "load" | "react" | "droplets" | "flush";
interface Run { reagent: string; positive: boolean; drops: number }

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => { const mq = window.matchMedia("(prefers-reduced-motion: reduce)"); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

const ORDER: Stage[] = ["sample", "reagent", "mix", "load", "react", "droplets", "flush", "idle"];
const reached = (stage: Stage, step: Stage) => stage !== "idle" && ORDER.indexOf(stage) >= ORDER.indexOf(step);

/** A channel the fluid fills along its length. */
function Fill({ d, color, on, ms }: { d: string; color: string; on: boolean; ms: number }) {
  return (
    <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray="1 1" style={{ strokeDashoffset: on ? 0 : 1, transition: `stroke-dashoffset ${ms}ms ease-in-out` }} />
  );
}

/** One chip, running its assays one after another. */
function Chip({ x, y, still }: { x: number; y: number; still: boolean }) {
  const [stage, setStage] = useState<Stage>(still ? "react" : "idle");
  const [run, setRun] = useState<Run>({ reagent: REAGENTS[0], positive: true, drops: 4 });
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const go = (s: Stage, ms: number, next: () => void) => { if (!alive) return; setStage(s); timer = setTimeout(next, ms); };
    const start = () => {
      // A new run: its own reagent, result and droplet count.
      const r: Run = { reagent: REAGENTS[Math.floor(Math.random() * REAGENTS.length)], positive: Math.random() < 0.6, drops: 3 + Math.floor(Math.random() * 4) };
      setRun(r);
      setCycle((c) => c + 1);
      go("sample", 1400, () =>
        go("reagent", 1200, () =>
          go("mix", 1900, () =>
            go("load", 1500, () =>
              go("react", 1800 + Math.random() * 1200, () =>
                go("droplets", 2400 + r.drops * 450 + 500, () =>
                  go("flush", 1100, () =>
                    go("idle", 2500 + Math.random() * 6000, start))))))));
    };
    timer = setTimeout(start, 400 + Math.random() * 9000);
    return () => { alive = false; clearTimeout(timer); };
  }, [still]);

  const mixColor = `color-mix(in srgb, ${SAMPLE} 50%, ${run.reagent})`;
  const result = run.positive ? POSITIVE : NEGATIVE;
  const reacted = reached(stage, "react");
  const flushing = stage === "flush" || stage === "idle";

  return (
    <g transform={`translate(${x} ${y})`}>
      {/* The etching: grooves with a lighter lip, ports, the chamber and the detector window. */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#0c0d0f" strokeWidth="5" opacity="0.55">
          {Object.values(P).map((d) => <path key={d} d={d} />)}
        </g>
        <g stroke="#8b949e" strokeWidth="1.25" opacity="0.5">
          {Object.values(P).map((d) => <path key={d} d={d} />)}
          <circle cx="24" cy="60" r="5" />
          <circle cx="110" cy="18" r="5" />
          <circle cx="330" cy="22" r="5" />
          <circle cx="330" cy="98" r="5" />
          <circle cx="264" cy="60" r="20" />
          <rect x="420" y="50" width="14" height="20" rx="3" />
        </g>
      </g>

      {/* The run itself. Keyed by run, so a new run starts from an empty chip with no transition. */}
      <g key={cycle} style={{ opacity: flushing ? 0 : 1, transition: "opacity 900ms ease" }}>
        <Fill d={P.sample} color={SAMPLE} on={reached(stage, "sample")} ms={1200} />
        <Fill d={P.reagent} color={run.reagent} on={reached(stage, "reagent")} ms={1000} />
        <Fill d={P.mixer} color={mixColor} on={reached(stage, "mix")} ms={1700} />
        <circle cx="264" cy="60" r="16"
          style={{ fill: reacted ? result : mixColor, fillOpacity: reached(stage, "load") ? 0.5 : 0, transition: "fill 1200ms ease, fill-opacity 1200ms ease" }} />
        {stage === "react" && run.positive && (
          <circle cx="264" cy="60" r="19" fill="none" stroke={POSITIVE} strokeWidth="1.5" className="mf-incubate" />
        )}
        <Fill d={P.link} color={result} on={reached(stage, "droplets")} ms={500} />
        <Fill d={P.oilTop} color={OIL} on={reached(stage, "droplets")} ms={500} />
        <Fill d={P.oilBottom} color={OIL} on={reached(stage, "droplets")} ms={500} />
        {/* Droplets pinched off one after another, running past the detector to the outlet. */}
        {stage === "droplets" && Array.from({ length: run.drops }, (_, i) => (
          <circle key={i} cx="330" cy="60" r="3.5" fill={result} className="mf-drop" style={{ animationDelay: `${500 + i * 450}ms` }} />
        ))}
        {stage === "droplets" && run.positive && (
          <rect x="420" y="50" width="14" height="20" rx="3" fill={POSITIVE} className="mf-detect"
            style={{ animationDelay: `${500 + 1500}ms`, animationIterationCount: run.drops, animationDuration: "450ms" }} />
        )}
      </g>
    </g>
  );
}

export function MicrofluidicEtching() {
  const still = useReducedMotion();
  const fade = "linear-gradient(90deg, transparent 0%, transparent 18%, rgba(0,0,0,0.2) 45%, #000 75%)";
  return (
    // The fade is measured against the header, so it sits on the wrapper, not on the (wider) drawing.
    <div className="absolute inset-0 overflow-hidden opacity-45 lg:opacity-100" style={{ maskImage: fade, WebkitMaskImage: fade }}>
      <style>{`
        @keyframes mf-drop { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { transform: translateX(140px); opacity: 0; } }
        .mf-drop { opacity: 0; animation: mf-drop 2400ms linear forwards; }
        @keyframes mf-detect { 0%, 100% { fill-opacity: 0; } 50% { fill-opacity: 0.85; } }
        .mf-detect { fill-opacity: 0; animation-name: mf-detect; animation-timing-function: ease-in-out; animation-fill-mode: none; }
        @keyframes mf-incubate { 0%, 100% { stroke-opacity: 0.1; } 50% { stroke-opacity: 0.7; } }
        .mf-incubate { animation: mf-incubate 1200ms ease-in-out infinite; }
      `}</style>
      <svg className="absolute left-0 top-0" width={COLS * W} height={ROWS * H} viewBox={`0 0 ${COLS * W} ${ROWS * H}`}
        xmlns="http://www.w3.org/2000/svg" style={{ maxWidth: "none" }}>
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => <Chip key={`${r}-${c}`} x={c * W + (r % 2) * 120} y={r * H} still={still} />),
        )}
      </svg>
    </div>
  );
}
