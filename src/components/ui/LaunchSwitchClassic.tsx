"use client";
/* eslint-disable no-restricted-syntax -- the military rocket-launch
 * cover's chassis / inset / cover-lift / LED pulse / abort glow / rivet
 * shadows are all hard-tuned rgba values that drive the cover-flip
 * animation pipeline and the visual language of the original variant.
 * Themes don't re-tune them by design — the classic look is the look. */

/**
 * LaunchSwitchClassic — original "rocket-launch cover" delete switch.
 *
 * The first LaunchSwitch design, kept available alongside the newer
 * glass-cover variant (`LaunchSwitch`). Reads like a jet's weapons-
 * panel switch: hazard-striped amber/black cover over a red FIRE
 * button, with rivets at the chassis corners.
 *
 * Three states:
 *
 *   1. CLOSED  — striped cover with a stencilled DELETE label sits
 *                over the chassis. Click to flip.
 *   2. ARMED   — cover hinges up, red gradient FIRE button exposed
 *                (showing the configured `label`). Click to commit;
 *                click the lifted cover to bail.
 *   3. LAUNCHING — flashing yellow LED + verb · seconds countdown.
 *                  × on the right or clicking the cover aborts at
 *                  any point during the countdown. Default 5s.
 *
 * Use when you want the action to feel *industrial* — the stencil +
 * hazard stripes signal "this is a real consequence" before the user
 * even clicks. The newer `LaunchSwitch` (glass-cover) variant uses a
 * softer, more product-design language; pick whichever fits the
 * surface.
 *
 * Saved to the design system at /admin/design-system alongside the
 * newer variant for side-by-side comparison.
 */

import { useEffect, useRef, useState } from "react";
import { Zap, X } from "lucide-react";

type State = "closed" | "armed" | "launching";

export interface LaunchSwitchClassicProps {
  /** Called once after the countdown completes. Caller is
   *  responsible for the actual delete / execute. Never fires
   *  if the user aborts. */
  onFire: () => void;
  /** Optional — fires when the user opens the cover. */
  onArm?: () => void;
  /** Optional — fires when the user aborts before firing. */
  onAbort?: () => void;
  /** Countdown seconds. Default 5. */
  countdownSeconds?: number;
  /** Visible label on the cover + the exposed FIRE button. Default
   *  "DELETE". */
  label?: string;
  /** Footprint. "sm" (default, ~84×24) for inline rows; "md"
   *  (~120×36) for emphasised destructive panels. */
  size?: "sm" | "md";
  /** Optional aria-label for screen readers. */
  ariaLabel?: string;
  /** Verb used during the countdown — "Deleting", "Wiping",
   *  "Resetting". Default "Deleting". */
  actionVerb?: string;
}

