"use client";

/**
 * CellSplitGame — gamified interactive "split a cell" walkthrough
 * shown once per trainee on first login (`/welcome/split-a-cell`).
 * Admins can replay it freely via `?replay=1`.
 *
 * Eight stages, each gated on a single user click (except for
 * INCUBATE which auto-advances after a sped-up 3-second timer to
 * stand in for the real 3-minute incubation):
 *
 *   1.  CONFLUENT      — start screen, "your cells are ready"
 *   2.  ASPIRATE-MEDIA — pipette removes spent media
 *   3.  PBS-WASH       — pale cyan rinse to remove residual FBS
 *   4.  TRYPSIN        — green wash, cells start rounding up
 *   5.  INCUBATE       — timer counts 3:00 → 0:00 (sped to 3s)
 *   6.  NEUTRALIZE     — pink media flows in, FBS inactivates
 *                        the trypsin
 *   7.  ASPIRATE-CELLS — pipette draws the suspension up
 *   8.  RE-SEED        — new dish appears, a few cells dropped in
 *   ✓  COMPLETE        — confetti + welcome, button → /dashboard
 *
 * The dish + cell vocabulary mirrors MscCultureCycle so the
 * trainee already saw the same visual language on /login.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Beaker, FlaskConical, Pipette, Sparkles, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage =
  | "confluent"
  | "aspirateMedia"
  | "pbsWash"
  | "trypsin"
  | "incubate"
  | "neutralize"
  | "aspirateCells"
  | "reseed"
  | "complete";

const STAGE_ORDER: Stage[] = [
  "confluent",
  "aspirateMedia",
  "pbsWash",
  "trypsin",
  "incubate",
  "neutralize",
  "aspirateCells",
  "reseed",
  "complete",
];

/** Per-stage UI copy + the action-button label. */
const STAGE_COPY: Record<
  Stage,
  { title: string; lead: string; cta: string; pillLabel: string }
> = {
  confluent: {
    title: "Your cells are 80% confluent.",
    lead: "Time to passage them into a fresh flask. Click through each step — same protocol the lab follows.",
    cta: "Start passaging",
    pillLabel: "READY",
  },
  aspirateMedia: {
    title: "Aspirate the spent media.",
    lead: "The old growth media is full of waste products. Suck it out with the pipette before anything else.",
    cta: "Aspirate media",
    pillLabel: "STEP 1 / 6",
  },
  pbsWash: {
    title: "Rinse with PBS.",
    lead: "PBS washes off residual FBS. FBS would inactivate the trypsin in the next step — gotta clear it first.",
    cta: "Add PBS · rinse",
    pillLabel: "STEP 2 / 6",
  },
  trypsin: {
    title: "Add 0.25% trypsin.",
    lead: "The protease cuts the adhesion proteins anchoring your cells to the flask. They'll round up.",
    cta: "Add trypsin",
    pillLabel: "STEP 3 / 6",
  },
  incubate: {
    title: "Incubate at 37°C.",
    lead: "3 minutes in the incubator. Cells detach and float free. Hang tight.",
    cta: "Done — cells are loose",
    pillLabel: "STEP 4 / 6",
  },
  neutralize: {
    title: "Neutralize the trypsin.",
    lead: "Add complete media (with FBS) — the serum's protease inhibitors stop the digestion before it goes too far.",
    cta: "Add FBS media",
    pillLabel: "STEP 5 / 6",
  },
  aspirateCells: {
    title: "Aspirate the cell suspension.",
    lead: "Now you collect the cells. Pipette pulls the suspension up into its body.",
    cta: "Aspirate cells",
    pillLabel: "STEP 6 / 6",
  },
  reseed: {
    title: "Re-seed in a fresh flask.",
    lead: "Drop a smaller density into a new flask. You just bumped them to passage P1.",
    cta: "Re-seed",
    pillLabel: "ALMOST",
  },
  complete: {
    title: "You split your first cell.",
    lead: "That's the rhythm every MSC line follows — confluent, wash, trypsin, neutralize, transfer. Welcome to BioHubNet.",
    cta: "Enter the dashboard",
    pillLabel: "DONE",
  },
};

