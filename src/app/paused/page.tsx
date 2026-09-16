/**
 * /paused — where the paused ENGAGE / EXPERIENCE pages land.
 *
 * On the production deployment those routes are not built (see
 * deploy/paused-routes.mjs) and next.config.ts redirects them here, so an
 * old bookmark or emailed link gets a plain explanation instead of a 404.
 * Everywhere else nothing redirects here, but the page still renders.
 *
 * Public and static: people arriving from /jobs or an employer invite may
 * not be signed in. English-only, like the other public legal/marketing
 * pages (privacy, terms) that render outside the i18n provider's reach.
 *
 * Pinned to the light theme on a white page: the official BioHubNet
 * lockup (public/biohubnet-logo.png, used as-is, never re-typeset) only
 * sits on white.
 */
/* eslint-disable @next/next/no-img-element -- the official lockup is
   shown exactly as published; next/image would re-encode it. */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Coins, LayoutDashboard } from "lucide-react";

/** The official colour lockup, as LOGO_COLOUR in components/forms/SiteChrome.tsx. */
const LOGO_COLOUR = { src: "/biohubnet-logo.png", width: 2357, height: 619 } as const;

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Paused for now · BioHubNet",
  description: "This part of BioHubNet is paused for now.",
  robots: { index: false, follow: false },
};

const NEXT_STEPS = [
  {
    href: "/dashboard",
    label: "Go to your dashboard",
    detail: "Sign in if you need to. Everything else is where you left it.",
    icon: LayoutDashboard,
  },
  {
    href: "/events",
    label: "Events",
    detail: "The Annual Symposium, Training Week and other BioHubNet events.",
    icon: CalendarDays,
  },
  {
    href: "/equip",
    label: "EQUIP funding",
    detail: "VentureConnect, VentureLift and the Innovation Fellowship carry on as usual.",
    icon: Coins,
  },
] as const;

export default function PausedPage() {
  return (
    <main data-theme="light" className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="inline-block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <img
            src={LOGO_COLOUR.src}
            width={LOGO_COLOUR.width}
            height={LOGO_COLOUR.height}
            alt="BioHubNet"
            decoding="async"
            className="h-12 w-auto"
          />
        </Link>

        <p className="mt-12 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700">
          Paused for now
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-fg tracking-tight" style={{ textWrap: "balance" }}>
          This part of BioHubNet is paused for now
        </h1>
        <p className="mt-4 text-base text-muted leading-relaxed">
          Training courses and pathways (ENGAGE) and placements, internships and the employer
          portal (EXPERIENCE) are taking a break on this site. The page you were heading to is
          part of one of them.
        </p>
        <p className="mt-3 text-base text-muted leading-relaxed">
          Nothing has been deleted. Events and EQUIP funding are not affected.
        </p>

        <ul className="mt-10 divide-y divide-line border-y border-line">
          {NEXT_STEPS.map(({ href, label, detail, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-center gap-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded-lg"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg">{label}</span>
                  <span className="block text-sm text-muted">{detail}</span>
                </span>
                <ArrowRight size={16} aria-hidden className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
