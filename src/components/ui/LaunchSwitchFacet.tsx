"use client";

/**
 * LaunchSwitchFacet — faceted plastic-cover delete switch.
 *
 * Third LaunchSwitch variant, alongside:
 *  • LaunchSwitch         — clear glass cover, neon-glow DELETE.
 *  • LaunchSwitchClassic  — hazard-striped military cover, red FIRE.
 *  • LaunchSwitchFacet    — this one: four-triangle faceted plastic
 *                            cover with reflection-style highlights
 *                            on each facet. Reads like a low-poly gem.
 *
 * Behaviour is identical to LaunchSwitch (3 states, configurable
 * countdown, sm/md sizes, accessible labels). Only the cover surface
 * differs — instead of a transparent glass pane, the cover is an
 * opaque plastic plate carved into four triangular facets meeting at
 * the centre. Each facet catches a different amount of light, fixed
 * to a top-left ~135° light direction, giving the cover the look of
 * an industrially-moulded prism switch.
 *
 * When closed the cover hides the DELETE label behind the facets
 * (faceted plastic isn't transparent — it would be dishonest to show
 * the label through). The cover itself carries the "DELETE" label so
 * the user still sees what they're about to commit to.
 *
 * Live preview lives at /admin/design-system. Companion HTML
 * exploration at /design-archive/delete-buttons-prism-covers.html.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type State = "closed" | "armed" | "launching";

export interface LaunchSwitchFacetProps {
  /** Called once after the countdown completes. Caller does the
   *  actual delete. Never fires if the user aborts. */
  onFire: () => void;
  /** Optional — fires when the user opens the cover. */
  onArm?: () => void;
  /** Optional — fires when the user aborts before firing. */
  onAbort?: () => void;
  /** Countdown seconds. Default 10. */
  countdownSeconds?: number;
  /** Visible label, both on the cover and the exposed button. */
  label?: string;
  /** Footprint. "sm" (~92×28) for inline rows; "md" (~140×42) for
   *  emphasised destructive panels. */
  size?: "sm" | "md";
  /** Optional aria-label for screen readers. */
  ariaLabel?: string;
  /** Verb during the countdown — "Deleting", "Wiping", "Resetting". */
  actionVerb?: string;
}

