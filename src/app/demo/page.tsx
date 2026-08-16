import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { demoMode } from "@/lib/demo/mode";
import { PERSONA_CARDS, PERSONA_KEYS } from "@/lib/demo/personas";
import { Logo } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore the platform · BioHubNet demo",
  robots: { index: false, follow: false },
};

type PersonaKey = (typeof PERSONA_KEYS)[number];

/**
 * A petri-dish specimen disc: engraved initials at center, a per-role
 * instrument ring around them. The ring (`.demo-dial`) rotates slowly on
 * hover/focus via a motion-safe CSS keyframe declared on the page.
 */
function SpecimenDisc({
  personaKey,
  initials,
}: {
  personaKey: PersonaKey;
  initials: string;
}) {
  let ring: React.ReactNode;
  if (personaKey === "trainee") {
    // Dotted orbit — coursework beads on a track.
    ring = (
      <>
        <circle cx="88" cy="88" r="64" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.1 8.28" />
        <circle cx="88" cy="88" r="50" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="0.1 11.2" strokeOpacity="0.5" />
      </>
    );
  } else if (personaKey === "admin") {
    // Concentric system rings, two broken into arcs so rotation reads.
    ring = (
      <>
        <circle cx="88" cy="88" r="64" strokeWidth="1.5" />
        <circle cx="88" cy="88" r="57" strokeWidth="1.25" strokeOpacity="0.75" strokeDasharray="270 88.1" />
        <circle cx="88" cy="88" r="50" strokeWidth="1.25" strokeOpacity="0.55" />
        <circle cx="88" cy="88" r="44" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="200 76.5" />
      </>
    );
  } else {
    // Radial ticks — a hiring gauge / pipeline dial.
    ring = (
      <>
        {Array.from({ length: 48 }, (_, t) => {
          const a = (t / 48) * Math.PI * 2;
          const major = t % 6 === 0;
          const inner = major ? 47 : 55;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          return (
            <line
              key={t}
              x1={(88 + cos * inner).toFixed(2)}
              y1={(88 + sin * inner).toFixed(2)}
              x2={(88 + cos * 64).toFixed(2)}
              y2={(88 + sin * 64).toFixed(2)}
              strokeWidth={major ? 1.6 : 1}
              strokeOpacity={major ? 0.9 : 0.5}
            />
          );
        })}
      </>
    );
  }

  return (
    <svg viewBox="0 0 176 176" className="h-full w-full" aria-hidden="true" fill="none">
      {/* Dish rim + cardinal registration ticks (static) */}
      <g className="text-subtle" stroke="currentColor">
        <circle cx="88" cy="88" r="78" strokeWidth="1" strokeOpacity="0.35" />
        <path d="M88 4 v8 M88 164 v8 M4 88 h8 M164 88 h8" strokeWidth="1" strokeOpacity="0.4" />
      </g>
      {/* Instrument ring (rotates on hover, motion-safe) */}
      <g
        className="demo-dial text-brand-500 transition-colors duration-500 group-hover:text-brand-300"
        stroke="currentColor"
      >
        {ring}
      </g>
      {/* Engraved initials */}
      <g className="text-fg">
        <text
          x="90"
          y="90"
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          fillOpacity="0.92"
          fontSize="27"
          fontWeight="700"
          style={{ letterSpacing: "0.14em" }}
        >
          {initials}
        </text>
      </g>
    </svg>
  );
}

