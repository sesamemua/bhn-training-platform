"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ShieldCheck, Settings2, Check } from "lucide-react";
import { useConsent } from "./ConsentProvider";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * The CSS variable the banner publishes its footprint on. Read by the two
 * scrollers that exist: <body> on public routes and <main> in
 * (dashboard)/layout.tsx. Both spell it out literally, because Tailwind
 * only generates class names it can find whole in the source.
 */
const SPACE_VAR = "--consent-banner-space";

/** bottom-3 (12px) below the banner, plus a 12px gap above it so the
 *  page's last line does not sit flush against the banner's edge. */
const CLEARANCE_PX = 24;

/**
 * Keep the page scrollable clear of the banner while it is up.
 *
 * The banner is fixed to the bottom of the viewport, so on its own it sits
 * on top of whatever is underneath. On a short page that is the primary
 * action with no way to scroll it out — the VentureConnect apply page had
 * its Start button fully covered at 1280x720 and on a phone, so every
 * first-time applicant had to dismiss the banner before they could see
 * how to apply. Publishing the height lets each scroller pad by exactly
 * that much, and only while the banner is actually showing.
 *
 * offsetHeight rather than getBoundingClientRect: it ignores transforms,
 * so the slide-up entry animation cannot skew the reading. ResizeObserver
 * tracks "Customize" opening the category list; `remeasure` covers the
 * same change where ResizeObserver is unavailable.
 */
function useReservedSpace(ref: RefObject<HTMLDivElement | null>, active: boolean, remeasure: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(SPACE_VAR, `${el.offsetHeight + CLEARANCE_PX}px`);
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(SPACE_VAR);
    };
  }, [ref, active, remeasure]);
}

/**
 * Bottom-of-page consent banner. Appears once until the user picks one
 * of the three actions: Accept all, Necessary only, or Save preferences
 * (after toggling categories). Hidden once a decision has been made.
 */
export function CookieBanner() {
  const t = useT();
  const { consent, hasDecided, ready, setConsent } = useConsent();
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [marketing, setMarketing] = useState(consent.marketing);
  const regionRef = useRef<HTMLDivElement>(null);

  // Wait until we've checked localStorage on the client. Otherwise the
  // banner renders during SSR / first paint and flashes before the
  // effect tells us a decision was already made.
  const showing = ready && !hasDecided;
  useReservedSpace(regionRef, showing, expanded);
  if (!showing) return null;

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={t("consent.title")}
      className="fixed inset-x-3 bottom-3 z-50 max-w-3xl mx-auto animate-slide-up-in"
    >
      <div className="bg-card-solid border border-line rounded-[var(--radius-xl)] shadow-2xl shadow-brand-900/15 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Not a heading: this floating widget sits outside the page's own
                content flow, and its role="region" + aria-label above already
                supply the accessible name — an <h3> here could skip a level
                on pages whose own heading outline hasn't reached one yet. */}
            <p className="font-semibold text-fg" aria-hidden="true">{t("consent.title")}</p>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              {t("consent.body")}{" "}
              <Link href="/privacy" className="text-brand-600 underline underline-offset-2">
                {t("consent.privacyPolicy")}
              </Link>{" · "}
              <Link href="/terms" className="text-brand-600 underline underline-offset-2">
                {t("consent.termsOfService")}
              </Link>
            </p>

            {expanded && (
              <div className="mt-4 space-y-2">
                <CategoryRow
                  label={t("consent.necessary")}
                  hint={t("consent.necessaryHelp")}
                  checked
                  disabled
                />
                <CategoryRow
                  label={t("consent.analytics")}
                  hint={t("consent.analyticsHelp")}
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <CategoryRow
                  label={t("consent.marketing")}
                  hint={t("consent.marketingHelp")}
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {!expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-sm font-medium text-muted hover:text-fg px-3 py-2 inline-flex items-center gap-1.5"
                >
                  <Settings2 size={13} /> Customize
                </button>
              )}
              <button
                onClick={() => setConsent({ analytics: false, marketing: false })}
                className="text-sm font-medium text-muted hover:text-fg px-4 py-2 rounded-full border border-line hover:border-line-strong transition-colors"
              >
                {t("consent.necessaryOnly")}
              </button>
              {expanded && (
                <button
                  onClick={() => setConsent({ analytics, marketing })}
                  className="text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-full inline-flex items-center gap-1.5"
                >
                  <Check size={13} /> {t("consent.savePrefs")}
                </button>
              )}
              <button
                onClick={() => setConsent({ analytics: true, marketing: true })}
                className="text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-full shadow-sm shadow-brand-600/25 transition-colors"
              >
                {t("consent.acceptAll")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  label, hint, checked, disabled, onChange,
}: { label: string; hint: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className={cn(
      "flex items-start gap-3 p-3 rounded-xl border border-line",
      disabled ? "bg-elevated/50 cursor-not-allowed" : "hover:border-line-strong cursor-pointer"
    )}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 accent-brand-600"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        <p className="text-xs text-muted mt-0.5">{hint}</p>
      </div>
    </label>
  );
}
