"use client";
/**
 * Page header primitive. Adapts to the active design system.
 *
 *   Classic     — title + eyebrow + description stacked, no chrome
 *   Cinematic   — full-bleed GRAPHITE stage with a microfluidic chip
 *                 etched into it (channels, mixers, chambers, a
 *                 droplet generator). Eyebrow + title + description
 *                 render directly over it, in white. The same on
 *                 every theme: the header paints its own ground, and
 *                 only the fluid in the channels takes the brand
 *                 colour.
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
      {/* GRAPHITE STAGE — a slab of graphite with a microfluidic chip
          etched into it. The same header on every theme: it paints its
          own ground and sets its own title gradient, so it does not
          take the theme's hero colours (and needs none of the
          per-theme text overrides that go with them). */}
      <header
        className="full-bleed relative overflow-hidden -mt-8 mb-10 text-white"
        style={{
          backgroundColor: "#1b1d20",
          backgroundImage: "linear-gradient(118deg, #15171a 0%, #26292e 42%, #1d1f23 68%, #131517 100%)",
          ["--hero-title-gradient" as string]: "linear-gradient(120deg, #ffffff 0%, #c9d1d9 50%, #ffffff 100%)",
        }}
      >
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {/* (1) Graphite sheen — the soft metallic band a pencil-lead
                  surface shows where the light crosses it. */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.07) 47%, rgba(255,255,255,0.02) 56%, transparent 70%)" }}
          />
          {/* (2) Brushed grain — hair-fine diagonal strokes, the way
                  graphite lies down on paper. */}
          <div
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "repeating-linear-gradient(118deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(118deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 9px)",
            }}
          />

          {/* (3) The microfluidic chip — channels, serpentine mixers,
                  chambers, a T-junction and a droplet generator, etched
                  as one repeating tile. It fades out toward the left so
                  it never sits behind the title and description. */}
          <svg
            className="absolute inset-0 h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              maskImage: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.25) 38%, #000 68%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.25) 38%, #000 68%)",
            }}
          >
            <defs>
              <pattern id="ds-microfluidic" width="480" height="180" patternUnits="userSpaceOnUse">
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
                    {/* Reaction chambers */}
                    <circle cx="190" cy="50" r="20" />
                    <rect x="100" y="116" width="60" height="28" rx="14" />
                    {/* Inlet ports on the droplet generator */}
                    <circle cx="345" cy="15" r="5" />
                    <circle cx="345" cy="85" r="5" />
                  </g>
                  {/* Fluid in the system — the one accent, in the brand colour. */}
                  <g stroke="var(--brand-400, #38bdf8)" strokeWidth="2" opacity="0.55">
                    <path d="M132 50 H170 M210 50 H260 V130 H300" />
                    <circle cx="190" cy="50" r="13" fill="var(--brand-400, #38bdf8)" fillOpacity="0.14" />
                  </g>
                </g>
                {/* Droplets leaving the generator */}
                <g fill="var(--brand-400, #38bdf8)" opacity="0.6">
                  <circle cx="378" cy="50" r="3" />
                  <circle cx="400" cy="50" r="3" />
                  <circle cx="422" cy="50" r="3" />
                  <circle cx="444" cy="50" r="3" />
                  <circle cx="466" cy="50" r="3" />
                </g>
                {/* Junction nodes */}
                <g fill="#8b949e" opacity="0.55">
                  <circle cx="260" cy="50" r="2.5" />
                  <circle cx="260" cy="130" r="2.5" />
                  <circle cx="345" cy="50" r="2.5" />
                </g>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#ds-microfluidic)" />
          </svg>

          {/* (4) Edge vignette — the slab darkens toward its edges. */}
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse 110% 140% at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.4) 100%)" }}
          />

          {/* (5) Fine mineral grain, so the gradients do not band. */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.16] mix-blend-overlay" xmlns="http://www.w3.org/2000/svg">
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

          {/* (6) A hairline at the foot — the cut edge of the slab. */}
          <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22) 30%, rgba(255,255,255,0.22) 70%, transparent)" }} />
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
                    // A cool glow, not a rainbow: it sits on graphite now.
                    background:
                      "radial-gradient(circle, color-mix(in srgb, var(--brand-400, #38bdf8) 55%, transparent) 0%, rgba(255,255,255,0.18) 45%, transparent 72%)",
                  }}
                />
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white ring-4 ring-white shadow-cover-disc flex items-center justify-center text-brand-700">
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
