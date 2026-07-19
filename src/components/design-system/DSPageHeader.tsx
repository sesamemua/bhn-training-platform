"use client";
/**
 * Page header primitive. Adapts to the active design system.
 *
 *   Classic     — title + eyebrow + description stacked, no chrome
 *   Cinematic   — full-bleed THEME-DRIVEN gradient mesh stage. Eyebrow
 *                 + title + description render directly OVER the
 *                 gradient (no paper body underneath). Each theme
 *                 paints its own stage via its own `--hero-bg` +
 *                 `--hero-mesh-{1..4}` + `--hero-fg` tokens (defined
 *                 in globals.css); the `.hero-mesh-brand` utility
 *                 reads them and the existing per-theme contrast
 *                 layer (bottom scrim + light-hero text overrides
 *                 for icecream) ensures readable text everywhere.
 *   Studio      — full-bleed gradient-mesh hero with two drifting
 *                 blob shapes + a curve-down divider. Eyebrow on
 *                 brand-light text, gradient-text accent on the
 *                 title, description on white/85 below, all
 *                 inside the hero. Optional aside slot renders to
 *                 the right (eg. stat tiles).
 *
 * Page code stays a single declarative call:
 *
 *   <DSPageHeader
 *     eyebrow="Admin · platform"
 *     title="AutoPipette"
 *     icon={<Pipette size={22} />}
 *     description="Health, helpfulness, and findings for AutoPipette."
 *   />
 */
import type { ReactNode } from "react";
import { useDesignSystem } from "@/components/ui/DesignSystemProvider";
import { DSEyebrow } from "./DSEyebrow";
import { LayoutBannersSlot } from "@/components/layout/LayoutBanners";

interface Props {
  /** Small uppercase label above the title. Accepts a ReactNode so
   *  callers can include icons inline (e.g. `<><Compass size={11} />
   *  Program guide</>`). */
  eyebrow?: ReactNode;
  /** Page title — string or ReactNode. Some surfaces render dynamic
   *  fragments (e.g. `<>Hi, {firstName}.</>` on the dashboard). */
  title: ReactNode;
  description?: React.ReactNode;
  /** Optional icon — pass a React element (not a component
   *  reference), e.g. `icon={<Rocket size={22} className="text-brand-600" />}`.
   *
   *  Why an element and not a `ComponentType`: passing a function
   *  reference (like `icon={Rocket}`) as a prop from a server
   *  component to a client component is rejected by Next.js 16 +
   *  React 19 + Turbopack — only serializable values + React
   *  elements cross the boundary. The bug showed up as a generic
   *  "An error occurred in the Server Components render" with no
   *  recoverable message. */
  icon?: ReactNode;
  /** Studio-only optional slot rendered to the right of the
   *  title block (eg. a 2x2 stat-tile grid). Classic + Cinematic
   *  ignore. */
  aside?: ReactNode;
  /** Studio-only call-to-action buttons rendered below the
   *  description. Classic + Cinematic ignore. */
  actions?: ReactNode;
}

