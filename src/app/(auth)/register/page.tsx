"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Script from "next/script";
import Link from "next/link";
import {
  Mail, Info, CheckCircle2, Eye, EyeOff, Sparkles, Coins, Loader2, AlertCircle,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { LOCALES } from "@/lib/i18n/dictionaries";
import { INSTITUTIONS } from "@/lib/equip/institutions";
import {
  appendCampaignAttribution,
  campaignAuthUrl,
  safeInternalPath,
} from "@/lib/campaign/attribution";
import { getCampaignAttribution } from "@/lib/campaign/attribution-client";

// Cloudflare Turnstile site key (public). When unset, no CAPTCHA is
// rendered and the server skips verification — this keeps preview /
// local dev frictionless. Ops sets it for production.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

// Make Cloudflare's global available to TS without dragging in their typings.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: { sitekey: string; callback?: (token: string) => void; "error-callback"?: () => void; theme?: "light" | "dark" | "auto" },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type NewsletterChoice = "subscribe" | "no" | "already";
type Stage = "idle" | "creating" | "signing-in" | "redirecting";

const JOB_TITLES = [
  "Master's student",
  "PhD candidate",
  "Postdoctoral Fellow",
  "Research Associate",
  "Lab Technician",
  "Industry Professional",
  "Other",
];

function defaultLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const guess = navigator.language?.slice(0, 2) ?? "en";
  return LOCALES.find((l) => l.id === guess) ? guess : "en";
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    jobTitle: "",
    locale: defaultLocale(),
    // Institution capture — one of the 41 BHN-partner slugs from
    // lib/equip/institutions.ts, plus an "other" branch. Stored
    // into User.organization on the server so Equip applications
    // (and any other form that pre-fills from user.organization)
    // get the value without re-asking.
    institution: "",
    institutionOther: "",
  }));
  // Default to "no" — under CASL + GDPR a pre-selected opt-in isn't
  // legally valid consent (Planet49 / CRTC guidance). We require an
  // explicit affirmative tick before the register API pushes the user
  // to Mailchimp in "pending" status (double-opt-in confirmation).
  const [newsletter, setNewsletter] = useState<NewsletterChoice>("no");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage>("idle");

  // Turnstile state. Only meaningful when TURNSTILE_SITE_KEY is set;
  // otherwise turnstileToken stays null and the server skips
  // verification for that request.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileContainerId = "bhn-turnstile-widget";

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    function tryRender() {
      if (turnstileWidgetId.current) return;
      if (!window.turnstile) return;
      const container = document.getElementById(turnstileContainerId);
      if (!container) return;
      turnstileWidgetId.current = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "auto",
        callback: (token: string) => setTurnstileToken(token),
        "error-callback": () => setTurnstileToken(null),
      });
    }
    // The Turnstile script may load before this effect runs, or after.
    // Try once now, and again on a window event when the script signals
    // ready. Polling once a tick covers either order.
    tryRender();
    const id = setInterval(() => {
      if (window.turnstile) { tryRender(); clearInterval(id); }
    }, 200);
    return () => {
      clearInterval(id);
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side guards (server will re-validate)
    if (form.name.trim().length < 2) {
      setError("Please enter your full name."); return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters."); return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("Passwords don't match."); return;
    }
    // Turnstile gate (only when configured).
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the bot check."); return;
    }

    const submitAttribution = getCampaignAttribution();
    const callbackUrl = safeInternalPath(
      new URLSearchParams(window.location.search).get("callbackUrl"),
    );
    setStage("creating");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        newsletter,
        jobTitle: form.jobTitle || undefined,
        locale: form.locale,
        institution: form.institution || undefined,
        institutionOther: form.institutionOther || undefined,
        turnstileToken,
        campaignAttribution: submitAttribution,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Registration failed");
      setStage("idle");
      // Reset Turnstile so the next submit gets a fresh token —
      // tokens are single-use and a stale one will fail server-side.
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId.current);
        setTurnstileToken(null);
      }
      return;
    }

    // Auto sign-in — no /login round-trip.
    setStage("signing-in");
    const r = await signIn("credentials", {
      email: form.email,
      password: form.password,
      remember: "true",
      redirect: false,
    });
    if (!r?.ok) {
      // Fall back to the explicit login page if auto sign-in fails for any reason.
      const fallbackLogin = appendCampaignAttribution(
        `/login?registered=1&email=${encodeURIComponent(form.email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        submitAttribution,
      );
      router.push(fallbackLogin);
      return;
    }

    setStage("redirecting");
    router.push(callbackUrl);
    router.refresh();
  }

  const inputCls =
    "w-full bg-card-solid text-fg border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all";

  // Active progress card — shown while we're creating + signing in
  if (stage !== "idle") {
    const lines = [
      { label: "Creating your account",      done: stage !== "creating" },
      { label: "Signing you in",              done: stage === "redirecting" },
      { label: "Loading your dashboard",      done: false },
    ];
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-card to-brand-100 px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl shadow-xl shadow-brand-900/5 border border-line p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
              <Sparkles size={22} className="animate-pulse" />
            </div>
            <h1 className="text-xl font-bold text-fg">Setting up your account…</h1>
            <p className="text-sm text-muted mt-1">A couple of seconds — sit tight.</p>
            <ul className="mt-5 text-left text-sm text-fg space-y-2 max-w-xs mx-auto">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  {l.done ? (
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  ) : (
                    <Loader2 size={14} className="text-brand-600 animate-spin shrink-0" />
                  )}
                  <span className={l.done ? "text-muted line-through" : "text-fg"}>{l.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-card to-brand-100 px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/login" className="flex justify-center mb-8">
          <Logo size="lg" />
        </Link>

        <div className="bg-card rounded-2xl shadow-xl shadow-brand-900/5 border border-line p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-fg">Welcome to BHN — let&apos;s get you set up.</h1>
            <p className="text-muted text-sm mt-1.5 leading-relaxed">
              Free to start. <span className="inline-flex items-center gap-1 text-fg font-medium"><Coins size={11} className="text-amber-500" /> 200 BHN credits</span> on the house — most courses cost 50–200 — with another 4,800 available after admin review.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2 inline-flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Full name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                autoFocus
                className={inputCls}
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Email <span className="text-rose-600">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
                className={inputCls}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Password <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls + " pr-10"}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-subtle hover:text-fg rounded"
                  tabIndex={-1}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Confirm password <span className="text-rose-600">*</span>
              </label>
              <input
                type={showPw ? "text" : "password"}
                value={form.passwordConfirm}
                onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputCls}
                placeholder="Type it again"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-job-title" className="block text-xs font-medium text-muted mb-1.5">
                  I am a… <span className="text-subtle">(optional)</span>
                </label>
                <select
                  id="reg-job-title"
                  value={form.jobTitle}
                  onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Pick later in profile</option>
                  {JOB_TITLES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reg-locale" className="block text-xs font-medium text-muted mb-1.5">Language</label>
                <select
                  id="reg-locale"
                  value={form.locale}
                  onChange={(e) => setForm({ ...form, locale: e.target.value })}
                  className={inputCls}
                >
                  {LOCALES.map((l) => (
                    <option key={l.id} value={l.id}>{l.nativeName} ({l.name})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Institution — pre-fills Equip applications + every
                other form on the platform that reads from
                user.organization. Stored as the official partner
                name (or free-text "Other"). */}
            <div>
              <label htmlFor="reg-institution" className="block text-xs font-medium text-muted mb-1.5">
                Institution / Affiliation <span className="text-subtle">(optional)</span>
              </label>
              <select
                id="reg-institution"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value, institutionOther: e.target.value === "other" ? form.institutionOther : "" })}
                className={inputCls}
              >
                <option value="">Pick later in profile</option>
                {INSTITUTIONS.map((i) => (
                  <option key={i.slug} value={i.slug}>{i.name}</option>
                ))}
                <option value="other">Other / not listed</option>
              </select>
              {form.institution === "other" && (
                <input
                  type="text"
                  value={form.institutionOther}
                  onChange={(e) => setForm({ ...form, institutionOther: e.target.value })}
                  maxLength={200}
                  placeholder="Name of your institution"
                  className={inputCls + " mt-2"}
                />
              )}
              <p className="text-[10px] text-subtle mt-1">
                Choose from the current 41-institution BioHubNet network, or pick &quot;Other&quot; for a free-text entry. Used to pre-fill funding-application forms automatically.
              </p>
            </div>

            {/* Newsletter — three-state opt-in */}
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <Mail size={14} className="text-brand-600" />
                BioHubNet newsletter
              </p>
              <p className="block text-xs text-muted mt-0.5 mb-3 leading-relaxed">
                Industry insights, training updates, and event invites — about once a month.
              </p>
              <fieldset className="space-y-1.5">
                <legend className="sr-only">Newsletter preference</legend>
                {([
                  { id: "subscribe", title: "Yes, sign me up", body: "We'll email you to confirm — click the link to finish subscribing." },
                  { id: "already",   title: "I'm already subscribed", body: "I'm on the list — no need to add me again." },
                  { id: "no",        title: "No thanks", body: "Don't add me to the newsletter." },
                ] as const).map((opt) => {
                  const checked = newsletter === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={
                        "flex items-start gap-3 px-3 py-2 rounded-lg border cursor-pointer select-none transition-colors " +
                        (checked
                          ? "bg-card-solid border-brand-300 ring-1 ring-brand-200"
                          : "bg-card-solid/60 border-line hover:border-brand-200")
                      }
                    >
                      <input
                        type="radio"
                        name="newsletter"
                        value={opt.id}
                        checked={checked}
                        onChange={() => setNewsletter(opt.id)}
                        className="sr-only peer"
                      />
                      <span
                        className={
                          "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors " +
                          (checked ? "border-brand-600" : "border-line")
                        }
                      >
                        {checked && <span className="w-2 h-2 rounded-full bg-brand-600" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-fg leading-tight flex items-center gap-1.5">
                          {opt.title}
                          {checked && opt.id === "subscribe" && <CheckCircle2 size={12} className="text-brand-600" />}
                        </span>
                        <span className="block text-xs text-muted leading-snug mt-0.5">{opt.body}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {newsletter === "subscribe" && (
                <div className="mt-3 flex items-start gap-2 text-[11px] text-muted bg-card rounded-lg border border-line px-3 py-2">
                  <Info size={12} className="text-brand-600 mt-0.5 shrink-0" />
                  <span>
                    After you create your account, watch for a confirmation email from BioHubNet
                    — click the link inside to finish subscribing. You can unsubscribe anytime
                    via the link at the bottom of any newsletter email.
                  </span>
                </div>
              )}
            </div>

            {/* Turnstile widget — only renders when site key is set.
                The container is always in the DOM so the useEffect
                can find it without race conditions. The script tag
                further down is conditional on the same key. */}
            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <div id={turnstileContainerId} />
              </div>
            )}

            <button
              type="submit"
              disabled={Boolean(TURNSTILE_SITE_KEY) && !turnstileToken}
              className="w-full bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-md shadow-brand-600/25 text-sm"
            >
              Create account
            </button>
          </form>

          {TURNSTILE_SITE_KEY && (
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              async
              defer
              strategy="afterInteractive"
            />
          )}

          <p className="text-center text-sm text-muted mt-6">
            Already have an account?{" "}
            <Link
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                const callbackUrl = safeInternalPath(
                  new URLSearchParams(window.location.search).get("callbackUrl"),
                );
                router.push(campaignAuthUrl("login", callbackUrl, getCampaignAttribution()));
              }}
              className="text-brand-600 hover:text-brand-700 hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
