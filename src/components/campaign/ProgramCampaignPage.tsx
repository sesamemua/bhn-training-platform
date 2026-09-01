import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Check,
  Compass,
  FileCheck2,
  HandCoins,
  Route,
  UsersRound,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { CampaignAttributionCapture } from "./CampaignAttributionCapture";
import { CampaignInstitutionCheck } from "./CampaignInstitutionCheck";
import { appendCampaignAttribution, type CampaignAttribution } from "@/lib/campaign/attribution";
import type { CampaignProgramConfig } from "@/lib/campaign/programs";

const PROGRAM_STYLES = {
  engage: {
    overlay: "bg-brand-900/85",
    accent: "text-emerald-200",
    band: "bg-emerald-50/70",
    line: "border-emerald-300",
    icon: "bg-emerald-100 text-emerald-800",
  },
  experience: {
    overlay: "bg-brand-900/85",
    accent: "text-sky-200",
    band: "bg-sky-50/70",
    line: "border-sky-300",
    icon: "bg-sky-100 text-sky-800",
  },
  venture_connect: {
    overlay: "bg-brand-900/90",
    accent: "text-amber-200",
    band: "bg-amber-50/60",
    line: "border-amber-300",
    icon: "bg-amber-100 text-amber-900",
  },
} as const;

const BENEFIT_ICONS = [HandCoins, Route, UsersRound] as const;
const STEP_ICONS = [Compass, FileCheck2, BookOpenCheck] as const;

