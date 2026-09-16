/**
 * /jobs — public-facing open positions board.
 *
 * No auth required. Lists all active postings with deadline > now OR
 * no deadline. Supports ?q= text search and ?type= category filter.
 */

import Link from "next/link";
import { Briefcase, Search, MapPin, Clock, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LogoMark } from "@/components/ui/Logo";
import { isRegistrationOpen } from "@/lib/auth/registration";

export const dynamic = "force-dynamic";

// ── Position type config ─────────────────────────────────────────

const TYPES = ["All", "Internship", "Co-op", "Full-time", "Contract"] as const;
type TypeFilter = (typeof TYPES)[number];

const TYPE_COLOURS: Record<string, string> = {
  Internship: "bg-brand/10 text-brand ring-brand/30",
  "Co-op":    "bg-violet-50 text-violet-700 ring-violet-200",
  "Full-time":"bg-emerald-50 text-emerald-700 ring-emerald-200",
  Contract:   "bg-amber-50 text-amber-700 ring-amber-200",
};

function typeClass(type: string | null): string {
  return type ? (TYPE_COLOURS[type] ?? "bg-elevated text-muted ring-line") : "bg-elevated text-muted ring-line";
}

// ── Page ─────────────────────────────────────────────────────────

interface SearchParams {
  q?:    string;
  type?: string;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q = "", type = "All" } = await searchParams;
  const query      = q.trim().toLowerCase();
  const typeFilter = TYPES.includes(type as TypeFilter) ? (type as TypeFilter) : "All";

  const now = new Date();

  const postings = await prisma.internshipPosting.findMany({
    where: {
      status: "active",
      OR: [
        { deadline: null },
        { deadline: { gt: now } },
      ],
      ...(typeFilter !== "All" ? { type: typeFilter } : {}),
    },
    select: {
      id:          true,
      title:       true,
      companyName: true,
      location:    true,
      type:        true,
      compensation:true,
      keySkills:   true,
      deadline:    true,
      duration:    true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Client-side text search (small dataset — avoid over-complicating with Prisma full-text)
  const filtered = query
    ? postings.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.companyName.toLowerCase().includes(query) ||
          (p.location ?? "").toLowerCase().includes(query) ||
          p.keySkills.some((s) => s.toLowerCase().includes(query)),
      )
    : postings;

  return (
    <div className="min-h-screen bg-page has-grain">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <LogoMark size={28} />
          <div className="leading-tight">
            <p className="font-bold text-fg text-sm">
              BHN <span className="text-brand-600">Training</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">Open positions</p>
          </div>
        </Link>
        <Link
          href="/login"
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <header className="max-w-5xl mx-auto px-6 pt-10 pb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-fg leading-tight">
          Open positions at BHN partner companies
        </h1>
        <p className="mt-2 text-base text-muted max-w-2xl">
          Positions for students and recent graduates in the life sciences.
          Apply directly — no middlemen, no platform fees.
        </p>
      </header>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pb-6 space-y-3">
        {/* Search */}
        <form method="GET" className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by title, company, or skill…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-card border border-line focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand text-fg placeholder:text-muted"
            />
          </div>
          {/* Preserve type filter */}
          {typeFilter !== "All" && (
            <input type="hidden" name="type" value={typeFilter} />
          )}
          <button
            type="submit"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            Search
          </button>
        </form>

        {/* Type chips */}
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Link
              key={t}
              href={`/jobs?${t !== "All" ? `type=${encodeURIComponent(t)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${
                typeFilter === t
                  ? "bg-brand text-white ring-brand"
                  : "bg-elevated text-muted ring-line hover:bg-card hover:text-fg"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Job cards grid ───────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 pb-16">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase size={36} className="mx-auto text-muted mb-4" />
            <p className="text-lg font-semibold text-fg">No positions found</p>
            <p className="text-sm text-muted mt-1">
              Try broadening your search or clearing the type filter.
            </p>
            <Link
              href="/jobs"
              className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted mb-4">
              {filtered.length} position{filtered.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((p) => (
                <Link
                  key={p.id}
                  href={`/jobs/${p.id}`}
                  className="group block rounded-2xl bg-card border border-line hover:border-brand/30 hover:shadow-card-hover hover:-translate-y-0.5 transition-all p-5 shadow-card-rest"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-fg group-hover:text-brand transition-colors leading-snug">
                        {p.title}
                      </h2>
                      <p className="text-sm text-muted mt-0.5">{p.companyName}</p>
                    </div>
                    {p.type && (
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ring-inset shrink-0 mt-0.5 ${typeClass(p.type)}`}>
                        {p.type}
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mb-3">
                    {p.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} /> {p.location}
                      </span>
                    )}
                    {p.duration && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {p.duration}
                      </span>
                    )}
                    {p.compensation && (
                      <span className="font-medium text-fg">{p.compensation}</span>
                    )}
                  </div>

                  {/* Key skills */}
                  {p.keySkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.keySkills.slice(0, 5).map((skill) => (
                        <span
                          key={skill}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-elevated border border-line text-muted"
                        >
                          {skill}
                        </span>
                      ))}
                      {p.keySkills.length > 5 && (
                        <span className="text-[10px] text-muted">+{p.keySkills.length - 5}</span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-line">
                    {p.deadline ? (
                      <span className="text-[10px] text-muted">
                        Deadline: {new Date(p.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted">Open until filled</span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand group-hover:gap-2 transition-all">
                      View & Apply <ChevronRight size={13} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Footer CTA ───────────────────────────────────────── */}
      <footer className="border-t border-line bg-card">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Are you a life sciences company?{" "}
            <Link href="/for-employers" className="font-semibold text-brand hover:underline">
              Post your openings →
            </Link>
          </p>
          {isRegistrationOpen() ? (
            <p className="text-sm text-muted">
              Student or recent grad?{" "}
              <Link href="/register" className="font-semibold text-brand hover:underline">
                Create your profile →
              </Link>
            </p>
          ) : (
            // Sign-up is closed: point existing trainees at Sign in instead.
            <p className="text-sm text-muted">
              Already a BHN trainee?{" "}
              <Link href="/login" className="font-semibold text-brand hover:underline">
                Sign in →
              </Link>
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
