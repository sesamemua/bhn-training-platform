import { cn } from "@/lib/utils";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * BHN Training mark — four interlocking blue→green petals arranged in
 * 90° rotational symmetry around a central 4-pointed star. Mirrors the
 * BioHubNet brand emblem at `public/biohubnet-logo.svg`, inlined here
 * so the Sidebar and anywhere else using `<Logo>` can render the mark
 * without an extra network round-trip and can pick up CSS sizing /
 * filter effects (drop-shadow etc.) cleanly.
 *
 * One petal is defined inside a hidden `<symbol>` and rendered four
 * times at 0° / 90° / 180° / 270° rotations, each with its own
 * gradient ramp (top-cyan, right-green, bottom-deep-blue, left-navy)
 * so adjacent petals read as distinct ribbons.
 */
export function LogoMark({ size = 36, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BHN Training"
      className={cn("inline-block", className)}
    >
      <defs>
        <linearGradient id="bhn-petal-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#1d4f8b" />
          <stop offset="55%" stopColor="#2c8aa3" />
          <stop offset="100%" stopColor="#3fa86a" />
        </linearGradient>
        <linearGradient id="bhn-petal-right" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#52b066" />
          <stop offset="55%" stopColor="#3aa28a" />
          <stop offset="100%" stopColor="#1e6d9c" />
        </linearGradient>
        <linearGradient id="bhn-petal-bottom" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%"  stopColor="#1d4f8b" />
          <stop offset="50%" stopColor="#2674a0" />
          <stop offset="100%" stopColor="#48a25f" />
        </linearGradient>
        <linearGradient id="bhn-petal-left" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"  stopColor="#173d6f" />
          <stop offset="55%" stopColor="#226d9a" />
          <stop offset="100%" stopColor="#3c9c63" />
        </linearGradient>
        <radialGradient id="bhn-petal-shine" cx="0.35" cy="0.3" r="0.55">
          <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {/* One petal pointing up. Tip at (24, 2), curls down and around
            to (24, 22) just past the centre so 90° rotations meet at the
            4-pointed star. */}
        <symbol id="bhn-petal-mark" viewBox="0 0 48 48">
          <path
            d="M 24 2
               C 35 2 43 9 43 19
               C 43 24 39 26 33 25
               C 28 23 26 23 24 23
               C 22 23 20 23 15 25
               C 9 26 5 24 5 19
               C 5 9 13 2 24 2
               Z"
          />
        </symbol>
      </defs>

      {/* Four petals — base gradient + a soft white shine overlay on
          each so the ribbons read with a hint of depth. */}
      <g>
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-top)" />
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-shine)" />
      </g>
      <g transform="rotate(90 24 24)">
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-right)" />
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-shine)" />
      </g>
      <g transform="rotate(180 24 24)">
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-bottom)" />
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-shine)" />
      </g>
      <g transform="rotate(270 24 24)">
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-left)" />
        <use href="#bhn-petal-mark" fill="url(#bhn-petal-shine)" />
      </g>

      {/* Central 4-pointed star — drawn as a white fill on top so it
          reads as the negative-space cut-out without requiring path
          subtraction. */}
      <path
        d="M 24 16
           C 25 20 28 23 32 24
           C 28 25 25 28 24 32
           C 23 28 20 25 16 24
           C 20 23 23 20 24 16
           Z"
        fill="#ffffff"
      />
    </svg>
  );
}

interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "light";
  className?: string;
}

const markSize = { sm: 28, md: 36, lg: 44 };
const wordmarkSize = { sm: "text-sm", md: "text-base", lg: "text-lg" };

/**
 * Mark + wordmark. The wordmark is intentionally thin on "Training"
 * for an airy, modern flow.
 */
export function Logo({ size = "md", variant = "default", className }: LogoProps) {
  const isLight = variant === "light";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark size={markSize[size]} className="drop-shadow-glow-brand" />
      <div className="leading-tight">
        <p className={cn(
          "font-semibold tracking-tight",
          wordmarkSize[size],
          isLight ? "text-white" : "text-fg"
        )}>
          BHN<span className={cn("font-light ml-1.5", isLight ? "text-brand-100" : "text-brand-600")}>Training</span>
        </p>
      </div>
    </div>
  );
}