export function ProgramCampaignPage({
  config,
  attribution,
  activeDeadlineLabel,
}: {
  config: CampaignProgramConfig;
  attribution: CampaignAttribution;
  activeDeadlineLabel?: string | null;
}) {
  const styles = PROGRAM_STYLES[config.program];

  return (
    <div className="min-h-screen bg-page text-fg">
      <CampaignAttributionCapture attribution={attribution} />
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white px-4 py-3 font-bold text-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <header className="border-b border-line bg-card-solid">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-7" aria-label="Campaign programs">
          <Link href="/for-trainees" className="flex min-w-0 items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <LogoMark size={34} />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-black text-fg">BioHubNet Training</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">For trainees</span>
            </span>
          </Link>
          <div className="hidden items-center gap-5 text-sm font-semibold text-muted md:flex">
            {(["engage", "experience", "venture-connect"] as const).map((slug) => (
              <Link
                key={slug}
                href={appendCampaignAttribution(`/for-trainees/${slug}`, attribution)}
                aria-current={slug === config.slug ? "page" : undefined}
                className={slug === config.slug ? "text-brand-800" : "transition hover:text-fg"}
              >
                {slug === "venture-connect" ? "VentureConnect" : slug.toUpperCase()}
              </Link>
            ))}
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-md border border-line-strong px-3 py-2 text-sm font-bold text-fg transition hover:border-brand-400 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main id="main-content">
        <section className="relative isolate overflow-hidden border-b border-line bg-brand-900 text-white">
          <div
            aria-hidden
            className="absolute inset-0 -z-20 bg-cover bg-center"
            style={{
              backgroundImage: `url(${config.heroImage})`,
              backgroundPosition: config.heroImagePosition,
            }}
          />
          <div aria-hidden className={`absolute inset-0 -z-10 ${styles.overlay}`} />

          <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 sm:py-16">
            <div className="max-w-4xl">
              <p className={`text-xs font-black uppercase tracking-[0.18em] ${styles.accent}`}>
                {config.eyebrow}
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                {config.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-white/90 sm:text-lg sm:leading-8">
                {config.summary}
              </p>

              <div className="mt-7 flex flex-wrap items-stretch gap-4">
                <div className="border-l-4 border-white/65 bg-black/25 px-4 py-3 backdrop-blur-sm">
                  <p className="text-xl font-black text-white">{config.headlineFact}</p>
                  <p className="mt-1 max-w-sm text-sm leading-5 text-white/80">{config.headlineFactLabel}</p>
                </div>
                {activeDeadlineLabel ? (
                  <div className="border-l-4 border-amber-300 bg-black/25 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">Current deadline</p>
                    <p className="mt-1 text-sm font-bold text-white">{activeDeadlineLabel}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="#eligibility"
                  className="inline-flex min-h-12 items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-black text-brand-900 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
                >
                  Check institution eligibility <ArrowDown size={17} aria-hidden />
                </a>
                <a
                  href={config.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center gap-2 rounded-md border border-white/50 bg-black/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-black/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Official program details <ArrowUpRight size={16} aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-card-solid py-14 sm:py-18">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-7 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Who this is for</p>
              <p className="mt-3 text-xl font-bold leading-8 text-fg">{config.audience}</p>
            </div>
            <div>
              <h2 className="text-3xl font-black leading-tight text-fg sm:text-4xl">{config.gapHeading}</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted">{config.gapBody}</p>
            </div>
          </div>
        </section>

        <section className={`border-b border-line py-14 sm:py-18 ${styles.band}`}>
          <div className="mx-auto max-w-7xl px-5 sm:px-7">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">What the program provides</p>
            <div className="mt-7 grid gap-4 lg:grid-cols-3">
              {config.benefits.map((benefit, index) => {
                const Icon = BENEFIT_ICONS[index] ?? BriefcaseBusiness;
                return (
                  <article key={benefit.title} className="rounded-lg border border-line bg-card-solid p-5 shadow-sm">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-md ${styles.icon}`}>
                      <Icon size={19} aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-black text-fg">{benefit.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{benefit.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="eligibility" className="scroll-mt-6 border-b border-line bg-page py-14 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-7 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Eligibility</p>
              <h2 className="mt-3 text-3xl font-black text-fg">Check the institution before the application.</h2>
              <ul className="mt-6 space-y-3">
                {config.roles.map((role) => (
                  <li key={role} className="flex gap-3 text-sm leading-6 text-muted">
                    <Check size={17} className="mt-1 shrink-0 text-emerald-700" aria-hidden />
                    <span>{role}</span>
                  </li>
                ))}
              </ul>
              <p className={`mt-5 border-l-4 ${styles.line} pl-4 text-sm leading-6 text-muted`}>
                {config.roleNote}
              </p>
            </div>

            <CampaignInstitutionCheck
              program={config.program}
              programName={config.name}
              description={config.eligibilityDescription}
              applicationPath={config.applicationPath}
              authRequired={config.authRequired}
              primaryAction={config.primaryAction}
              contactEmail={config.contactEmail}
              attribution={attribution}
            />
          </div>
        </section>

        <section className="border-b border-line bg-card-solid py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-7">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Application path</p>
            <h2 className="mt-3 text-3xl font-black text-fg">From eligibility to the next step.</h2>
            <div className="mt-8 grid gap-8 lg:grid-cols-3">
              {config.steps.map((step, index) => {
                const Icon = STEP_ICONS[index] ?? Compass;
                return (
                  <article key={step.title} className="border-t-2 border-brand-300 pt-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-800">
                        <Icon size={18} aria-hidden />
                      </span>
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-muted">Step {index + 1}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-black text-fg">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-brand-900 py-14 text-white sm:py-18">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-7 lg:grid-cols-[0.75fr_1.25fr] lg:gap-14">
            <h2 className="text-3xl font-black leading-tight text-white">{config.roleHeading}</h2>
            <div>
              <p className="max-w-3xl text-base leading-7 text-white/85">{config.roleBody}</p>
              {config.partners.length ? (
                <ul className="mt-6 grid gap-x-5 gap-y-3 sm:grid-cols-2" aria-label="Example training delivery partners">
                  {config.partners.map((partner) => (
                    <li key={partner} className="border-l-2 border-emerald-300 pl-3 text-sm font-bold text-white">
                      {partner}
                    </li>
                  ))}
                  <li className="border-l-2 border-sky-300 pl-3 text-sm font-bold text-white">Other BioHubNet partners</li>
                </ul>
              ) : null}
            </div>
          </div>
        </section>

        <section className="bg-page py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-5 text-center sm:px-7">
            <p className="text-sm leading-6 text-muted">{config.disclaimer}</p>
            <a
              href="#eligibility"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-5 py-2.5 text-sm font-black text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Check eligibility and continue <ArrowDown size={16} aria-hidden />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-card-solid">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p>© {new Date().getFullYear()} BioHubNet, University of Toronto</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/terms" className="hover:text-fg">Terms</Link>
            <a href={`mailto:${config.contactEmail}`} className="hover:text-fg">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
