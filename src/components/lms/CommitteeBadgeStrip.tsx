/**
 * CommitteeBadgeStrip — recognition surface for the signed-in user's
 * committee memberships. Renders on the dashboard.
 *
 * Two display modes, picked per-committee:
 *
 *   • PROUD BIG BADGE  — for committees whose primary sidebar item
 *     points at a `/committee/*` route (today: HQP Advisory). These
 *     are recognition-style committees the user is meant to wear
 *     visibly. Renders as a full-width gradient panel with a big
 *     award medal, committee name in display type, the committee
 *     description, and an "Open dashboard" CTA — designed to make
 *     the trainee proud and to be the obvious entrance point into
 *     the committee surface.
 *
 *   • COMPACT CHIP     — for committees whose work routes through
 *     `/admin/*` (today: EQUIP Review). Members are usually staff
 *     who get to those routes via the Administration nav anyway;
 *     the chip is just a tag, not an entry point.
 *
 * Server component — queries Prisma on render. Auto-hides for users
 * with zero memberships so unconditional mount is safe.
 */
import Link from "next/link";
import {
  Award,
  ArrowRight,
  Rocket,
  Users,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { getCommitteeMetaForUser } from "@/lib/committees/membership";
import type { CommitteeSidebarItem } from "@/lib/committees/registry";

const ICONS: Record<
  CommitteeSidebarItem["icon"],
  React.ComponentType<{ size?: number; className?: string }>
> = {
  Rocket,
  Users,
  Award,
  ClipboardList,
  Sparkles,
};

/** Compact-chip background per badgeTone. Keep palette consistent
 *  with the rest of the brand (light tint + brand-coloured text). */
const CHIP_CLS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100",
  violet:  "bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100",
  amber:   "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
  sky:     "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100",
  rose:    "bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100",
};

/** Big-badge gradient + accent per badgeTone. Picks a dramatic
 *  multi-stop sweep so the proud badge reads as a recognition
 *  artefact, not another card. */
const PROUD_GRADIENT: Record<string, { bg: string; medal: string; text: string }> = {
  violet: {
    bg: "linear-gradient(135deg, #4c1d95 0%, #6d28d9 35%, #9333ea 65%, #c026d3 100%)",
    medal: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 60%, #f59e0b 100%)",
    text: "text-violet-100",
  },
  emerald: {
    bg: "linear-gradient(135deg, #064e3b 0%, #047857 35%, #10b981 65%, #34d399 100%)",
    medal: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 60%, #f59e0b 100%)",
    text: "text-emerald-100",
  },
  amber: {
    bg: "linear-gradient(135deg, #92400e 0%, #d97706 35%, #f59e0b 65%, #fbbf24 100%)",
    medal: "linear-gradient(135deg, #fff7ed 0%, #fbbf24 60%, #ea580c 100%)",
    text: "text-amber-100",
  },
  sky: {
    bg: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 35%, #0284c7 65%, #38bdf8 100%)",
    medal: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 60%, #f59e0b 100%)",
    text: "text-sky-100",
  },
  rose: {
    bg: "linear-gradient(135deg, #881337 0%, #be123c 35%, #e11d48 65%, #f43f5e 100%)",
    medal: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 60%, #f59e0b 100%)",
    text: "text-rose-100",
  },
};

interface Props {
  userId: string;
}

export async function CommitteeBadgeStrip({ userId }: Props) {
  if (!userId) return null;
  const committees = await getCommitteeMetaForUser(userId);
  if (committees.length === 0) return null;

  // Partition by display mode — proud big badges first (recognition
  // committees), compact chips after (admin-routed committees).
  const proud  = committees.filter((c) => c.sidebarItems[0]?.href.startsWith("/committee/"));
  const chips  = committees.filter((c) => !c.sidebarItems[0]?.href.startsWith("/committee/"));

  return (
    <div className="space-y-3">
      {proud.map((c) => {
        const link = c.sidebarItems[0];
        const Icon = link ? ICONS[link.icon] ?? Award : Award;
        const palette = PROUD_GRADIENT[c.badgeTone] ?? PROUD_GRADIENT.violet;
        const inner = (
          <article
            className="relative overflow-hidden rounded-3xl text-white px-5 sm:px-7 py-5 sm:py-6 shadow-elevated-panel surface-shadow"
            style={{ backgroundImage: palette.bg }}
          >
            {/* Soft halos to give the gradient depth */}
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 w-64 h-64 rounded-full bg-white/15 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-amber-300/30 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute top-4 right-6 hidden sm:block text-amber-200/70">
              <Sparkles size={18} />
            </div>

            <div className="relative flex items-center gap-5">
              {/* Medal — large golden disc with the committee icon. */}
              <div className="relative shrink-0">
                <div
                  aria-hidden
                  className="absolute -inset-3 rounded-full opacity-60 blur-2xl"
                  style={{ background: "conic-gradient(from 0deg, #fde68a, #fbbf24, #f59e0b, #fde68a, #fbbf24)" }}
                />
                <div
                  className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full ring-4 ring-white/85 shadow-medal flex items-center justify-center text-amber-900"
                  style={{ backgroundImage: palette.medal }}
                >
                  <Icon size={28} />
                </div>
              </div>

              {/* Title block */}
              <div className="min-w-0 flex-1">
                <p className={"text-[10px] uppercase tracking-[0.28em] font-black " + palette.text}>
                  ★ Committee member
                </p>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight mt-1">
                  {c.name}
                </h2>
                <p className="text-xs sm:text-sm text-white/85 leading-snug mt-1.5 max-w-2xl">
                  {c.description}
                </p>
              </div>

              {/* CTA arrow — only when there's a destination. */}
              {link && (
                <div className="shrink-0 hidden sm:flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/30 rounded-full px-4 py-2 text-xs font-bold text-white transition-colors">
                  Open dashboard <ArrowRight size={13} />
                </div>
              )}
            </div>
          </article>
        );
        return link ? (
          <Link
            key={c.slug}
            href={link.href}
            className="block group transition-transform hover:-translate-y-0.5"
            title={c.description}
          >
            {inner}
          </Link>
        ) : (
          <div key={c.slug}>{inner}</div>
        );
      })}

      {chips.length > 0 && (
        <section className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
            Also member of
          </span>
          {chips.map((c) => {
            const link = c.sidebarItems[0];
            const Icon = link ? ICONS[link.icon] ?? Award : Award;
            const toneCls = CHIP_CLS[c.badgeTone] ?? CHIP_CLS.violet;
            const inner = (
              <>
                <Icon size={12} />
                <span>{c.name}</span>
                {link && <ArrowRight size={11} className="opacity-60" />}
              </>
            );
            return link ? (
              <Link
                key={c.slug}
                href={link.href}
                className={
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors " +
                  toneCls
                }
                title={c.description}
              >
                {inner}
              </Link>
            ) : (
              <span
                key={c.slug}
                className={
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full ring-1 ring-inset " +
                  toneCls
                }
                title={c.description}
              >
                {inner}
              </span>
            );
          })}
        </section>
      )}
    </div>
  );
}
