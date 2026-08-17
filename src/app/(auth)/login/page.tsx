"use client";
import { useState, useEffect, Suspense, useId, cloneElement, isValidElement } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, Check, CheckCircle2, Coins, GraduationCap, Layers, Briefcase,
  FlaskConical, Rocket,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { DeepSeaStars } from "@/components/branding/DeepSeaStars";
import { LoginFloaters } from "@/components/branding/LoginFloaters";
import { ThemeCycler } from "@/components/ui/ThemePicker";
import { LoginAmbientMenu } from "@/components/branding/LoginAmbientMenu";

const REMEMBER_KEY = "bhn-remember-email";

// Top-level page wraps the form in Suspense — useSearchParams in
// Next.js 16 forces a Suspense boundary or static prerender errors.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-brand-50 via-card to-brand-100" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";
  const prefillEmail = params.get("email") ?? "";
  // Where to land after signing in. Links all over the app already pass
  // ?callbackUrl= (showcase, events, invites, emailed deep links) but it
  // was never read, so every one of them dumped the user on /dashboard.
  // Only same-site absolute paths are honoured — a full URL, or the
  // protocol-relative "//evil.com", would turn this into an open redirect.
  const rawCallback = params.get("callbackUrl") ?? "";
  const callbackUrl = /^\/(?!\/)/.test(rawCallback) ? rawCallback : "/dashboard";
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Two-step disclosure for MFA. After password is filled, we probe
  // /api/auth/mfa/check to see if the account has TOTP enabled — if
  // it does, the form expands a second field for the 6-digit code.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [totp, setTotp] = useState("");
  // Ambient-effects toggles for the login stage, wired to the
  // LoginAmbientMenu in the header. Default on; persisted per-device in
  // localStorage and read after mount (below) to avoid a hydration
  // mismatch. `showBling` gates the DeepSeaStars twinkle, `showFloaters`
  // gates the drifting biotech molecules.
  const [showFloaters, setShowFloaters] = useState(true);
  const [showBling, setShowBling] = useState(true);
  // Platform-wide master flags (set by admins on /admin/login-floaters).
  // Fetched on mount; a layer shows only when BOTH the global flag and
  // the per-device pref are on. Default true so first paint matches the
  // common case and a slow fetch never flash-hides the stage.
  const [globalFloaters, setGlobalFloaters] = useState(true);
  const [globalBling, setGlobalBling] = useState(true);
  // Admin-set entrance-stagger window (ms) for both ambient layers.
  const [globalAppearMs, setGlobalAppearMs] = useState(6000);

  // Pre-fill: ?email=… from registration / employer-invite fallback
  // takes priority; otherwise fall back to localStorage Remember-Me.
  useEffect(() => {
    if (prefillEmail) return;
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {}
  }, [prefillEmail]);

  // Restore ambient-effect prefs after mount (localStorage is unavailable
  // during SSR; reading here keeps first paint on the defaults so server
  // and client agree, then we reconcile to the saved choice).
  useEffect(() => {
    try {
      const f = localStorage.getItem("bhn-login-floaters");
      const b = localStorage.getItem("bhn-login-bling");
      if (f !== null) setShowFloaters(f !== "0");
      if (b !== null) setShowBling(b !== "0");
    } catch {}
  }, []);

  // Pull the platform-wide master flags so an admin's global off-switch
  // (set on /admin/login-floaters) wins over the per-device pref.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/login-floaters")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (typeof j?.floatersEnabled === "boolean") setGlobalFloaters(j.floatersEnabled);
        if (typeof j?.sparklesEnabled === "boolean") setGlobalBling(j.sparklesEnabled);
        if (typeof j?.appearMs === "number") setGlobalAppearMs(j.appearMs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleFloaters(v: boolean) {
    setShowFloaters(v);
    try { localStorage.setItem("bhn-login-floaters", v ? "1" : "0"); } catch {}
  }
  function toggleBling(v: boolean) {
    setShowBling(v);
    try { localStorage.setItem("bhn-login-bling", v ? "1" : "0"); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Persist or clear the remembered email
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
      // Mark this tab so we know whether to keep the session beyond the tab.
      sessionStorage.setItem("bhn-session-only", remember ? "0" : "1");
    } catch {}

    // First sign-in attempt without TOTP. Probe MFA status BEFORE
    // submitting so the UX expands cleanly when MFA is on.
    if (!mfaRequired) {
      try {
        const probe = await fetch("/api/auth/mfa/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const probeJson = await probe.json().catch(() => ({}));
        if (probeJson?.mfaRequired) {
          setMfaRequired(true);
          setLoading(false);
          return;
        }
      } catch { /* network blip — fall through and try the sign-in */ }
    }

    const res = await signIn("credentials", {
      email,
      password,
      totp: mfaRequired ? totp : "",
      remember: remember ? "true" : "false",
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(mfaRequired ? "Code didn't match — check your authenticator." : "Invalid email or password");
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden px-4 py-8 text-slate-100"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 60% at 50% -10%, #1e3a8a 0%, #0b0f24 55%, #050614 100%)",
      }}
    >
      {/* Aurora wash — gentle cyan/teal glow behind the petal so
          the brand colours register in the spotlight pool. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle 600px at 50% 22%, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0) 65%), radial-gradient(circle 500px at 50% 30%, rgba(63,168,106,0.18) 0%, rgba(63,168,106,0) 70%)",
        }}
      />
      {/* Spotlight cone — a tighter ellipse of warm-white over the
          aurora wash so the petal reads as the lit subject of a
          theatre stage. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 30% 22% at 50% 22%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 75%)",
        }}
      />

      {/* ─── DEEP-SEA STARS — featherweight twinkle / sea-star
           particles drifting downward through the stage like
           marine snow. Sit BEHIND the biotech glyphs (rendered
           next) so the foreground stays clean, ABOVE the
           spotlight wash so the stars feel like they live in
           the same atmosphere as the BHN petal. CSS-driven
           keyframes — no JS animation loop. Respects
           prefers-reduced-motion. Gated by the Sparkles switch in the
           header's ambient-effects menu, and by the global Sparkles
           master switch on /admin/login-floaters. */}
      {globalBling && showBling && <DeepSeaStars appearMs={globalAppearMs} />}

      {/* ─── BIOMANUFACTURING MOLECULES — periphery-only.
           Data-driven now: the active list lives in the
           `loginFloaters` PlatformSetting row, edited by admins
           on /admin/login-floaters. The renderer fetches the
           config from /api/login-floaters on mount, maps each
           entry through FLOATER_REGISTRY (the curated component
           library), and positions them via side + verticalPct.
           Used to be a hardcoded block of 5 floaters here. Gated by the
           Floating-molecules switch in the ambient-effects menu, and by
           the global master switch on /admin/login-floaters. */}
      {globalFloaters && showFloaters && <LoginFloaters />}

      {/* Vignette — gentle darken at the page edges so the
          spotlight pool reads as the focal area. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 90% at 50% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Top bar — small mark + theme cycler */}
      <header className="relative max-w-6xl mx-auto flex items-center justify-between mb-10 sm:mb-14">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <LogoMark size={32} className="drop-shadow-brand-glow-sky" />
          <span className="text-sm font-bold tracking-tight text-white">
            Bio<span className="text-sky-300">Hub</span><span className="text-emerald-300">Net</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {(globalFloaters || globalBling) && (
            <LoginAmbientMenu
              floatersAvailable={globalFloaters}
              blingAvailable={globalBling}
              floaters={showFloaters}
              bling={showBling}
              onToggleFloaters={toggleFloaters}
              onToggleBling={toggleBling}
            />
          )}
          <ThemeCycler />
        </div>
      </header>

      <main>
      {/* ─── TEASER HEADER ─────────────────────────────────────────
           Lab-coat tone, biotech wordplay. Sits in the lit pool of
           the spotlight, with the petal glowing above. Text colours
           hardcoded against the dark stage so they're readable
           regardless of the viewer's theme. */}
      <div className="relative max-w-6xl mx-auto mb-8 sm:mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-300/15 ring-1 ring-inset ring-amber-300/40 px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-black text-amber-200 backdrop-blur-sm">
          <FlaskConical size={11} aria-hidden className="motion-safe:animate-pulse" />
          Phase II · Incubating
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.05] max-w-3xl mx-auto drop-shadow-text-glow">
          Something big is{" "}
          <span
            className="inline-block text-emerald-200"
            style={{
              // Solid emerald-200 above is the contrast-checkable
              // fallback; the gradient overrides it where supported.
              backgroundImage:
                "linear-gradient(120deg, #7dd3fc 0%, #5eead4 50%, #86efac 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            culturing.
          </span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          BioHubNet is amplifying. New pathways, fresh internship rounds, and a cohort
          that keeps growing. Sign in to watch the lights come on — or pull up a pipette
          and join the next round.{" "}
          <span className="font-mono text-xs text-slate-400">// p &lt; 0.05, results pending</span>
        </p>
      </div>

      <div className="relative max-w-5xl mx-auto mt-12 sm:mt-16">
        {/*
         * Editorial split — 2 columns on lg, with a vertical
         * hairline divider between. No card chrome, no rounded
         * box; just lines, gradients, and breathing room. Each
         * column carries its own "01 / 02" runway-style number
         * stamp so the pair reads like a magazine spread.
         */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_1fr] gap-8 lg:gap-0 items-stretch">
          {/* ── 01 · NEW HERE ──────────────────────────────────────── */}
          <section className="lg:pr-12 flex flex-col">
            <div className="flex items-baseline justify-between mb-6">
              <span
                className="font-serif italic text-5xl leading-none"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, #7dd3fc 0%, #5eead4 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                01
              </span>
              <p className="text-[11px] uppercase tracking-[0.32em] font-semibold text-white/60">
                New here
              </p>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
              Start training{" "}
              <span className="font-serif italic font-normal text-white/85">with us</span>
            </h2>

            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Free to start.{" "}
              <span className="inline-flex items-center gap-1 text-white font-semibold">
                <Coins size={11} aria-hidden className="text-amber-300" /> 200 BHN credits
              </span>{" "}
              on the house — most courses cost 50–200, with 4,800 more available
              after admin review.
            </p>

            <ul className="mt-6 space-y-3 border-t border-white/10 pt-5">
              <Bullet icon={GraduationCap}>Industry-led training across biomanufacturing, regulatory, and analytical tracks</Bullet>
              <Bullet icon={Layers}>Pathways stack courses into focused career tracks (MSL, entrepreneurship, more)</Bullet>
              <Bullet icon={Briefcase}>Internship + full-time matching with vetted employer partners</Bullet>
              <Bullet icon={Rocket}>EQUIP funding — VentureConnect + VentureLift micro-grants for innovators, up to $25K</Bullet>
            </ul>

            {/* Bottom-anchored CTA — gradient-filled, same
                treatment as the Sign-in button across the divider.
                The button is the LAST element in the column so it
                lands at the very bottom and lines up exactly with
                the Sign-in submit across the hairline divider
                (both columns: `flex flex-col` + `mt-auto pt-8` on
                the CTA wrapper). */}
            <div className="mt-auto pt-8">
              <Link
                href="/register"
                className="group relative w-full inline-flex items-center justify-center gap-3 text-white font-bold tracking-tight py-3.5 text-base overflow-hidden transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, #173f72 0%, #1f6f86 50%, #2f7e50 100%)",
                  boxShadow:
                    "0 10px 28px -8px rgba(56,189,248,0.45), inset 0 1px 0 rgba(255,255,255,0.22)",
                }}
              >
                {/* Soft inner shine sweep on hover */}
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background:
                      "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                  }}
                />
                <span className="relative">Create your free account</span>
                <ArrowRight size={16} aria-hidden className="relative group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </section>

          {/* Vertical hairline divider — only renders on lg+ where
              the columns sit side-by-side. */}
          <div aria-hidden className="hidden lg:block w-px h-full bg-gradient-to-b from-transparent via-white/15 to-transparent" />

          {/* ── 02 · RETURNING ────────────────────────────────────── */}
          <section className="lg:pl-12 flex flex-col">
            <div className="flex items-baseline justify-between mb-6">
              <span
                className="font-serif italic text-5xl leading-none"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, #86efac 0%, #fcd34d 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                02
              </span>
              <p className="text-[11px] uppercase tracking-[0.32em] font-semibold text-white/60">
                Returning
              </p>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
              {justRegistered ? (
                <>Account created — <span className="font-serif italic font-normal text-white/85">sign in</span></>
              ) : (
                <>Welcome <span className="font-serif italic font-normal text-white/85">back</span></>
              )}
            </h2>

            {justRegistered && (
              <div role="status" className="mt-4 border-l-2 border-emerald-400 pl-4 py-1 text-sm text-emerald-200 inline-flex items-start gap-2 w-full">
                <CheckCircle2 size={14} aria-hidden className="mt-0.5 shrink-0 text-emerald-300" />
                <span>
                  Your account is ready. We pre-filled your email — just enter the password you chose.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} aria-busy={loading} className="mt-6 space-y-6 flex-1 flex flex-col">
              {error && (
                <div id="login-error" role="alert" className="border-l-2 border-rose-400 pl-4 py-1 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <LineField label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  className="w-full bg-transparent border-0 border-b border-white/55 px-0 py-2 text-base text-white placeholder:text-white/45 focus:outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent transition-colors"
                  placeholder="you@lab.…"
                />
              </LineField>

              <LineField
                label="Password"
                aside={
                  <a href="mailto:support@biohubnet.ca?subject=Password%20reset%20help" aria-label="Reset your password — email support" className="inline-block py-1 -my-1 text-[11px] uppercase tracking-[0.22em] text-white/60 hover:text-white transition-colors">
                    Forgot?
                  </a>
                }
              >
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  className="w-full bg-transparent border-0 border-b border-white/55 px-0 py-2 text-base text-white placeholder:text-white/45 focus:outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent transition-colors"
                  placeholder="••••••••"
                />
              </LineField>

              {mfaRequired && (
                <LineField label="Authenticator code" hint="From your authenticator app (Google Authenticator, 1Password, Authy …).">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totp}
                    onChange={(e) => setTotp(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    autoFocus
                    className="w-40 bg-transparent border-0 border-b border-white/55 px-0 py-2 text-center text-xl font-mono tracking-[0.4em] text-white placeholder:text-white/45 focus:outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent transition-colors"
                    placeholder="123 456"
                  />
                </LineField>
              )}

              {/* Remember me — minimal toggle, on a line of its own.
                  The native checkbox is sr-only so keyboard focus lands
                  on an invisible element; we proxy a visible focus ring
                  onto the styled `<span>` checkbox via `peer-focus-
                  visible:*` so keyboard users see what's focused. */}
              <label className="flex items-center gap-3 cursor-pointer select-none group">
                <span className="relative">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className="w-4 h-4 border border-white/40 bg-transparent transition-all peer-checked:bg-white peer-checked:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-white/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent flex items-center justify-center">
                    {remember && <Check size={11} aria-hidden className="text-slate-900" strokeWidth={3} />}
                  </span>
                </span>
                <span className="text-xs text-white/60 group-hover:text-white/85 transition-colors">
                  Remember me on this device
                </span>
              </label>

              {/* Submit anchored at the bottom of the flex form so
                  it sits on the same baseline as the Sign-up CTA
                  across the divider — and now wears the same
                  brand-gradient treatment so the pair reads as
                  one design system, not flat-white-vs-gradient. */}
              <div className="mt-auto pt-8">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full inline-flex items-center justify-center gap-3 text-white font-bold tracking-tight py-3.5 text-base overflow-hidden transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60 disabled:hover:translate-y-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(120deg, #173f72 0%, #1f6f86 50%, #2f7e50 100%)",
                    boxShadow:
                      "0 10px 28px -8px rgba(56,189,248,0.45), inset 0 1px 0 rgba(255,255,255,0.22)",
                  }}
                >
                  {/* Inner shine sweep on hover — same as Sign-up */}
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      background:
                        "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                    }}
                  />
                  {loading ? (
                    <span className="relative">Signing in…</span>
                  ) : (
                    <>
                      <span className="relative">Sign in</span>
                      <ArrowRight size={16} aria-hidden className="relative group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          By signing in you agree to our{" "}
          <Link
            href="/terms"
            className="underline decoration-white/30 underline-offset-2 hover:decoration-white/70 hover:text-white transition-colors"
          >
            Terms of Service
          </Link>
          .
        </p>
      </div>
      </main>
    </div>
  );
}

function Bullet({
  icon: Icon, children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 text-sm text-slate-300 leading-snug">
      <span className="w-5 h-5 inline-flex items-center justify-center shrink-0 mt-0.5 text-sky-300">
        <Icon size={13} strokeWidth={1.5} aria-hidden />
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Editorial "line" field — label above (uppercase tracked, light
 *  on the dark stage), input as a single underline. Replaces the
 *  card-style bordered inputs the form used to render with. */
function LineField({
  label,
  hint,
  aside,
  children,
}: {
  label: string;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  // Associate the label by id and expose the hint as a DESCRIPTION
  // (aria-describedby), rather than wrapping label + aside + hint in one
  // <label>. Otherwise the input's accessible NAME absorbs all of it
  // ("Password Forgot?", "Authenticator code From your authenticator app…").
  // Any aria-describedby already on the field (e.g. the login error) is merged.
  const el = children as React.ReactElement<Record<string, unknown>>;
  const field = isValidElement(children)
    ? cloneElement(el, {
        id,
        "aria-describedby":
          [el.props["aria-describedby"] as string | undefined, hintId].filter(Boolean).join(" ") || undefined,
      })
    : children;
  return (
    <div className="block">
      <span className="flex items-baseline justify-between mb-1">
        <label htmlFor={id} className="text-[11px] uppercase tracking-[0.32em] font-semibold text-white/60">
          {label}
        </label>
        {aside}
      </span>
      {field}
      {hint && <span id={hintId} className="block text-[11px] text-white/45 mt-1.5">{hint}</span>}
    </div>
  );
}
