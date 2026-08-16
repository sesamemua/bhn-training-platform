/**
 * /demo/about — the backstage page: what a hiring manager actually reads.
 *
 * Stack, scale, and a feature index whose every link enters the right
 * persona AND lands on the feature in one click (via /api/demo/enter's
 * next parameter). Doubles as the interview screenshare.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Code2 } from "lucide-react";
import { demoMode } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About this build · BioHubNet demo",
  robots: { index: false, follow: false },
};

const STACK: { name: string; detail: string }[] = [
  { name: "Next.js 16 · React 19", detail: "App Router throughout — 227 pages, 428 API routes. Server components read Prisma directly; client components stay presentation-only." },
  { name: "TypeScript, strict", detail: "No any, no ts-ignore, no unsafe casts. Zod validates every external input at the boundary." },
  { name: "Tailwind v4", detail: "CSS-only config with a token system — 13 switchable themes incl. seasonal drops, all AA-checked. Try the palette icon, bottom-left of the sidebar." },
  { name: "Prisma 6 · Postgres (Neon)", detail: "174 models, hand-written SQL migrations, pgvector for semantic course search embeddings." },
  { name: "NextAuth", detail: "Credentials + email-code magic links + TOTP MFA. Role-gated at every route; this demo signs you in through a constrained magic-token path that refuses real accounts." },
  { name: "Cloudflare Workers AI", detail: "Llama 3.1 chat, BGE embeddings, SDXL course art — with graceful degradation and a Gemini fallback." },
  { name: "Integrations", detail: "Stripe ticketing, Twilio SMS reminders, R2 object storage, SCORM course player, Google Workspace SMTP." },
];

const FEATURES: { title: string; note: string; persona: string; next: string }[] = [
  { title: "Trainee dashboard", note: "The lived-in home — progress, credits, rewards vault, theme-of-the-day.", persona: "trainee", next: "/dashboard" },
  { title: "Course catalogue", note: "The real 70-course ENGAGE catalogue with filters and semantic search.", persona: "trainee", next: "/courses" },
  { title: "Certificates", note: "Earned credentials with public verify links.", persona: "trainee", next: "/certificates" },
  { title: "Mock interview", note: "Voice-answered practice with AI scoring on content, confidence and delivery.", persona: "trainee", next: "/mock-interview" },
  { title: "Admin overview", note: "Queues, live stats, and every operational surface.", persona: "admin", next: "/admin" },
  { title: "Website review", note: "Threaded comments anchored to live pages; exports a revision brief for an AI coding agent.", persona: "admin", next: "/admin/workspace/website-review" },
  { title: "Newsletter workshop", note: "Colleagues drop raw updates; AI lays out the Mailchimp issue.", persona: "admin", next: "/admin/workspace/marketing/newsletter" },
  { title: "Trade-show merch", note: "A costed giveaway shortlist with quote-request export.", persona: "admin", next: "/admin/workspace/merch" },
  { title: "Events & workshops", note: "Registration, capacity + waitlists, QR check-in, reminder crons.", persona: "admin", next: "/admin/events" },
  { title: "Design system", note: "The token architecture and component library, documented in-app.", persona: "admin", next: "/admin/design-system" },
  { title: "Employer portal", note: "Postings, applicant pipeline, talent pool, company branding.", persona: "employer", next: "/employer" },
];

export default function DemoAboutPage() {
  if (!demoMode()) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/demo" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={14} /> Choose a persona
      </Link>

      <h1 className="mt-8 text-3xl font-bold text-fg" style={{ textWrap: "balance" }}>
        About this build
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
        BioHubNet is a real training platform serving Ontario&apos;s biomanufacturing
        talent programs — ENGAGE (courses), EXPERIENCE (placements) and EQUIP
        (innovation funding). I built and run it end to end: product, design,
        front end, back end, and operations. This demo is the production codebase
        against a synthetic database.
      </p>
      <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-subtle">
        Development is AI-accelerated — I work with coding agents daily and review,
        verify and own every line that ships. The commit history shows exactly how:
        adversarial reviews, rendered-output verification, and honest commit messages.
      </p>

      <h2 className="mt-14 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Stack</h2>
      <dl className="mt-2">
        {STACK.map((s) => (
          <div key={s.name} className="grid grid-cols-1 gap-1 border-t border-line py-4 md:grid-cols-[220px_1fr] md:gap-6">
            <dt className="font-bold text-fg text-[14px]">{s.name}</dt>
            <dd className="m-0 text-[13.5px] leading-relaxed text-muted">{s.detail}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-14 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
        Feature index — each link signs you in and lands on the feature
      </h2>
      <div className="mt-2">
        {FEATURES.map((f) => (
          <Link
            key={f.next}
            href={`/api/demo/enter?persona=${f.persona}&next=${encodeURIComponent(f.next)}`}
            prefetch={false}
            className="group grid grid-cols-1 gap-1 border-t border-line py-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 md:grid-cols-[220px_1fr] md:gap-6"
          >
            <span className="font-bold text-[14px] text-fg">
              {f.title}
              <ArrowUpRight size={12} className="ml-1.5 inline align-[1px] text-brand-700 opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="text-[13.5px] leading-relaxed text-muted">
              {f.note} <span className="text-subtle">· as {f.persona}</span>
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-14 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Code &amp; contact</h2>
      <div className="mt-2 border-t border-line pt-4 text-[14px] leading-relaxed text-muted">
        <p className="m-0">
          <a
            href="https://github.com/sesamemua/bhn-training-platform"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-900"
          >
            <Code2 size={14} /> Source on GitHub
          </a>
          {" "}— including the migrations, the tests, and the commit history.
        </p>
        <p className="mt-2 mb-0">
          Ruilin Yuan ·{" "}
          <a href="https://yuanruilin.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:text-brand-900">
            yuanruilin.com
          </a>
        </p>
      </div>
    </main>
  );
}
