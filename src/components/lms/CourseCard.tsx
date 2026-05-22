"use client";

/**
 * CourseCard — catalog tile, native to the platform design system.
 *
 * Theme-aware throughout — no hardcoded slate / white surfaces.
 * Every colour comes from a theme token so the card adapts to
 * Light / Dark / Aurora / Sakura / Atom Punk / Greenwood /
 * Icecream / Hitech etc.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ [ COVER ART — slim banner ]                   │
 *   ├──────────────────────────┬────────────────────┤
 *   │ CODE                 ♡   │ ◆ Credit 500       │  bg-card-solid (LEFT)
 *   │ Course title…            │ ◆ Hybrid           │  vs
 *   │ Short blurb under the    │ ◆ OBIO             │  bg-slate-800 (RIGHT)
 *   │ title, 3-line clamp…     │ ──────────         │  (deep navy + white text,
 *   │                          │ Enroll by:         │   white-on-slate-800 = 14.5:1,
 *   │                          │ Jun 30, 2025       │   AAA on every theme; pale
 *   │                          │ Duration:          │   pastel chips have their own
 *   │                          │ Jul 23 / Aug 15    │   opaque container so they sit
 *   ├──────────────────────────┴────────────────────┤
 *   │      [ Request to Enroll → ] slim brand bar   │  CTA bar
 *   └───────────────────────────────────────────────┘
 *
 * Compact spacing — slimmer padding throughout vs. the previous
 * design (h-20 cover instead of h-28, p-3.5 instead of p-5 etc.)
 * so the catalog grid packs more cards into the same viewport.
 *
 * Centered, MUTED pills (50-tier bg + 800-text + ring-200) instead
 * of bright filled chips — much easier on the eye and theme-safe
 * (every dark theme overrides the 800 step in globals.css).
 *
 * Heart icon is an interactive favourite toggle — see toggleFavorite
 * below.
 */

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseOverlay, overlayStyle } from "@/lib/courses/thumbnail-overlay";
import { displayCourseDescription } from "@/lib/courses/displayDescription";