/** Same cell positions as MscCultureCycle so the visual language
 *  stays consistent. 28 positions, denser packed monolayer. */
const CELL_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 60, y: 116 }, { x: 110, y: 108 }, { x: 78, y: 148 }, { x: 124, y: 142 },
  { x: 92, y: 122 }, { x: 50, y: 138 }, { x: 100, y: 156 }, { x: 70, y: 130 },
  { x: 130, y: 124 }, { x: 44, y: 110 }, { x: 86, y: 134 }, { x: 116, y: 130 },
  { x: 58, y: 162 }, { x: 90, y: 168 }, { x: 122, y: 162 }, { x: 38, y: 152 },
  { x: 100, y: 138 }, { x: 138, y: 144 }, { x: 76, y: 168 }, { x: 64, y: 100 },
  { x: 96, y: 100 }, { x: 108, y: 174 }, { x: 30, y: 134 }, { x: 144, y: 124 },
  { x: 70, y: 178 }, { x: 130, y: 178 }, { x: 50, y: 172 }, { x: 86, y: 184 },
];

interface Props {
  firstName: string;
  /** Admin replay — game runs but the completion POST is skipped
   *  so the flag stays untouched. */
  replayMode: boolean;
}

export function CellSplitGame({ firstName, replayMode }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("confluent");
  const [busy, setBusy] = useState(false);

  // Incubation timer — sped-up 3-second countdown standing in for
  // the wet-lab 3-minute incubation. Counts 3:00 → 0:00; once it
  // hits zero, the action button enables and the user advances.
  const [incubateSeconds, setIncubateSeconds] = useState<number | null>(null);
  const incubateTimer = useRef<number | null>(null);
  useEffect(() => {
    if (stage !== "incubate") {
      setIncubateSeconds(null);
      if (incubateTimer.current) {
        window.clearInterval(incubateTimer.current);
        incubateTimer.current = null;
      }
      return;
    }
    // Each "10s of wet-lab time" = 167 ms here → 3 min wet-lab in
    // 3 s real time. Counter shows mm:ss for verisimilitude.
    setIncubateSeconds(180);
    incubateTimer.current = window.setInterval(() => {
      setIncubateSeconds((prev) => {
        if (prev == null) return null;
        const next = prev - 10;
        if (next <= 0) {
          if (incubateTimer.current) window.clearInterval(incubateTimer.current);
          incubateTimer.current = null;
          return 0;
        }
        return next;
      });
    }, 167);
    return () => {
      if (incubateTimer.current) window.clearInterval(incubateTimer.current);
    };
  }, [stage]);

  // ── Stage-derived visual state ─────────────────────────────────
  const cellState = getCellState(stage);
  const washColors = getWashColors(stage);
  const pipettePos = getPipettePosition(stage);
  const showFreshDish = stage === "reseed" || stage === "complete";
  const stageCopy = STAGE_COPY[stage];

  function nextStage() {
    const i = STAGE_ORDER.indexOf(stage);
    if (i < STAGE_ORDER.length - 1) {
      setStage(STAGE_ORDER[i + 1]);
    }
  }

  async function handleAction() {
    if (busy) return;
    if (stage === "complete") {
      setBusy(true);
      if (!replayMode) {
        // Mark the ritual complete server-side. Best-effort —
        // even if it fails, we still navigate (the redirect-back
        // would just send the user here again next time).
        try {
          await fetch("/api/onboarding/complete-cell-split", { method: "POST" });
        } catch {
          /* noop */
        }
      }
      router.push("/dashboard");
      return;
    }
    nextStage();
  }

  // Disable the action button during incubate until the timer
  // hits zero. (Everywhere else: always enabled.)
  const actionDisabled =
    stage === "incubate" && (incubateSeconds ?? 1) > 0;

  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-8">
      {/* Cinematic background — midnight gradient + soft blobs.
          Light enough to keep the dish + UI legible. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 50% 20%, rgba(255,255,255,0.05) 0%, transparent 60%), linear-gradient(180deg, #060912 0%, #0c1228 50%, #131a36 100%)",
          }}
        />
        <div
          className="absolute -top-1/3 -left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 w-[44rem] h-[44rem] rounded-full blur-3xl opacity-35"
          style={{ background: "radial-gradient(circle, rgba(74,222,128,0.5), transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 right-0 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, rgba(244,114,182,0.5), transparent 70%)" }}
        />
      </div>

      {/* Replay banner — admin-only */}
      {replayMode && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-200 ring-1 ring-amber-300/40 text-[11px] font-bold uppercase tracking-[0.18em]"
        >
          <Sparkles size={11} />
          Admin replay · flag will not be set
        </div>
      )}

      <div className="relative max-w-5xl w-full grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 items-center">
        {/* ── DISH PANEL ─────────────────────────────────────────── */}
        <div className="relative w-full aspect-square max-w-[520px] mx-auto">
          <svg
            viewBox="0 0 200 260"
            width="100%"
            height="100%"
            role="img"
            aria-label={`Petri dish — ${stage}`}
          >
            {/* Glow ring behind the dish */}
            <defs>
              <radialGradient id="dish-glow" cx="50%" cy="55%" r="50%">
                <stop offset="0%" stopColor="rgba(56,189,248,0.18)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </radialGradient>
            </defs>
            <ellipse cx="100" cy="150" rx="92" ry="76" fill="url(#dish-glow)" />

            {/* Old / current dish */}
            <DishGroup
              cx={100}
              cy={150}
              cellState={cellState}
              wash={washColors}
              showFresh={false}
              showCells={!showFreshDish}
            />

            {/* New / fresh dish — slides in from the bottom-right
                during the re-seed stage. Sparse 3 cells dropped in. */}
            {showFreshDish && (
              <g
                style={{
                  transformOrigin: "100px 150px",
                  transform: "translate(0, 0)",
                  transition: "transform 700ms ease",
                }}
              >
                <DishGroup
                  cx={100}
                  cy={150}
                  cellState={{ count: 3, color: "#7dd3fc", r: 3.2, opacity: 0.55, strokeOpacity: 0.8 }}
                  wash={{ cyan: 0, green: 0, pink: 0 }}
                  showFresh={true}
                  showCells={true}
                />
              </g>
            )}

            {/* Pipette */}
            <g
              style={{
                transform: `translateY(${pipettePos}px)`,
                transition: "transform 1000ms cubic-bezier(.5,.1,.4,1), opacity 320ms ease",
                opacity: pipettePos > -80 ? 1 : 0,
              }}
            >
              {/* Body */}
              <rect
                x="86" y="-30" width="28" height="68" rx="3"
                stroke="rgba(255,255,255,0.85)" strokeWidth="1.4"
                fill="rgba(255,255,255,0.04)"
              />
              {/* Tapered tip */}
              <path
                d="M 86 38 L 100 110 L 114 38 Z"
                stroke="rgba(255,255,255,0.85)" strokeWidth="1.4"
                fill="rgba(255,255,255,0.04)"
              />
              {/* Volume marks */}
              <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.8">
                <line x1="86" y1="-18" x2="92" y2="-18" />
                <line x1="86" y1="-6" x2="92" y2="-6" />
                <line x1="86" y1="6" x2="92" y2="6" />
                <line x1="86" y1="18" x2="92" y2="18" />
                <line x1="86" y1="30" x2="92" y2="30" />
              </g>
              {/* Liquid column when aspirating */}
              {(stage === "aspirateMedia" || stage === "aspirateCells") && (
                <rect
                  x="88" y="0" width="24" height="36"
                  fill={stage === "aspirateCells" ? "#f9a8d4" : "#bae6fd"}
                  fillOpacity="0.55"
                />
              )}
            </g>

            {/* Incubator badge — appears during incubate stage */}
            {stage === "incubate" && incubateSeconds != null && (
              <g style={{ transformOrigin: "100px 60px" }}>
                <rect x="60" y="38" width="80" height="34" rx="6" fill="#1c2548" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                <text x="100" y="52" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="6" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2">
                  37°C · INCUBATOR
                </text>
                <text x="100" y="65" textAnchor="middle" fill="#86efac" fontSize="12" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                  {formatMMSS(incubateSeconds)}
                </text>
              </g>
            )}

            {/* Complete sparkles — fire at COMPLETE stage */}
            {stage === "complete" && (
              <g>
                {[
                  [40, 90], [160, 110], [50, 200], [150, 210], [100, 60], [30, 150], [170, 160],
                ].map(([x, y], i) => (
                  <g key={i} style={{ animation: `cell-split-sparkle 1.8s ease-in-out ${i * 180}ms infinite` }}>
                    <circle cx={x} cy={y} r="2" fill="#fcd34d" />
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* ── INSTRUCTION PANEL ───────────────────────────────────── */}
        <div className="text-slate-100 max-w-md">
          {/* Progress pill */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[10px] uppercase tracking-[0.22em] font-bold text-white/80 ring-1 ring-white/15">
            <stageIcon.Icon size={11} className="text-amber-300" />
            {stageCopy.pillLabel}
          </span>

          {/* Title */}
          <h1 className="mt-3 font-serif italic text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight">
            {stage === "confluent"
              ? <>Welcome, <span className="not-italic font-bold">{firstName}</span>.</>
              : stage === "complete"
                ? <>Nicely done, <span className="not-italic font-bold">{firstName}</span>.</>
                : stageCopy.title}
          </h1>

          {/* Lead */}
          <p className="mt-3 text-base sm:text-lg text-white/75 leading-relaxed">
            {stage === "confluent" ? stageCopy.title + " " + stageCopy.lead : stageCopy.lead}
          </p>

          {/* Action button */}
          <button
            type="button"
            onClick={() => void handleAction()}
            disabled={actionDisabled || busy}
            className={cn(
              "mt-6 inline-flex items-center gap-2",
              "px-5 py-3 rounded-full",
              "text-sm font-bold tracking-tight",
              // text-[#0f172a] (arbitrary-value Tailwind class) — NOT
              // text-slate-900. Voltage theme globally lifts
              // .text-slate-900 to slate-100 for contrast against the
              // dark page background; on a WHITE pill that lift
              // becomes near-invisible. Arbitrary values bypass the
              // override. Same fix as dashboard Continue button.
              "bg-white text-[#0f172a] hover:bg-white/90 active:bg-white/80",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white",
              "shadow-lg shadow-cyan-500/20",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
              "transition-all",
            )}
          >
            {stageCopy.cta}
            <ArrowRight size={14} />
          </button>

          {/* Stage dots — progress visualisation */}
          <div className="mt-8 flex items-center gap-1.5">
            {STAGE_ORDER.slice(0, -1).map((s, i) => {
              const currentIdx = STAGE_ORDER.indexOf(stage);
              const done = i < currentIdx;
              const current = i === currentIdx;
              return (
                <span
                  key={s}
                  aria-hidden
                  className={cn(
                    "h-1 rounded-full transition-all",
                    current ? "w-6 bg-white" :
                    done    ? "w-3 bg-emerald-400" :
                              "w-3 bg-white/20",
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Sparkle keyframe — local-scope */}
      <style>{`
        @keyframes cell-split-sparkle {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50%      { opacity: 1; transform: scale(1.6); }
        }
      `}</style>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

interface CellState {
  count: number;
  color: string;
  r: number;
  opacity: number;
  strokeOpacity: number;
}

function getCellState(stage: Stage): CellState {
  // Detached / rounded cells: trypsin → aspirate-cells (and lingering)
  const isDetached =
    stage === "trypsin" ||
    stage === "incubate" ||
    stage === "neutralize" ||
    stage === "aspirateCells";

  const isEmpty = stage === "aspirateCells";

  if (isEmpty) {
    // After aspirating, the dish is empty
    return { count: 0, color: "#86efac", r: 2.4, opacity: 0, strokeOpacity: 0 };
  }

  return {
    count: 28,
    color: isDetached ? "#86efac" : "#7dd3fc",
    r: isDetached ? 2.4 : 3.2,
    opacity: isDetached ? 0.7 : 0.55,
    strokeOpacity: isDetached ? 0.85 : 0.78,
  };
}

function getWashColors(stage: Stage): { cyan: number; green: number; pink: number } {
  switch (stage) {
    case "pbsWash":      return { cyan: 0.30, green: 0, pink: 0 };
    case "trypsin":      return { cyan: 0, green: 0.22, pink: 0 };
    case "incubate":     return { cyan: 0, green: 0.22, pink: 0 };
    case "neutralize":   return { cyan: 0, green: 0.08, pink: 0.26 };
    case "aspirateCells":return { cyan: 0, green: 0, pink: 0.18 };
    case "reseed":       return { cyan: 0, green: 0, pink: 0 };
    case "complete":     return { cyan: 0, green: 0, pink: 0 };
    default:             return { cyan: 0, green: 0, pink: 0 };
  }
}

function getPipettePosition(stage: Stage): number {
  // -90 = off-screen above; +0 = lowered into the dish
  if (stage === "aspirateMedia") return 10;
  if (stage === "aspirateCells") return 10;
  return -90;
}

function formatMMSS(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Per-stage instruction-pill icon
const stageIcon = {
  Icon: FlaskConical,
};

// ─────────────────────────────────────────────────────────────────
// <DishGroup /> — the dish outline + wash ellipses + cells
// ─────────────────────────────────────────────────────────────────

function DishGroup({
  cx, cy, cellState, wash, showFresh, showCells,
}: {
  cx: number;
  cy: number;
  cellState: CellState;
  wash: { cyan: number; green: number; pink: number };
  showFresh: boolean;
  showCells: boolean;
}) {
  return (
    <g>
      {/* Dish outline */}
      <ellipse
        cx={cx} cy={cy} rx="78" ry="62"
        stroke={showFresh ? "rgba(74,222,128,0.85)" : "rgba(255,255,255,0.75)"}
        strokeWidth="1.4"
        fill={showFresh ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.02)"}
      />
      {/* Media line dashed */}
      <ellipse
        cx={cx} cy={cy} rx="72" ry="56"
        stroke="rgba(255,255,255,0.30)" strokeWidth="0.7"
        strokeDasharray="2 3" fill="none"
      />

      {/* Wash ellipses — all three colours stacked with fade
          opacity transitions for smooth cross-fade between stages */}
      <ellipse
        cx={cx} cy={cy} rx="74" ry="58"
        fill="#bae6fd" fillOpacity={wash.cyan}
        style={{ transition: "fill-opacity 700ms ease" }}
      />
      <ellipse
        cx={cx} cy={cy} rx="74" ry="58"
        fill="#86efac" fillOpacity={wash.green}
        style={{ transition: "fill-opacity 700ms ease" }}
      />
      <ellipse
        cx={cx} cy={cy} rx="74" ry="58"
        fill="#f9a8d4" fillOpacity={wash.pink}
        style={{ transition: "fill-opacity 700ms ease" }}
      />

      {/* Cells */}
      {showCells && (
        <g style={{ transition: "opacity 500ms ease" }}>
          {CELL_POSITIONS.slice(0, cellState.count).map((c, i) => (
            <circle
              key={i}
              cx={c.x + (cx - 90)} cy={c.y + (cy - 140)}
              r={cellState.r}
              fill={cellState.color}
              fillOpacity={cellState.opacity}
              stroke={cellState.color}
              strokeWidth="0.8"
              strokeOpacity={cellState.strokeOpacity}
              style={{
                transition:
                  "r 500ms ease, fill 500ms ease, stroke 500ms ease, fill-opacity 500ms ease, stroke-opacity 500ms ease",
              }}
            />
          ))}
        </g>
      )}
    </g>
  );
}

// Type-check helper — silences "imported but never used" warnings
// for icons reserved for future stage-icon variants.
void Beaker;
void Pipette;
void Timer;
