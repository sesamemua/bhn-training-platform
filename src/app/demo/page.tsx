/**
 * /demo — the front door of the portfolio demo deployment.
 *
 * Three personas, one click each, no account and no password: the click
 * hits /api/demo/enter, which mints a magic token for a demo account and
 * signs the visitor in through the existing /sandbox/[token] route.
 *
 * 404s on production — this page only exists where NEXT_PUBLIC_DEMO_MODE
 * is set, so the route's presence in the codebase changes nothing there.
 */
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

export default function DemoEntryPage() {
  if (!demoMode()) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 md:py-24">
      <Logo />

      <h1 className="mt-10 text-3xl font-bold text-fg" style={{ textWrap: "balance" }}>
        A biomanufacturing training platform, open for inspection
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
        This is a live deployment of BioHubNet&apos;s training platform — the real codebase
        on synthetic data. Pick a seat and look around: everything is clickable, nothing
        needs an account, and the data resets itself.
      </p>

      <div className="mt-12">
        {PERSONA_KEYS.map((key) => {
          const c = PERSONA_CARDS[key];
          return (
            <Link
              key={key}
              href={`/api/demo/enter?persona=${key}`}
              prefetch={false}
              className="group flex items-baseline gap-4 border-t border-line py-6 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <span className="w-32 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                {c.title}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-fg">
                  {c.name}
                  <ArrowRight
                    size={14}
                    className="ml-2 inline -translate-x-1 align-[-2px] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                  />
                </span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{c.blurb}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-12 border-t border-line pt-6">
        <Link
          href="/demo/about"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900"
        >
          <BookOpen size={14} /> About this build — stack, scale, and a feature index
        </Link>
        <p className="mt-3 text-[12.5px] leading-relaxed text-subtle">
          Built by Ruilin Yuan for BioHubNet (Biomanufacturing Hub Network). Portfolio
          demonstration — every person, enrollment and company in here is synthetic.
        </p>
      </div>
    </main>
  );
}