export default function DemoEntryPage() {
  if (!demoMode()) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-6 md:py-20">
      <style>{`
        .demo-dial { transform-origin: 50% 50%; }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes demo-dial-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .demo-seat:hover .demo-dial,
          .demo-seat:focus-visible .demo-dial {
            animation: demo-dial-spin 26s linear infinite;
          }
        }
      `}</style>

      {/* ——— Compressed intro ——— */}
      <header className="text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-400 sm:mt-8 sm:text-[11px] sm:tracking-[0.3em]">
          Live demo · No account · Data self-resets
        </p>
        <h1
          className="mx-auto mt-3 max-w-3xl text-[clamp(1.3rem,0.85rem+2.3vw,3rem)] font-bold leading-[1.12] text-fg sm:mt-4 sm:leading-[1.08]"
          style={{ textWrap: "balance" }}
        >
          A biomanufacturing training platform, open for inspection
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted sm:mt-4 sm:text-[15px]">
          The real BioHubNet codebase, running live on synthetic data. Pick a seat
          below — everything is clickable, and the platform resets itself overnight.
        </p>
      </header>

      {/* ——— Specimen stage ——— */}
      <div className="relative mt-12 md:mt-16">
        {/* Corner registration marks */}
        <span aria-hidden className="pointer-events-none absolute -left-1.5 -top-1.5 h-4 w-4 border-l border-t border-brand/70" />
        <span aria-hidden className="pointer-events-none absolute -right-1.5 -top-1.5 h-4 w-4 border-r border-t border-brand/70" />
        <span aria-hidden className="pointer-events-none absolute -bottom-1.5 -left-1.5 h-4 w-4 border-b border-l border-brand/70" />
        <span aria-hidden className="pointer-events-none absolute -bottom-1.5 -right-1.5 h-4 w-4 border-b border-r border-brand/70" />

        <div className="border border-line bg-card shadow-elevated">
          {/* Bench label rail */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-subtle">
              Specimen tray — pick a seat
            </span>
            <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-subtle sm:block">
              Seats 3 / 3 · Synthetic data
            </span>
          </div>

          <div className="grid md:grid-cols-3">
            {PERSONA_KEYS.map((key, i) => {
              const c = PERSONA_CARDS[key];
              const num = String(i + 1).padStart(2, "0");
              const initials = c.name
                .split(" ")
                .map((w: string) => w.charAt(0))
                .join("");
              return (
                <Link
                  key={key}
                  href={`/api/demo/enter?persona=${key}`}
                  prefetch={false}
                  className={`demo-seat group relative flex flex-col items-center gap-6 px-8 py-12 text-center outline-none transition-colors duration-300 hover:bg-brand-500/5 focus-visible:bg-brand-500/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 md:py-14 ${
                    i > 0 ? "border-t border-line md:border-l md:border-t-0" : ""
                  }`}
                >
                  {/* Disc + halo */}
                  <span className="relative mt-1">
                    <span
                      aria-hidden
                      className="absolute -inset-4 rounded-full bg-brand-500/15 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    />
                    <span className="relative flex h-40 w-40 items-center justify-center rounded-full border border-line-strong bg-elevated shadow-card-rest transition-all duration-500 will-change-transform group-hover:-translate-y-2 group-hover:border-brand/60 group-hover:shadow-card-hover motion-reduce:transition-none md:h-44 md:w-44">
                      <SpecimenDisc personaKey={key} initials={initials} />
                    </span>
                  </span>

                  {/* Specimen label — the ROLE is the headline: a visitor is
                      choosing which view of the platform to enter, so "Trainee
                      view / Admin view / Hiring partner view" leads and the
                      persona's name supports. */}
                  <span className="flex flex-col items-center gap-2">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand-400">
                      Seat {num}
                    </span>
                    {/* min-h reserves two lines so the "as …" row sits at the
                        same height on every seat whether the role wraps or not */}
                    <span
                      className="flex items-center text-[clamp(1.55rem,1.15rem+1.4vw,2.1rem)] font-bold leading-[1.08] tracking-tight text-fg md:min-h-[2.2em]"
                      style={{ textWrap: "balance" }}
                    >
                      {c.title} view
                    </span>
                    <span className="text-[14.5px] font-semibold text-muted">
                      as {c.name}
                    </span>
                    <span className="mt-1 max-w-[36ch] text-[13.5px] leading-relaxed text-muted">
                      {c.blurb}
                    </span>
                  </span>

                  {/* CTA — aligned across seats via mt-auto */}
                  <span className="relative mt-auto inline-flex items-center gap-2 pt-2 text-[13px] font-bold uppercase tracking-[0.14em] text-brand-400 transition-colors duration-300 group-hover:text-brand-200">
                    Take this seat
                    <ArrowRight
                      size={14}
                      className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                    />
                    <span
                      aria-hidden
                      className="absolute -bottom-1 left-0 right-0 h-px origin-left scale-x-0 bg-brand-400/70 transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ——— Footer ——— */}
      <footer className="mt-14 border-t border-line pt-8 text-center">
        <Link
          href="/demo/about"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-400 outline-none transition-colors hover:text-brand-200 focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <BookOpen size={14} /> About this build — stack, scale, and a feature index
        </Link>
        <p className="mx-auto mt-3 max-w-md text-[12.5px] leading-relaxed text-subtle">
          Built by Ruilin Yuan for BioHubNet (Biomanufacturing Hub Network). Portfolio
          demonstration — every person, enrollment and company in here is synthetic.
        </p>
      </footer>
    </main>
  );
}