export function LaunchSwitchClassic({
  onFire, onArm, onAbort, countdownSeconds = 5, label = "DELETE",
  size = "sm", ariaLabel, actionVerb = "Deleting",
}: LaunchSwitchClassicProps) {
  const [state, setState] = useState<State>("closed");
  const [remaining, setRemaining] = useState(countdownSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown whenever we leave the launching state. A fresh
  // arm always starts from the full countdown.
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

  // Wider footprint than the original so "Deleting · 5s" fits with
  // headroom for the LED dot + abort × without truncating.
  const dims = size === "md"
    ? { w: 160, h: 38, font: 10,  labelFont: 9.5 }
    : { w: 118, h: 26, font: 8.5, labelFont: 8.5 };
  const launching = state === "launching";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${label} switch`}
      className="relative inline-block select-none font-mono align-middle"
      style={{ width: dims.w, height: dims.h, perspective: "240px" }}
    >
      <div
        className={
          "absolute inset-0 rounded-[3px] overflow-hidden " +
          (launching
            ? "bg-rose-700 ring-1 ring-rose-900 shadow-[inset_0_0_8px_rgba(0,0,0,0.4)]"
            : "bg-zinc-900 ring-1 ring-zinc-700 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]")
        }
      >
        <Rivet style={{ top: 2,  left: 2  }} />
        <Rivet style={{ top: 2,  right: 2 }} />
        <Rivet style={{ bottom: 2, left: 2  }} />
        <Rivet style={{ bottom: 2, right: 2 }} />

        {state === "armed" && (
          <button
            type="button"
            onClick={fire}
            className="absolute inset-[2px] rounded-[2px] bg-gradient-to-b from-rose-500 to-rose-700 ring-1 ring-rose-900 text-white font-bold tracking-[0.18em] uppercase active:translate-y-[1px] active:from-rose-600 active:to-rose-800 hover:from-rose-400 hover:to-rose-600 transition-colors"
            style={{ fontSize: dims.font }}
            aria-label={`${label} — start countdown`}
          >
            <span className="inline-flex items-center justify-center gap-1">
              <Zap size={dims.font} className="-rotate-12" /> {label}
            </span>
          </button>
        )}

        {launching && (
          <div className="absolute inset-[2px] flex items-center justify-between pl-1.5 pr-0.5 rounded-[2px] bg-gradient-to-b from-rose-600 to-rose-800 ring-1 ring-rose-900">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 shadow-[0_0_4px_2px_rgba(253,224,71,0.7)] animate-[ls_pulse_0.5s_ease-in-out_infinite] shrink-0"
            />
            <span
              className="font-bold tracking-[0.14em] uppercase text-white tabular-nums"
              style={{ fontSize: dims.font }}
            >
              {actionVerb} · {remaining}s
            </span>
            {/* Beefier abort × — yellow chip + thicker stroke so the
                bail-out is the most visible thing on the launching
                panel. The action it triggers (close cover, halt
                countdown) is the *safe* path. */}
            <button
              type="button"
              onClick={closeCover}
              aria-label="Abort countdown"
              title="Abort — close the cover to cancel"
              className="inline-flex items-center justify-center rounded-sm bg-yellow-300 text-rose-900 ring-1 ring-yellow-500 shadow-[0_0_6px_rgba(253,224,71,0.55)] hover:bg-yellow-200 hover:text-rose-950 active:translate-y-[1px] shrink-0"
              style={{
                width:  size === "md" ? 22 : 18,
                height: size === "md" ? 22 : 18,
              }}
            >
              <X
                size={size === "md" ? 14 : 12}
                strokeWidth={3}
                aria-hidden
              />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={state === "closed" ? openCover : closeCover}
        aria-label={state === "closed" ? `Lift cover to ${label.toLowerCase()}` : "Close cover"}
        aria-pressed={state !== "closed"}
        className={
          "absolute inset-0 rounded-[3px] overflow-hidden ring-1 ring-amber-900/70 " +
          "transition-[transform,box-shadow] duration-[400ms] " +
          (state === "closed"
            ? "[transition-timing-function:cubic-bezier(0.34,1.42,0.64,1)] "
            : "ease-out ") +
          "[transform-origin:top_center] " +
          (state === "closed"
            ? "[transform:rotateX(0deg)]"
            : "[transform:rotateX(-82deg)] shadow-[0_10px_14px_-8px_rgba(0,0,0,0.5)]")
        }
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #f59e0b 0 6px, #18181b 6px 12px)",
          backfaceVisibility: "hidden",
          pointerEvents: "auto",
        }}
      >
        <span
          className={
            "absolute inset-1 inline-flex items-center justify-center rounded-sm " +
            "bg-zinc-900/85 text-amber-200 ring-1 ring-amber-700/70 font-bold uppercase " +
            "transition-opacity " +
            (state === "closed" ? "opacity-100" : "opacity-0")
          }
          style={{ fontSize: dims.labelFont, letterSpacing: "0.16em" }}
        >
          {label}
        </span>
      </button>

      {/* The `ls_pulse` keyframe is shared with `LaunchSwitch` — both
          components emit the same definition; redeclaring it here
          keeps `LaunchSwitchClassic` drop-in-friendly even if the
          newer variant isn't imported on the page. */}
      <style jsx global>{`
        @keyframes ls_pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(0.6); opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}

function Rivet({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="absolute w-[3px] h-[3px] rounded-full bg-zinc-600 shadow-[inset_0_0_1px_rgba(0,0,0,0.5)]"
      style={style}
    />
  );
}
