import type { Metadata } from "next";
import Link from "next/link";
import { isPausedPath, pausedPillarsActive } from "@/lib/deploy/paused";
import {
  Sparkles, Users2, Calendar, ArrowRight, GraduationCap, Award, Layers,
  Search, BookOpen,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LogoMark } from "@/components/ui/Logo";
import { AccessRequestForm } from "@/components/marketing/AccessRequestForm";
import { isRegistrationOpen } from "@/lib/auth/registration";

export const dynamic = "force-dynamic";

export default async function ForTraineesPage() {
  const [courseCount, postingCount, employerCount, certCount] = await Promise.all([
    prisma.course.count({ where: { status: "published" } }).catch(() => 0),
    prisma.internshipPosting.count({ where: { status: "active" } }).catch(() => 0),
    prisma.user.count({ where: { role: "employer", isActive: true, accountKind: "real" } }).catch(() => 0),
    prisma.certificate.count({ where: { revokedAt: null } }).catch(() => 0),
  ]);
  // While sign-up is closed the CTAs lead to the access-request form (the
  // way in for someone new) and Sign in, never to a /register page that
  // would only say no.
  const registrationOpen = isRegistrationOpen();

  return (
    <div className="min-h-screen has-grain bg-page">
      {/* Top nav */}
      <nav className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <LogoMark size={32} />
          <div className="leading-tight">
            <p className="font-bold text-fg text-sm">BHN <span className="text-brand-600">Training</span></p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">For trainees</p>
          </div>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {!isPausedPath("/for-employers") && (
            <Link href="/for-employers" className="text-muted hover:text-fg">For employers</Link>
          )}
          <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">Sign in →</Link>
        </div>
      </nav>

      <main>
      {/* Hero */}
      <section className="full-bleed relative overflow-hidden text-white -mt-2 hero-mesh-teal">
        <div className="absolute inset-0 pointer-events-none">
          <div className="blob-shape blob-soft drift" style={{ width: 540, height: 540, top: -180, left: -160 }} />
          <div className="blob-shape blob-soft drift-slow" style={{ width: 660, height: 660, bottom: -260, right: -180, opacity: 0.55 }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80 inline-flex items-center gap-2">
            <GraduationCap size={12} /> BHN Training · For trainees
          </p>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] mt-3 max-w-3xl">
            Train for the job. <span className="gradient-text">See it land.</span>
          </h1>
          <p className="mt-6 text-white/90 leading-relaxed max-w-2xl text-lg">
            BHN Training builds your skill profile as you learn. Take a course, complete a pathway — your verified skills connect you to internships and roles where they actually count.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={registrationOpen ? "/register" : "#request-access"}
              className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-brand-50 font-semibold text-sm px-6 py-3 organic-card shadow-lg shadow-brand-900/30 transition-all hover:-translate-y-0.5"
            >
              {registrationOpen ? "Sign up free" : "Request access"} <ArrowRight size={14} />
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/25 text-white hover:bg-white/20 text-sm font-semibold px-6 py-3 organic-card-alt"
            >
              How it works
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            <Pulse label="Published courses" value={courseCount} />
            <Pulse label="Active postings" value={postingCount} />
            <Pulse label="Employer partners" value={employerCount} />
            <Pulse label="Certificates issued" value={certCount} />
          </div>
        </div>
        <div className="curve-down" />
      </section>

      {/* How it works */}
      <section id="how" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">Your training, your skill profile, real opportunities</p>
          <h2 className="text-3xl md:text-4xl font-bold text-fg mt-2">How it works</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <Step icon={BookOpen} n={1} title="Take a course"
            body="Browse the catalog by topic, delivery, or provider. Self-paced, instructor-led, or hands-on workshops — pick what fits your week." />
          <Step icon={Sparkles} n={2} title="Build a verified skill profile"
            body="Every completed course adds skills to your profile, with evidence: which course, what score, when. You can add resume-extracted or self-claimed skills too." />
          <Step icon={Users2} n={3} title="Get matched to real roles"
            body="When an employer posts an internship, we score your profile against their requirements. See which courses would unlock more roles you want." />
        </div>
      </section>

      {/* Skill-graph callout */}
      <section className="bg-elevated/30 py-20">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">No black box</p>
            <h2 className="text-3xl md:text-4xl font-bold text-fg mt-2 leading-tight">
              See exactly why a role matched you.
            </h2>
            <p className="mt-4 text-muted leading-relaxed">
              Open any internship posting and we&apos;ll show you the skills you have, the skills you&apos;re missing, and the BHN courses that close the gap. No mystery scoring.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-fg">
              <Bullet icon={GraduationCap} text="Course-completion proof attached to every skill" />
              <Bullet icon={Search}        text="Search jobs by what you've actually done" />
              <Bullet icon={Layers}        text="Pathways stack courses into focused career tracks" />
              <Bullet icon={Award}         text="Certificates verified by partner organisations" />
            </ul>
          </div>
          <div className="bg-card border border-line rounded-2xl p-6 shadow-lg">
            <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold mb-3">Skill gap — sample</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl font-bold text-emerald-700 tabular-nums">72</div>
              <div className="flex-1">
                <p className="font-semibold text-fg">Bioprocess Development Intern</p>
                <p className="text-xs text-muted">Acme Biotherapeutics</p>
              </div>
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold mb-1.5">You bring</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {["Cell Culture", "Aseptic Technique", "GMP", "HPLC"].map((s) => (
                <span key={s} className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">{s}</span>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold mb-1.5">Missing</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-[11px] bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2 py-0.5">Bioreactor Operation</span>
              <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">Python data analysis</span>
            </div>
            <p className="text-[11px] text-muted">→ Take <strong className="text-brand-700">Bioreactor Fundamentals</strong> to lift this match to 89.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        {registrationOpen ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">Free to start</p>
            <h2 className="text-3xl md:text-4xl font-bold text-fg mt-2">Ready to train for the role you want?</h2>
            <p className="mt-3 text-muted leading-relaxed max-w-xl mx-auto">
              200 BHN credits to begin. Browse the catalog, build your skill profile, get matched to internships from real industry partners.
            </p>
          </>
        ) : (
          <>
            <p data-registration-closed className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">
              Invite-only for now
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-fg mt-2">Want in? Request access.</h2>
            <p className="mt-3 text-muted leading-relaxed max-w-xl mx-auto">
              New accounts are by invitation at the moment. Tell us a little about yourself below and the BioHubNet team will get back to you.
            </p>
          </>
        )}
        <div className="mt-7 flex justify-center gap-3 flex-wrap">
          {registrationOpen ? (
            <>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-brand-600 text-white hover:bg-brand-700 font-semibold text-sm px-6 py-3 rounded-lg shadow-md shadow-brand-600/25 transition-all hover:-translate-y-0.5"
              >
                Sign up free <ArrowRight size={14} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-card-solid border border-line text-fg hover:border-brand-300 text-sm font-semibold px-6 py-3 rounded-lg"
              >
                Already have an account? Sign in
              </Link>
            </>
          ) : (
            // The form below is the main action; Sign in is the aside.
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-card-solid border border-line text-fg hover:border-brand-300 text-sm font-semibold px-6 py-3 rounded-lg"
            >
              Already have an account? Sign in
            </Link>
          )}
        </div>

        {/* Open by default while sign-up is closed: it is the way in, and
            the hero's "Request access" jumps here. */}
        <details id="request-access" className="mt-10 text-left scroll-mt-6" open={!registrationOpen}>
          <summary className="cursor-pointer text-sm text-muted hover:text-fg select-none text-center">
            {registrationOpen ? "Need an organisation invite? Click here." : "Tell us about yourself"}
          </summary>
          <div className="mt-4">
            <AccessRequestForm kind="trainee" />
          </div>
        </details>
      </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 border-t border-line text-center text-xs text-subtle">
        © {new Date().getFullYear()} BioHubNet · <Link href="/privacy" className="hover:text-fg">Privacy</Link> · <Link href="/terms" className="hover:text-fg">Terms</Link> · <Link href="/security" className="hover:text-fg">Security</Link>
      </footer>
    </div>
  );
}

function Pulse({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl px-4 py-3">
      <p className="text-3xl font-bold text-white tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/75 mt-1">{label}</p>
    </div>
  );
}

function Step({ n, icon: Icon, title, body }: { n: number; icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="bg-card border border-line rounded-2xl p-6 hover:border-brand-200 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
          <Icon size={18} />
        </div>
        <span className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold">Step {n}</span>
      </div>
      <h3 className="font-semibold text-fg leading-tight mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function Bullet({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="w-5 h-5 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={11} />
      </span>
      <span>{text}</span>
    </li>
  );
}

// While ENGAGE + EXPERIENCE are paused (deploy/paused-routes.mjs) most of
// this page describes paused features, so keep it out of search results.
export function generateMetadata(): Metadata {
  return pausedPillarsActive() ? { robots: { index: false, follow: false } } : {};
}