export function LaunchSwitchFacet({
  onFire, onArm, onAbort, countdownSeconds = 10, label = "DELETE",
  size = "sm", ariaLabel, actionVerb = "Deleting",
}: LaunchSwitchFacetProps) {
  const [state, setState] = useState<State>("closed");
  const [remaining, setRemaining] = useState(countdownSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state !== "launching") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRemaining(countdownSeconds);
      return;
    }
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = countdownSeconds - elapsed;
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRemaining(0);
        onFire();
        setState("closed");
        return;
      }
      setRemaining(left);
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, countdownSeconds]);

  function openCover()  { setState("armed"); onArm?.(); }
  function closeCover() {
    const wasArmed = state !== "closed";
    setState("closed");
    if (wasArmed) onAbort?.();
  }
  function fire() { setState("launching"); }

  // Same wider footprint as LaunchSwitch so the countdown text fits.
  const dims = size === "md"
    ? { w: 180, h: 44, font: 11, labelFont: 11 }
    : { w: 132, h: 30, font: 9,  labelFont: 9.5 };
  const launching  = state === "launching";
  const coverOpen  = state !== "closed";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${label} switch`}
      className="lsf relative inline-block select-none font-mono align-middle"
      style={{ width: dims.w, height: dims.h, perspective: "320px" }}
    >
      {/* BASE — the red button under the cover. Visible only once the
          cover is flipped up. Once armed: clickable. Once launching:
          shows the countdown panel instead. */}
      <div
        className="absolute inset-0 rounded-md overflow-hidden ring-1 ring-rose-900/60 bg-gradient-to-b from-rose-700 to-rose-900"
        style={{ boxShadow: "inset 0 0 6px rgba(0,0,0,0.45)" }}
      >
        {launching ? (
          <div className="absolute inset-0 flex items-center justify-between pl-2 pr-1">
            <span
              aria-hidden
              // eslint-disable-next-line no-restricted-syntax -- countdown pulse halo locked to the `ls_pulse` keyframe; generic shadow-glow-amber* breaks the animation cadence.
              className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 shadow-[0_0_4px_2px_rgba(253,224,71,0.75)] animate-[ls_pulse_0.5s_ease-in-out_infinite] shrink-0"
            />
            <span
              className="font-bold tracking-[0.12em] uppercase text-white tabular-nums"
              style={{ fontSize: dims.font }}
            >
              {actionVerb} in {remaining}
            </span>
            <button
              type="button"
              onClick={closeCover}
              aria-label="Abort countdown"
              title="Abort — close the cover to cancel"
              // eslint-disable-next-line no-restricted-syntax -- abort chip mirrors the countdown halo above; same `ls_pulse` armed-state geometry.
              className="inline-flex items-center justify-center rounded-md bg-yellow-300 text-rose-900 ring-1 ring-yellow-500 shadow-[0_0_8px_rgba(253,224,71,0.55)] hover:bg-yellow-200 hover:text-rose-950 active:translate-y-[1px] shrink-0"
              style={{
                width:  size === "md" ? 26 : 20,
                height: size === "md" ? 26 : 20,
              }}
            >
              <X
                size={size === "md" ? 16 : 13}
                strokeWidth={3}
                aria-hidden
              />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={state === "armed" ? fire : undefined}
            tabIndex={state === "armed" ? 0 : -1}
            aria-label={`${label} — start ${countdownSeconds}-second countdown`}
            className={
              "absolute inset-0 flex items-center justify-center font-bold uppercase text-rose-50 active:translate-y-[1px] focus:outline-none " +
              (state === "armed" ? "cursor-pointer hover:text-white" : "cursor-default")
            }
            style={{
              fontSize: dims.labelFont,
              letterSpacing: "0.18em",
              animation: "ls_glow 1.6s ease-in-out infinite",
              pointerEvents: state === "armed" ? "auto" : "none",
            }}
          >
            {label}
          </button>
        )}
      </div>

      {/* COVER — opaque plastic plate with four triangular facets.
          Hinges up on click. Uses ::before for the diagonal seams
          between facets so the geometry reads even at small sizes. */}
      <button
        type="button"
        onClick={state === "closed" ? openCover : closeCover}
        aria-label={state === "closed" ? `Lift cover to ${label.toLowerCase()}` : "Close cover"}
        aria-pressed={coverOpen}
        className="lsf-cover absolute inset-0 rounded-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        style={{
          transform: coverOpen ? "rotateX(-85deg)" : "rotateX(0deg)",
          transformOrigin: "top center",
          backfaceVisibility: "hidden",
          transition: coverOpen
            ? "transform 360ms ease-out, box-shadow 360ms ease-out"
            : "transform 480ms cubic-bezier(0.32, 1.4, 0.55, 1), box-shadow 480ms ease-out",
          boxShadow: coverOpen
            ? "0 12px 18px -10px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.20)"
            : "inset 0 0 0 1px rgba(255,255,255,0.20), inset 0 1px 0 0 rgba(255,255,255,0.40)",
        }}
      >
        {/* Cover label — stencilled on the closed cover; fades while
            the cover is up so the exposed base button is the focus. */}
        <span
          aria-hidden
          className="absolute inset-0 inline-flex items-center justify-center font-bold uppercase text-rose-100/85 z-[2] transition-opacity"
          style={{
            fontSize: dims.labelFont,
            letterSpacing: "0.18em",
            opacity: coverOpen ? 0 : 1,
            textShadow: "0 1px 0 rgba(0,0,0,0.45)",
          }}
        >
          {label}
        </span>
      </button>

      <style jsx>{`
        /* Four-facet plastic cover. Each facet is a triangle filling
           one quarter of the cover, with its own linear gradient set
           so light "arrives" from a fixed direction (top-left, ~135°)
           and reflects off each facet at a different angle.
           The seams between facets are drawn via a ::before with two
           crossing diagonals, kept ultra-thin so they read as moulded
           seams rather than printed lines. */
        .lsf .lsf-cover {
          background:
            /* TOP — brightest, catches the light head-on */
            linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 50%, transparent 50%) top    / 50% 50% no-repeat,
            /* RIGHT — partial, light slides off */
            linear-gradient(225deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.06) 50%, transparent 50%) top right / 50% 50% no-repeat,
            /* BOTTOM — dim, only the edge catches */
            linear-gradient(315deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.03) 50%, transparent 50%) bottom right / 50% 50% no-repeat,
            /* LEFT — medium-bright */
            linear-gradient(45deg,  rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.05) 50%, transparent 50%) bottom left  / 50% 50% no-repeat,
            /* Base plastic — slate-tinted, semi-cool grey */
            linear-gradient(180deg, rgba(241, 245, 249, 0.22), rgba(100, 116, 139, 0.28));
          border: 1px solid rgba(255,255,255,0.22);
        }
        .lsf .lsf-cover::before {
          /* Diagonal seams between the four facets. Two crossing
             lines at ~0.4px width — visible enough to read the
             geometry, faint enough not to dominate. */
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to top right, transparent calc(50% - 0.4px), rgba(0,0,0,0.22) 50%, transparent calc(50% + 0.4px)),
            linear-gradient(to top left,  transparent calc(50% - 0.4px), rgba(0,0,0,0.22) 50%, transparent calc(50% + 0.4px));
          pointer-events: none;
          z-index: 1;
        }
        /* A faint top-edge "hinge" highlight so the user can tell
           which edge the cover lifts from. */
        .lsf .lsf-cover::after {
          content: "";
          position: absolute;
          top: 0;
          left: 8%;
          right: 8%;
          height: 1.5px;
          border-radius: 0 0 6px 6px;
          background: linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0));
          pointer-events: none;
          opacity: var(--hinge-op, 1);
          z-index: 2;
        }
      `}</style>

      <style jsx global>{`
        /* Shared with LaunchSwitch — both files emit the same defs.
           Redeclaring keeps LaunchSwitchFacet drop-in-friendly even
           if the canonical variant isn't on the page. */
        @keyframes ls_pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(0.6); opacity: 0.35; }
        }
        @keyframes ls_glow {
          0%, 100% {
            text-shadow:
              0 0 3px rgba(255, 100, 100, 0.55),
              0 0 6px rgba(255, 60, 60, 0.45);
            color: rgb(255, 220, 220);
          }
          50% {
            text-shadow:
              0 0 5px rgba(255, 120, 120, 0.95),
              0 0 12px rgba(255, 60, 60, 0.85),
              0 0 22px rgba(255, 30, 30, 0.55);
            color: rgb(255, 240, 240);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .lsf .lsf-cover, [class*="ls_glow"] {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