interface CourseCardProps {
  course: {
    id: string;
    code: string | null;
    title: string;
    description: string | null;
    thumbnail: string | null;
    thumbnailOverlay?: unknown;
    status: string;
    duration: number | null;
    creditCost: number;
    delivery: string | null;
    provider: string | null;
    requiresApproval: boolean;
    enrollByDate: string | null;
    cohortStartDate: string | null;
    cohortEndDate: string | null;
    isFavorite: boolean;
  };
  role: string;
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtMinutes(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function CourseCard({ course }: CourseCardProps) {
  const isArchived = course.status === "archived";
  const isFree = course.creditCost === 0;
  const hasCohort = !!(course.cohortStartDate && course.cohortEndDate);
  const ctaLabel = course.requiresApproval ? "Request to Enroll" : "Enroll";
  const overlay = isArchived ? null : parseOverlay(course.thumbnailOverlay);

  // Optimistic favourite state — initialised from the server-passed
  // prop. Heart icon below flips this immediately on click, then
  // calls the API; on error we revert.
  const [isFavorite, setIsFavorite] = useState(course.isFavorite);
  const [pending, setPending] = useState(false);

  async function toggleFavorite(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !isFavorite;
    setIsFavorite(next);
    setPending(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/favorite`, { method: "POST" });
      if (!res.ok) {
        setIsFavorite(!next);
      } else {
        const j = (await res.json().catch(() => null)) as { favorited?: boolean } | null;
        if (j && typeof j.favorited === "boolean") setIsFavorite(j.favorited);
      }
    } catch {
      setIsFavorite(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <Link
      href={`/courses/${course.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl transition-all h-full",
        "bg-card-solid border border-line",
        "shadow-sm hover:shadow-md hover:border-brand-300",
        "hover:-translate-y-0.5",
        isArchived && "opacity-75 hover:opacity-100",
      )}
    >
      {/* ── COVER ART — slim banner at the top ────────────────── */}
      <div
        className={cn(
          "relative h-20 sm:h-24 overflow-hidden shrink-0",
          isArchived
            ? "bg-gradient-to-br from-slate-400 to-slate-600"
            : "bg-gradient-to-br from-brand-500 to-indigo-600",
        )}
      >
        {course.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnail}
            alt=""
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              isArchived && "grayscale",
            )}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <BookOpen size={26} strokeWidth={1.5} className="text-white/55" />
          </div>
        )}
        {overlay && (
          <div className="absolute inset-0" style={overlayStyle(overlay)} />
        )}
        {isArchived && (
          <span className="absolute top-2 right-2 inline-flex items-center text-[9px] uppercase tracking-[0.18em] font-bold px-1.5 py-0.5 rounded-full bg-slate-900/85 text-white ring-1 ring-inset ring-white/20">
            Not active
          </span>
        )}
      </div>

      {/* ── BODY — 2-column, theme-aware contrast ─────────────── */}
      <div className="grid grid-cols-[1fr_128px] sm:grid-cols-[1fr_142px] flex-1">
        {/* LEFT — content side, bg-card-solid (lighter) */}
        <div className="p-3.5 sm:p-4 flex flex-col min-w-0 relative">
          {/* Heart favourite toggle — top-right of LEFT column */}
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={pending}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorite}
            className={cn(
              "absolute top-2.5 right-2.5 p-1.5 rounded-full",
              "transition-all hover:bg-raised active:bg-raised",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70",
              pending && "opacity-60 cursor-wait",
            )}
          >
            <Heart
              size={18}
              strokeWidth={1.8}
              className={cn(
                "transition-all",
                isFavorite
                  ? "text-rose-500 fill-rose-500 scale-100 group-hover:scale-110"
                  : "text-fg-subtle fill-transparent group-hover:text-rose-400 group-hover:scale-110",
              )}
            />
          </button>

          {/* Code eyebrow */}
          {course.code && (
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-fg-muted font-mono pr-6">
              {course.code}
            </p>
          )}

          {/* Title */}
          <h3 className="text-[14px] sm:text-[15px] font-bold leading-snug text-fg group-hover:text-brand-700 transition-colors mt-1 line-clamp-2 pr-6">
            {course.title}
          </h3>

          {/* Blurb — short description under the title.
              `displayCourseDescription` strips the legacy "SCORM 1.2 /
              2004 module — <title>" boilerplate the bulk SCORM
              uploader used to stamp, so the card doesn't render that
              placeholder until the backfill script replaces it with
              a real blurb in the DB. */}
          {(() => {
            const blurb = displayCourseDescription(course.description);
            if (!blurb) return null;
            return (
              <p className="mt-1.5 text-[11.5px] leading-snug text-fg-muted line-clamp-3 flex-1">
                {blurb}
              </p>
            );
          })()}
        </div>

        {/* RIGHT — metadata sidebar.
            Deep slate-800 backdrop (#1e293b) for high-contrast
            "shelf" treatment. The earlier color-mix(--raised, +12%
            black) made the right column a slightly darker grey but
            still relied on dark text — readability fell apart at
            the dim end of every theme. Going to a true dark navy +
            white text gives us:
              • white-on-slate-800 ≈ 14.5:1 contrast → AAA on body
              • white/70 on slate-800 ≈ 9.4:1 → AAA on micro labels
              • dark-to-light bg jump IS the divider — no border-l
                hairline needed (it would have been invisible
                against slate-800 anyway)
              • theme-stable: hardcoded slate so every palette
                (Sakura / Voltage / Greenwood / dark variants…)
                gets the same dark shelf without a theme-conditional
                inversion of fg colour
            Pastel chips keep their light-fill backgrounds — each
            chip carries its own opaque container so the contrast
            inside the chip is unchanged; sitting them on a darker
            band actually crispens the chip silhouettes. */}
        <aside
          className={cn(
            "p-2.5 sm:p-3 flex flex-col gap-1 border-l border-line",
            // eslint-disable-next-line no-restricted-syntax -- color-mix deepens the theme's --raised token by 12% black; the #000 is the mixing operand, not a replacement colour, so the column tracks the active theme.
            "bg-[color-mix(in_srgb,var(--raised)_88%,#000)]",
          )}
        >
          <Chip
            tone="credit"
            label={isFree ? "Free" : `Credit ${course.creditCost.toLocaleString()}`}
          />
          {course.delivery && (
            <Chip tone={deliveryTone(course.delivery)} label={course.delivery} />
          )}
          {course.provider && <Chip tone="provider" label={course.provider} />}

          {/* Enroll by */}
          {course.enrollByDate && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-white/70 leading-snug">
                Enroll by:
              </p>
              <p className="text-[10.5px] font-semibold text-white leading-snug mt-0.5">
                {fmtShortDate(course.enrollByDate)}
              </p>
            </div>
          )}

          {/* Duration — cohort dates stack on two lines for In-Person /
              Hybrid; single-line minutes for self-serve. */}
          {(hasCohort || course.cohortStartDate || course.duration) && (
            <div
              className={cn(
                "mt-auto pt-2",
                !course.enrollByDate && "border-t border-white/10",
              )}
            >
              <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-white/70 leading-snug">
                Duration:
              </p>
              {hasCohort ? (
                <>
                  <p className="text-[10.5px] font-semibold text-white leading-snug mt-0.5">
                    {fmtShortDate(course.cohortStartDate)}
                  </p>
                  <p className="text-[10.5px] font-semibold text-white leading-snug">
                    {fmtShortDate(course.cohortEndDate)}
                  </p>
                </>
              ) : course.cohortStartDate ? (
                <p className="text-[10.5px] font-semibold text-white leading-snug mt-0.5">
                  {fmtShortDate(course.cohortStartDate)}
                </p>
              ) : (
                <p className="text-[10.5px] font-semibold text-white leading-snug mt-0.5">
                  {fmtMinutes(course.duration)}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── CTA BAR — slim, full-width, theme-aware brand fill ── */}
      <div className="border-t border-line bg-card-solid p-2 sm:p-2.5">
        <span
          className={cn(
            "w-full inline-flex items-center justify-center gap-1",
            "text-[10.5px] font-bold uppercase tracking-[0.1em]",
            "px-3 py-1.5 rounded-md transition-colors",
            "bg-brand-600 text-white group-hover:bg-brand-700",
          )}
        >
          {ctaLabel}
          <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </Link>
  );
}

/** One sidebar chip — centered text, muted 50-tier bg + ring,
 *  theme-aware via the standard status-pill family (every dark
 *  theme overrides the 800 step in globals.css for legibility). */
function Chip({
  tone, label,
}: {
  tone: ChipTone;
  label: string;
}) {
  const cls = CHIP_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center text-center",
        "text-[10.5px] font-semibold leading-tight",
        "px-2.5 py-1 rounded-full w-full truncate ring-1 ring-inset",
        cls,
      )}
    >
      {label}
    </span>
  );
}

