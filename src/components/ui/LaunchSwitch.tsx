"use client";

/**
 * LaunchSwitch — clear-cover delete switch.
 *
 * A pulsing, glowing red **DELETE** button sits at all times under
 * a transparent glass cover. The glow is visible through the
 * cover, so the affordance reads as "warning, but protected." The
 * gesture:
 *
 *   1. CLOSED  — Glass cover sits over the glowing DELETE button.
 *                The text glow pulses gently so the user knows the
 *                surface is interactive. Click the cover → it
 *                hinges up on its top edge (animated, ~450ms).
 *
 *   2. ARMED   — Cover hinged ~82°, DELETE button fully exposed +
 *                clickable. Click DELETE to commit; click the
 *                lifted cover (or its hinge area) to bail.
 *
 *   3. LAUNCHING — Button transforms into a panel showing
 *                  "DELETING IN 10" with a flashing LED, counting
 *                  down once per second. User can hit the × to
 *                  abort, or close the cover, at any point during
 *                  the countdown. When the count hits 0, onFire()
 *                  fires exactly once.
 *
 * No military jargon, no hazard stripes — the cover is glass; the
 * warning comes from the glow + the deliberate flip-then-press
 * gesture + the 10-second cooling-off window.
 *
 * Sized small by default (~92×28 in sm, ~140×42 in md). Saved to
 * the design system at /admin/design-system as the canonical
 * irreversible-destructive control.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// State machine:
//   closed    → armed       (click cover, cover lifts)
//   armed     → launching   (click DELETE button, countdown starts)
//   launching → completed   (countdown hits 0 — panel reads "DELETED",
//                            still abortable for the first instant)
//   completed → closed      (after 2s pause, onFire() fires once and
//                            the cover snaps shut)
//
// The 2s pause-on-DELETED gives the host UI a beat to play its own
// outro animation (e.g. card collapsing closed) while the user still
// sees the confirmation chip. Without it the LaunchSwitch closed the
// instant the countdown ended, which made the card vanish before the
// user could register that anything had happened.
type State = "closed" | "armed" | "launching" | "completed";

export interface LaunchSwitchProps {
  /** Called once after the countdown completes. Caller does the
   *  actual delete. Never fires if the user aborts. */
  onFire: () => void;
  /** Optional — fires when the user starts arming (opens cover). */
  onArm?: () => void;
  /** Optional — fires when the user aborts before firing. */
  onAbort?: () => void;
  /** Countdown seconds. Default 10. */
  countdownSeconds?: number;
  /** Visible label on the button. Default "DELETE". */
  label?: string;
  /** Footprint. "sm" (default, ~92×28) fits inline action rows;
   *  "md" (~140×42) is for emphasised destructive panels. */
  size?: "sm" | "md";
  /** Optional aria-label for screen readers. */
  ariaLabel?: string;
  /** Verb used during the countdown — "Deleting", "Wiping",
   *  "Resetting". Default "Deleting". The button label ("DELETE")
   *  is set via the `label` prop above. */
  actionVerb?: string;
}