export function DSPageHeader({ eyebrow, title, description, icon, aside, actions }: Props) {
  const { designSystem } = useDesignSystem();

  if (designSystem === "studio") {
    return (
      <>
      <section className="full-bleed relative overflow-hidden text-white -mt-8 mb-2 hero-mesh-brand">
        {/* Drifting blob shapes — purely decorative, masked by
            the parent overflow-hidden. Drift animation respects
            prefers-reduced-motion via the CSS rule. */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="blob-shape blob-soft drift" style={{ width: 540, height: 540, top: -180, left: -160 }} />
          <div className="blob-shape blob-soft drift-slow" style={{ width: 660, height: 660, bottom: -260, right: -180, opacity: 0.55 }} />
        </div>

        <div className="relative max-w-screen-2xl mx-auto px-6 pt-14 pb-16">
          <div className={"grid gap-10 items-end " + (aside ? "md:grid-cols-[2fr_1fr]" : "")}>
            <div className="min-w-0">
              {eyebrow && (
                <DSEyebrow tone="onDark">
                  {icon && <span className="inline-flex items-center justify-center w-4 h-4 text-white/85">{icon}</span>}
                  {eyebrow}
                </DSEyebrow>
              )}
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] mt-3"
              >
                <span
                  className="gradient-text"
                  style={{
                    backgroundImage:
                      "var(--hero-title-gradient, linear-gradient(120deg, rgba(255,255,255,0.95) 0%, var(--brand-200, #bae6fd) 55%, rgba(255,255,255,0.95) 100%))",
                  }}
                >
                  {title}
                </span>
              </h1>
              {description && (
                <p className="mt-4 text-white/85 leading-relaxed text-sm md:text-base max-w-2xl">
                  {description}
                </p>
              )}
              {actions && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {actions}
                </div>
              )}
            </div>
            {aside && <div className="min-w-0">{aside}</div>}
          </div>
        </div>
        <div className="curve-down" />
      </section>
      {/* Platform rule: hero is the absolute top. Layout-level
          banners render immediately after via the context slot. */}
      <LayoutBannersSlot />
      </>
    );
  }

  if (designSystem === "cinematic") {
    // Cinematic renders as ONE continuous editorial stage — no
    // cover-vs-body split. The full-bleed `.hero-mesh-brand` panel
    // carries the theme's `--hero-bg` base + four big blurred
    // auroras (using `--hero-mesh-{1..4}`) that span the entire
    // height, with fine SVG noise for editorial texture and the
    // universal `::before` bottom-anchored scrim from
    // `.hero-mesh-brand` as the contrast cushion under text.
    //
    // The content (icon + eyebrow + title + description + actions)
    // is anchored to the BOTTOM of the stage via a large top
    // padding — same composition as a magazine cover, where the
    // image lives up top and the copy weighs in at the bottom edge.
    //
    // Text colour comes from each theme's `--hero-fg` (white on
    // dark stages, deep berry on Icecream's light pink stage via
    // the per-theme override in globals.css). The title's
    // gradient-text shimmer is driven by `--hero-title-gradient`,
    // also overridable per theme — Icecream swaps it to a deep
    // berry ramp so the title stays legible on pink.
    const hasIcon = Boolean(icon);
    const hasAside = Boolean(aside);

    return (
      <>
      <header className="full-bleed relative overflow-hidden -mt-8 mb-10 hero-mesh-brand">
        {/* Decoration layer — wraps the auroras + noise inside ONE
            absolute container. This is load-bearing: globals.css has
            `.hero-mesh-brand > * { position: relative }` which forces
            every direct child into the flow. If the four aurora divs
            sat directly under `<header>`, that rule would turn them
            into 14–22 rem tall block elements stacked vertically,
            and the hero would balloon to ~1500 px tall. Wrapping them
            in an absolutely-positioned div takes the children out of
            the in-flow path — only the wrapper itself is the direct
            child of `.hero-mesh-brand`, and it's flattened to inset:0. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {/* ── ATMOSPHERIC STAGE — built to feel like the /login
                page's spotlight stage but theme-aware. Layers,
                top-to-bottom in z-order:
                  (1) deep radial dome from the theme's hero-mesh-1
                  (2) aurora wash — cyan + green theme-tinted glows
                      around the top centre, like the /login stage
                  (3) tighter warm-white spotlight cone at top-centre
                  (4) visible reeded / fluted glass ribs (the
                      "fractal glass" effect — vertical lines at
                      strong contrast so the texture really reads)
                  (5) edge vignette so the stage feels theatrical
                  (6) fine SVG noise for editorial grain
                NO floating glyphs / draggables — strictly static. */}

          {/* (1) Deep radial dome from theme hero-mesh-1 — gives the
                  stage its theme-flavored sky. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 80% 110% at 50% -10%, color-mix(in srgb, var(--hero-mesh-1, #56bdf8) 60%, transparent) 0%, transparent 60%)",
            }}
          />

          {/* (2) Aurora wash — two soft theme-tinted radial glows at
                  the top centre, mirroring the /login spotlight pool. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle 600px at 50% 22%, color-mix(in srgb, var(--hero-mesh-1, #56bdf8) 35%, transparent) 0%, transparent 60%), radial-gradient(circle 480px at 50% 30%, color-mix(in srgb, var(--hero-mesh-3, #4ade80) 28%, transparent) 0%, transparent 65%)",
            }}
          />

          {/* (3) Spotlight cone — tighter warm-white ellipse over the
                  aurora wash, like a theatre's key light. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 32% 28% at 50% 18%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 50%, transparent 75%)",
            }}
          />

          {/* (4) Reeded / fluted glass ribs — repeating vertical
                  stripe pattern with strong soft-light highlight +
                  overlay shadow per rib. This is the "fractal glass"
                  effect the user wanted — visible vertical-line
                  texture across the whole stage. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1.5px, transparent 1.5px, transparent 6px, rgba(0,0,0,0.18) 7px, rgba(0,0,0,0.18) 8.5px, transparent 8.5px, transparent 10px)",
              mixBlendMode: "overlay",
            }}
          />
          {/* Finer rib micro-texture between the main grooves */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)",
              mixBlendMode: "soft-light",
            }}
          />

          {/* (5) Edge vignette — gentle darkening at corners so the
                  stage feels framed. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 110% 130% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.32) 100%)",
            }}
          />

          {/* (6) Fine SVG noise grain — keeps the gradients from
                  banding, gives editorial print feel. */}
          <svg
            className="absolute inset-0 w-full h-full opacity-[0.14] mix-blend-overlay"
            xmlns="http://www.w3.org/2000/svg"
          >
            <filter id="ds-cinematic-noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 1
                        0 0 0 0 1
                        0 0 0 0 1
                        0 0 0 0.4 0"
              />
            </filter>
            <rect width="100%" height="100%" filter="url(#ds-cinematic-noise)" />
          </svg>
        </div>

        {/* CONTENT — compact banner. `min-h` is small (10/11/12rem)
            so the gradient never eats the viewport; content takes
            the natural space inside, with `justify-end` keeping the
            magazine-cover bottom-anchor when there's empty room
            above. The `.hero-mesh-brand::before` scrim handles
            contrast under text on dark stages. */}
        <section
          aria-label="Page header"
          className="relative max-w-screen-2xl mx-auto px-6 sm:px-10 lg:px-14 py-5 sm:py-6 lg:py-8 min-h-[7rem] sm:min-h-[8rem] lg:min-h-[9rem] flex flex-col justify-end"
        >
          <div className={`grid gap-6 sm:gap-8 items-end grid-cols-1 ${hasIcon ? "sm:grid-cols-[auto_1fr]" : ""}`}>
            {/* Icon disc — white tile with conic-gradient glow ring */}
            {hasIcon && (
              <div className="relative shrink-0">
                <div
                  aria-hidden
                  className="absolute -inset-4 rounded-full opacity-60 blur-2xl"
                  style={{
                    background:
                      "conic-gradient(from 0deg, rgba(56,189,248,0.5), rgba(244,114,182,0.5), rgba(250,204,21,0.4), rgba(74,222,128,0.4), rgba(56,189,248,0.5))",
                  }}
                />
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white ring-4 ring-white shadow-pedestal flex items-center justify-center text-brand-700">
                  {icon}
                </div>
              </div>
            )}

            {/* Title block */}
            <div className="min-w-0">
              {eyebrow && (
                <DSEyebrow tone="onDark">{eyebrow}</DSEyebrow>
              )}
              {/* Title — gradient-text via `--hero-title-gradient`,
                  defined per theme in globals.css. Default is a soft
                  white → brand-light → white shimmer on dark stages;
                  Icecream's light pink hero overrides to a deep berry
                  ramp. Inline `var(...)` resolves through the cascade
                  so the per-theme value wins. */}
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] mt-3"
                style={{
                  backgroundImage:
                    "var(--hero-title-gradient, linear-gradient(120deg, rgba(255,255,255,0.95) 0%, var(--brand-200, #bae6fd) 55%, rgba(255,255,255,0.95) 100%))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {title}
              </h1>
              {description && (
                <p className="mt-4 text-sm sm:text-base text-white/80 leading-relaxed max-w-3xl">
                  {description}
                </p>
              )}
              {actions && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {actions}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ASIDE — separate row below the identity, divided by a
            soft white-on-stage hairline. Used by pages that pass a
            stats payload (DSStatGrid). */}
        {hasAside && (
          <section
            aria-label="Page header aside"
            className="relative border-t border-white/10"
          >
            <div className="max-w-screen-2xl mx-auto px-6 sm:px-10 lg:px-14 py-8 sm:py-10">
              {aside}
            </div>
          </section>
        )}
      </header>
      {/* Platform rule: hero is the absolute top. Layout-level
          banners render immediately after via the context slot. */}
      <LayoutBannersSlot />
      </>
    );
  }

  // Classic — calm, structured, the original BHN look.
  return (
    <>
    <header>
      {eyebrow && <DSEyebrow>{eyebrow}</DSEyebrow>}
      <h1 className="text-2xl sm:text-3xl font-bold text-fg mt-1 tracking-tight inline-flex items-center gap-2">
        {icon}
        {title}
      </h1>
      {description && (
        <p className="text-sm text-muted mt-2 max-w-3xl leading-snug">{description}</p>
      )}
    </header>
    {/* Platform rule: hero is the absolute top. Layout-level
        banners render immediately after via the context slot. */}
    <LayoutBannersSlot />
    </>
  );
}