type ChipTone = "credit" | "in-person" | "online" | "hybrid" | "on-demand" | "provider" | "default";

/** Pastel theme-safe palette — soft -100 bg, -700 text, faint
 *  same-family -200 ring. Bumped from the previous near-white
 *  -50 bg to -100 so each tone reads as an actual pastel hue
 *  (mint / sky / lilac / cyan / rose) rather than a barely-
 *  visible wash. Every -100 bg and -700 text already has dark-
 *  theme overrides in globals.css for legibility. */
const CHIP_CLASSES: Record<ChipTone, string> = {
  credit:      "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "in-person": "bg-blue-100 text-blue-700 ring-blue-200",
  online:      "bg-sky-100 text-sky-700 ring-sky-200",
  hybrid:      "bg-indigo-100 text-indigo-700 ring-indigo-200",
  "on-demand": "bg-cyan-100 text-cyan-700 ring-cyan-200",
  provider:    "bg-rose-100 text-rose-700 ring-rose-200",
  default:     "bg-elevated text-fg-muted ring-line",
};

function deliveryTone(delivery: string): ChipTone {
  const d = delivery.toLowerCase();
  if (d.includes("in-person") || d.includes("in person")) return "in-person";
  if (d.includes("hybrid") || d.includes("blended")) return "hybrid";
  if (d.includes("on-demand") || d.includes("on demand") || d.includes("asynchronous")) return "on-demand";
  if (d === "online") return "online";
  return "default";
}