export function LaunchSwitch({
  onFire, onArm, onAbort, countdownSeconds = 10, label = "DELETE",
  size = "sm", ariaLabel, actionVerb = "Deleting",
}: LaunchSwitchProps) {
  const [state, setState] = useState<State>("closed");
  const [remaining, setRemaining] = useState(countdownSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown when leaving the launching state. A fresh arm
  // always starts from the full countdown.
  useEffect(() => {
    if (state !== "launching") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRemaining(countdownSeconds);
      return;
    }
    // Real-time tick — Date.now diff stays honest even if the tab
    // is throttled.
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = countdownSeconds - elapsed;
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRemaining(0);
        // Move to the "completed" state — DELETED is shown for 2s
        // before onFire() fires (see the dedicated effect below).
        // Doing it in two steps lets the user actually see the
        // confirmation chip; firing onFire immediately tended to
        // unmount the host card before the countdown registered.
        setState("completed");
        return;
      }
      setRemaining(left);
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, countdownSeconds]);

  // "Completed" → onFire after a 2-second pause showing DELETED.
  // Separate effect so the timer state stays clean: cancelling the
  // pause (rare — most hosts unmount the LaunchSwitch immediately
  // once onFire runs) just unsubscribes the timeout.
  useEffect(() => {
    if (state !== "completed") return;
    const t = setTimeout(() => {
      onFire();
      setState("closed");
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function openCover() {
    setState("armed");
    onArm?.();
  }
  function closeCover() {
    const wasArmed = state !== "closed";
    setState("closed");
    if (wasArmed) onAbort?.();
  }
  function fire() {
    setState("launching");
  }

  // Width chosen so "DELETING IN 10" + LED dot + abort × never
  // collide. Old sm width (92px) truncated the countdown to
  // "DELETING IN…"; this footprint lets the full string sit
  // comfortably with margin to spare even at remaining = 10.
  const dims = size === "md"
    ? { w: 180, h: 44, font: 11, labelFont: 11 }
    : { w: 132, h: 30, font: 9,  labelFont: 9.5 };
  const launching = state === "launching";
  const completed = state === "completed";
  const coverFlipped = state !== "closed";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${label} switch`}
      className="relative inline-block select-none font-mono align-middle"
      style={{ width: dims.w, height: dims.h, perspective: "260px" }}
    >
      {/* Base layer — three visual modes share this surface:
            • idle/armed (default): rose gradient glow with the
              pulsing DELETE label visible through / under the cover
            • launching: countdown panel with abort ×
            • completed: ELIMINATION effect — matte-black chassis
              with a strike-through "DELETED" label, a horizontal
              CRT scan-line collapse, and a brief white flash.
              Reads "this thing is GONE" rather than "this thing is
              safely confirmed". Holds for ~2s while the host card
              plays its own outro. */}
      <div
        className={
          "absolute inset-0 rounded-md overflow-hidden ring-1 transition-colors duration-200 " +
          (completed
            ? "ring-black/80 bg-zinc-950"
            : "ring-rose-900/60 bg-gradient-to-b from-rose-700 to-rose-900")
        }
        style={{
          boxShadow: completed
            ? "inset 0 0 14px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)"
            : "inset 0 0 6px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* DELETED — elimination effect. CRT-style: the chassis
            goes matte black, a horizontal scan-line collapses over
            it, the text strikes through with a tracking blow-out,
            and a brief white-bar flash punctuates the end. Holds
            for ~2s before onFire() fires; the host card uses this
            window to play its own outro animation. */}
        {completed ? (
          <div className="absolute inset-0 overflow-hidden">
            {/* The strike-through text. The label fades + spreads
                slightly as the line draws through it. Layers a
                subtle text-shadow flicker via the ls_eliminate
                keyframe so the text feels "shorted out" rather
                than just printed. */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ animation: "ls_eliminate_text 2000ms ease-out forwards" }}
            >
              <span
                className="relative font-bold uppercase text-zinc-300"
                style={{
                  fontSize: dims.font,
                  letterSpacing: "0.18em",
                }}
              >
                Deleted
                {/* The strike-through line draws across the word
                    in 320ms then sits as a hard red stroke. */}
                <span
                  aria-hidden
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 bg-rose-500"
                  style={{
                    height: 1.5,
                    transformOrigin: "left center",
                    animation: "ls_strike 360ms cubic-bezier(0.6,0,0.4,1) forwards",
                  }}
                />
              </span>
            </div>
            {/* Horizontal CRT scan-line that travels top → bottom
                then collapses to a single mid-line at the end. */}
            <span
              aria-hidden
              className="absolute left-0 right-0 bg-white/70"
              style={{
                height: 1,
                top: 0,
                boxShadow: "0 0 8px 1px rgba(255,255,255,0.5)",
                animation: "ls_scanline 900ms cubic-bezier(0.6,0,0.4,1) forwards",
              }}
            />
            {/* CRT shutdown: at the end the whole panel collapses
                vertically to a thin line, mimicking an old TV
                cutting power. Pure transform: scaleY so width
                stays full. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)",
                opacity: 0.55,
                animation: "ls_scanlines_fade 2000ms ease-out forwards",
              }}
            />
            {/* Final white-flash bar at ~1700ms — the "TV blink off"
                punctuation right before onFire fires. */}
            <span
              aria-hidden
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 bg-white"
              style={{
                height: 1,
                animation: "ls_crt_off 2000ms ease-out forwards",
              }}
            />
          </div>
        ) : launching ? (
          <div className="absolute inset-0 flex items-center justify-between pl-2 pr-1">
            <span
              aria-hidden
              // eslint-disable-next-line no-restricted-syntax -- the launch-cover countdown pulse needs an exact 4px/2px/0.75-alpha yellow halo tuned to the `ls_pulse` keyframe; a generic shadow-glow-amber* breaks the animation rhythm.
              className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 shadow-[0_0_4px_2px_rgba(253,224,71,0.75)] animate-[ls_pulse_0.5s_ease-in-out_infinite] shrink-0"
            />
            <span
              className="font-bold tracking-[0.12em] uppercase text-white tabular-nums"
              style={{ fontSize: dims.font }}
            >
              {actionVerb} in {remaining}
            </span>
            {/* Abort × — beefed up. The 14×14 hit target was hard
                to find under stress; this one carries a yellow chip
                background + thicker stroke so the bail-out
                affordance reads at a glance. The action it triggers
                (close cover, halt countdown) is the *safe* path, so
                the contrast on a destructive panel is justified. */}
            <button
              type="button"
              onClick={closeCover}
              aria-label="Abort countdown"
              title="Abort — close the cover to cancel"
              // eslint-disable-next-line no-restricted-syntax -- abort chip needs the same yellow halo as the pulsing countdown dot above so the two visually belong to the same "armed" state machine.
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
          // Pulsing glowing DELETE label. Visible through the cover
          // when closed, fully exposed + clickable when armed.
          <button
            type="button"
            onClick={state === "armed" ? fire : undefined}
            // Don't intercept clicks while closed — the cover layer
            // sits on top and owns the open-gesture. tabIndex=-1 in
            // closed state keeps it out of the focus chain so the
            // user tabs onto the cover, not this.
            tabIndex={state === "armed" ? 0 : -1}
            aria-label={`${label} — start ${countdownSeconds}-second countdown`}
            className={
              "absolute inset-0 flex items-center justify-center font-bold uppercase " +
              "text-rose-100 active:translate-y-[1px] focus:outline-none " +
              (state === "armed"
                ? "cursor-pointer hover:text-white"
                : "cursor-default")
            }
            style={{
              fontSize: dims.labelFont,
              letterSpacing: "0.18em",
              // Pulsing text-glow + a subtle inset highlight. The
              // glow comes from `text-shadow` layers stacked so the
              // halo around the letters reads as neon, not a flat
              // colour shift.
              animation: "ls_glow 1.6s ease-in-out infinite",
              pointerEvents: state === "armed" ? "auto" : "none",
            }}
          >
            {label}
          </button>
        )}
      </div>

      {/* COVER — transparent glass that hinges up on click. Sits
          ABOVE the base so it captures the open-gesture click; when
          flipped up it leaves the base exposed. */}
      <button
        type="button"
        onClick={state === "closed" ? openCover : closeCover}
        aria-label={state === "closed" ? `Lift cover to ${label.toLowerCase()}` : "Close cover"}
        aria-pressed={coverFlipped}
        // Cover sits above the base. When closed it's clickable
        // (lifts on click); when flipped, it's still clickable
        // (closes the cover / aborts) but the base button is now
        // the visual focus.
        className="absolute inset-0 rounded-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        style={{
          // Glass — very faint frosted plastic, mostly transparent.
          background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
          // A thin rim on the edges so the cover reads as a discrete
          // object rather than vanishing entirely.
          boxShadow: coverFlipped
            ? "0 8px 14px -8px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.18)"
            : "inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 1px 0 0 rgba(255,255,255,0.25)",
          // backdrop-filter blurs whatever's behind the cover (the
          // base DELETE button). 1.5px keeps the glow visible but
          // softens it slightly, giving a "you can almost touch
          // the button" feel.
          backdropFilter: coverFlipped ? "none" : "blur(1px)",
          WebkitBackdropFilter: coverFlipped ? "none" : "blur(1px)",
          backfaceVisibility: "hidden",
          transformOrigin: "top center",
          transform: coverFlipped ? "rotateX(-82deg)" : "rotateX(0deg)",
          transition: coverFlipped
            ? "transform 320ms ease-out, box-shadow 320ms ease-out, backdrop-filter 200ms ease-out"
            : "transform 450ms cubic-bezier(0.34, 1.42, 0.64, 1), box-shadow 450ms ease-out, backdrop-filter 200ms ease-out 200ms",
        }}
      >
        {/* A faint top-edge "hinge" highlight when closed so the
            user can tell which edge the cover lifts from. */}
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-md"
          style={{
            background: "linear-gradient(to bottom, rgba(255,255,255,0.45), transparent)",
            opacity: coverFlipped ? 0 : 1,
            transition: "opacity 200ms ease-out",
          }}
        />
      </button>

      {/* Keyframes — kept inline so the component is self-contained
          and you can drop a LaunchSwitch anywhere without touching
          globals.css. */}
      <style jsx global>{`
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

        /* ─── Elimination effect (completed state) ─────────────── */
        /* The strike-through line scales from 0 → 100% width
           across the word — feels like a hard red mark slamming
           through it. */
        @keyframes ls_strike {
          0%   { transform: translateY(-50%) scaleX(0); opacity: 0.9; }
          70%  { transform: translateY(-50%) scaleX(1); opacity: 1; }
          100% { transform: translateY(-50%) scaleX(1); opacity: 0.85; }
        }
        /* Horizontal scan line travels top → bottom and fades. */
        @keyframes ls_scanline {
          0%   { top: 0;    opacity: 0.9; }
          85%  { top: 100%; opacity: 0.7; }
          100% { top: 100%; opacity: 0;   }
        }
        /* Subtle CRT scan-lines fade as the panel dies. */
        @keyframes ls_scanlines_fade {
          0%   { opacity: 0;    }
          15%  { opacity: 0.55; }
          85%  { opacity: 0.35; }
          100% { opacity: 0.10; }
        }
        /* The "DELETED" text itself: appears, holds, then on the
           final beat its letter-spacing blows out + opacity drops
           in lock-step with the CRT-off bar. */
        @keyframes ls_eliminate_text {
          0%   { opacity: 0;   letter-spacing: 0.18em; transform: translateY(0); filter: brightness(1); }
          18%  { opacity: 1;   letter-spacing: 0.18em; }
          80%  { opacity: 0.9; letter-spacing: 0.22em; }
          92%  { opacity: 0.5; letter-spacing: 0.46em; filter: brightness(2.4) blur(0.6px); }
          100% { opacity: 0;   letter-spacing: 0.46em; transform: scaleY(0.05); }
        }
        /* The white bar that punctuates the end — appears just
           before the text dies and collapses to nothing along
           with it, mimicking an old TV power-off. */
        @keyframes ls_crt_off {
          0%, 80% { opacity: 0; transform: translateY(-50%) scaleX(0); }
          88%     { opacity: 1; transform: translateY(-50%) scaleX(1); height: 2px; }
          96%     { opacity: 1; transform: translateY(-50%) scaleX(1); height: 1px; }
          100%    { opacity: 0; transform: translateY(-50%) scaleX(0); height: 0;   }
        }

        @media (prefers-reduced-motion: reduce) {
          .ls-no-anim, [class*="ls_glow"], [class*="ls_strike"],
          [class*="ls_scanline"], [class*="ls_scanlines_fade"],
          [class*="ls_eliminate_text"], [class*="ls_crt_off"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
