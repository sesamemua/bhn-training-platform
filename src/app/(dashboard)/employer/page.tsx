/**
 * /employer — flagship employer home.
 *
 * The home page used to be the linear HR workspace (HrWorkspace
 * component) — postings + applicant queue + inline expand. That was
 * functional but didn't lead with the employer's own brand identity.
 *
 * This page now opens with the cinematic profile layout that used to
 * live at /employer/profile, then surfaces the action queue + hiring
 * shopfront inline beneath it. The old /employer/profile route is
 * preserved as a redirect alias.
 *
 * Section flow, top → bottom (continuous gradient-washed canvas,
 * sections separated by hairlines + eyebrows):
 *
 *   COVER BANNER — full-bleed cinematic gradient with 5 auroras and
 *      noise texture. The visual stage.
 *
 *   IDENTITY ROW — logo + company name + chips + trust signals,
 *      floating directly on a brand-tinted wash bleeding out of the
 *      cover. Pencil button top-right opens the edit modal (URL
 *      auto-fill first, manual fields behind a disclosure).
 *
 *   ABOUT QUOTE — pull-quote rendered with a three-colour gradient
 *      rule on the left, only shown when a description is set.
 *
 *   STAT TRIPLET — three numbers (postings live, applicants
 *      reviewed, interviews held) divided by vertical hairlines.
 *
 *   ACTION QUEUE — items needing the employer's attention right
 *      now (new triage, stale, awaiting offer response). Pulled
 *      forward from the old HrWorkspace home so this critical signal
 *      doesn't get buried.
 *
 *   HIRING SHOPFRONT — live postings as hairline-divided list rows,
 *      with a link to the per-posting management page.
 *
 * The full single-page workspace (inline applicant expand, drag-drop
 * pipeline, etc.) still lives at /employer/postings/[id] for deep
 * work; this home page is the "brand stage" entry point.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Globe, MapPin, Users, Calendar, Briefcase, Sparkles,
  ShieldCheck, Clock, ArrowRight,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId, updateLastSeen } from "@/lib/employer/company";
import { ELIGIBLE_APPLICANT_FILTER } from "@/lib/talent-pool/eligibility";
import { EditProfileTrigger } from "@/components/employer/EditProfileTrigger";
import { SetPasswordBanner } from "@/components/employer/SetPasswordBanner";
import { OnboardingWizard } from "@/components/employer/OnboardingWizard";
import { HrFlowChart } from "@/components/employer/HrFlowChart";
import { normalizeLogoShape, logoShapeClasses } from "@/lib/employer/logo-shape";
import {
  parseLogoTransform,
  isIdentityTransform,
  logoTransformCss,
  type LogoTransform,
} from "@/lib/employer/logo-transform";
import { upgradeLogoForDisplay } from "@/lib/employer/logo-discovery";

export const dynamic = "force-dynamic";

const ACTIVE_STAGES = [
  "new", "reviewing", "shortlisted", "phone_screen", "onsite", "offer",
] as const;

type QueueKind = "new" | "stale" | "offer-waiting";

export default async function EmployerHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "trainee";
  const userId = (session.user as { id?: string }).id ?? null;
  const isAdmin = role === "admin" || role === "superadmin";
  if (role !== "employer" && !isAdmin) {
    return (
      <div className="bg-card border border-line rounded-2xl p-12 text-center">
        <p className="font-medium text-muted">This portal is for employer accounts.</p>
      </div>
    );
  }

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          createdAt: true,
          password: true,
          employerCompany: true,
          companyWebsite: true,
          companyLogo: true,
          companyLogoShape: true,
          companyLogoTransform: true,
          companyBrand: true,
          companyIndustry: true,
          companySize: true,
          companyLocation: true,
          companyDescription: true,
          companyFounded: true,
          companyMainBusiness: true,
          companyTicker: true,
        },
      }).catch(() => null)
    : null;

  // Resolve the company this session is acting on behalf of.
  //
  // Per-user isolation contract (Y2026-05-27):
  //   • Real employers (role === "employer") are scoped to their
  //     CompanyMember row — getActiveCompanyId returns the company,
  //     postings/applicants/etc. all filter by `{ companyId }`. Real
  //     employers never see another company's data.
  //   • Admins / superadmins (no CompanyMember rows) get a PRIVATE
  //     preview workspace scoped to `createdById: userId`. The /employer
  //     page used to grant admins a global view (postingsWhere =
  //     undefined → see every posting on the platform), which meant
  //     two admins looking at /employer would see each other's demo
  //     postings + applicants + queue — and the company profile section
  //     showed whoever had filled in the User row's employerCompany
  //     field. Yoo Jin saw Cytiva because the page didn't isolate.
  //
  // Admin/superadmin company-profile fields (employerCompany,
  // companyLogo, …) live on the admin's OWN User row already — that
  // part was always per-user, just the postings + queue queries were
  // global. Scoping by createdById fixes the leak: an admin sees only
  // postings they personally created on their own account.
  //
  // Wrapped in .catch() so a transient DB error degrades to the
  // createdById filter rather than crashing the whole page.
  const companyId = isAdmin
    ? null
    : userId ? await getActiveCompanyId(userId).catch(() => null) : null;

  // Stamp last-seen (fire-and-forget, non-blocking).
  if (companyId && userId) updateLastSeen(companyId, userId);

  // Filter shape for InternshipPosting. Real employers → companyId.
  // Admins → their own createdById (private preview workspace).
  // The createdById fallback for non-admin without companyId is
  // legacy backstop from before the multi-seat backfill ran.
  const postingsWhere = isAdmin
    ? { createdById: userId ?? "_" }
    : companyId
    ? { companyId }
    : { createdById: userId ?? "_" };
  const nestedPostingWhere = postingsWhere ? { posting: postingsWhere } : {};

  const since7d = new Date(Date.now() - 7 * 86_400_000);
  const since2d = new Date(Date.now() - 2 * 86_400_000);

  // Every query has a per-call `.catch(() => safe_default)` so a
  // single DB hiccup or schema drift on one query never takes down
  // the whole hero. Worst case the relevant section reads as zero /
  // empty — the page still renders.
  const [
    postingsLive,
    applicantsCount,
    interviewsCount,
    hiredCount,
    livePostingsPreview,
    firstPosting,
    queueRows,
    teamMemberCount,
    pendingJoinRequestCount,
  ] = await Promise.all([
    prisma.internshipPosting.count({ where: { ...(postingsWhere ?? {}), status: "active" } }).catch(() => 0),
    prisma.applicationStatus.count({ where: nestedPostingWhere }).catch(() => 0),
    prisma.interview.count({ where: nestedPostingWhere }).catch(() => 0),
    prisma.applicationStatus.count({
      where: { ...nestedPostingWhere, status: "hired" },
    }).catch(() => 0),
    prisma.internshipPosting.findMany({
      where: { ...(postingsWhere ?? {}), status: "active" },
      select: {
        id: true,
        title: true,
        location: true,
        type: true,
        compensation: true,
        deadline: true,
        keySkills: true,
        _count: { select: { applicationStatuses: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }).catch(() => [] as Array<{
      id: string; title: string; location: string | null; type: string | null;
      compensation: string | null; deadline: Date | null; keySkills: string[];
      _count: { applicationStatuses: number };
    }>),
    prisma.internshipPosting.findFirst({
      where: postingsWhere ?? {},
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => null),
    prisma.applicationStatus.findMany({
      where: {
        // Eligibility gate — only show applicants who have been
        // human-verified and are still in the pool.
        ...ELIGIBLE_APPLICANT_FILTER,
        ...nestedPostingWhere,
        OR: [
          { status: "new" },
          {
            status: { in: [...ACTIVE_STAGES] as string[] },
            stageEnteredAt: { lt: since7d },
          },
          { status: "offer", stageEnteredAt: { lt: since2d } },
        ],
      },
      select: {
        id: true,
        status: true,
        stageEnteredAt: true,
        posting: { select: { id: true, title: true } },
        applicant: { select: { id: true, name: true, email: true } },
      },
      orderBy: { stageEnteredAt: "asc" },
      take: 8,
    }).catch(() => [] as Array<{
      id: string; status: string; stageEnteredAt: Date;
      posting: { id: string; title: string };
      applicant: { id: string; name: string | null; email: string };
    }>),
    // Team stats — only meaningful once the backfill has run (companyId populated).
    companyId
      ? prisma.companyMember.count({ where: { companyId } }).catch(() => 0)
      : Promise.resolve(0),
    companyId
      ? prisma.companyJoinRequest.count({ where: { companyId, status: "pending" } }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  // flatMap-with-guard so an orphan row (relation cascaded away but
  // the application_status row survived) doesn't throw on the
  // `row.posting.id` access. Prisma's generated types claim the
  // relations are non-null since the FK columns are required, but
  // legacy data sometimes disagrees. Same for stageEnteredAt —
  // the column is non-null with a default but old rows may pre-date
  // the migration that backfilled it.
  const actionQueue = queueRows.flatMap((row) => {
    if (!row.posting || !row.applicant || !row.stageEnteredAt) return [];
    const days = Math.floor((Date.now() - row.stageEnteredAt.getTime()) / 86_400_000);
    const isOffer = row.status === "offer";
    const isStale = ACTIVE_STAGES.includes(row.status as (typeof ACTIVE_STAGES)[number])
      && days >= 7 && row.status !== "new";
    const kind: QueueKind = isOffer ? "offer-waiting" : isStale ? "stale" : "new";
    return [{
      applicationStatusId: row.id,
      postingId: row.posting.id,
      postingTitle: row.posting.title,
      applicantId: row.applicant.id,
      applicantName: row.applicant.name ?? row.applicant.email,
      kind,
      daysInStage: days,
    }];
  });

  const hasName = Boolean(user?.employerCompany?.trim());
  const memberSinceYear = (firstPosting?.createdAt ?? user?.createdAt)?.getFullYear();
  const noPassword = !user?.password;

  const profileForEditor = {
    employerCompany: user?.employerCompany ?? null,
    companyWebsite: user?.companyWebsite ?? null,
    companyLogo: user?.companyLogo ?? null,
    companyLogoShape: user?.companyLogoShape ?? null,
    companyLogoTransform: user?.companyLogoTransform ?? null,
    companyBrand: user?.companyBrand ?? null,
    companyIndustry: user?.companyIndustry ?? null,
    companySize: user?.companySize ?? null,
    companyLocation: user?.companyLocation ?? null,
    companyDescription: user?.companyDescription ?? null,
    companyFounded: user?.companyFounded ?? null,
    companyMainBusiness: user?.companyMainBusiness ?? null,
    companyTicker: user?.companyTicker ?? null,
  };

  // Studio is now applied segment-wide via employer/layout.tsx.
  return (
    <div className="-mt-2 space-y-0">
      {/* Onboarding wizard — shows as a fixed bottom-left card for new
          employers. localStorage-persisted so dismiss survives reloads.
          Not shown to admins (they already know the portal). */}
      {!isAdmin && (
        <OnboardingWizard show={true} />
      )}

      {/* ── PANEL ──────────────────────────────────────────────
          Single rounded outer wrapper containing the cover banner
          and the body — one continuous edge per side instead of two
          stacked rings clashing at the seam.
          Note: the SetPasswordBanner used to render ABOVE this
          panel — that broke the platform-wide "hero owns the top
          edge" rule. It now sits INSIDE the panel, just below
          CoverBanner (the hero), so the cover always sits at the
          very top of the page. */}
      <div className="rounded-3xl overflow-hidden shadow-elevated-panel">
        <CoverBanner />

        {noPassword && (
          <div className="px-6 sm:px-10 lg:px-14 pt-4">
            <SetPasswordBanner />
          </div>
        )}

        <div
          className="relative -mt-24 sm:-mt-28"
          style={{
            background:
              "linear-gradient(180deg, rgba(59,130,246,0.07) 0%, rgba(244,114,182,0.04) 18%, rgba(255,255,255,0) 35%), linear-gradient(180deg, var(--card) 0%, var(--card) 100%)",
          }}
        >
          {/* Soft accent wash */}
          <div
            aria-hidden
            className="absolute top-10 left-1/4 w-[40rem] h-[40rem] rounded-full opacity-30 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(closest-side, rgba(59,130,246,0.5), rgba(59,130,246,0) 70%)",
            }}
          />

          {/* ── IDENTITY ROW ───────────────────────────────── */}
          <section
            aria-label="Company identity"
            className="relative px-6 sm:px-10 lg:px-14 pt-8 sm:pt-10 pb-10"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-6 sm:gap-10 items-start">
              <LogoDisc
                // upgradeLogoForDisplay swaps Google s2/favicons URLs
                // (128 px max, persisted by older auto-fills) for the
                // equivalent Clearbit 400 px URL at render time, so
                // existing low-res profiles render high-res without
                // forcing the operator to re-fetch.
                src={upgradeLogoForDisplay(user?.companyLogo)}
                alt={user?.employerCompany ?? ""}
                shape={normalizeLogoShape(user?.companyLogoShape)}
                transform={parseLogoTransform(user?.companyLogoTransform)}
              />

              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-brand-700 mb-3">
                  Company profile
                </p>
                <h1
                  className={
                    "font-bold tracking-tight leading-[1.02] " +
                    (hasName
                      ? "text-4xl sm:text-5xl lg:text-6xl text-fg"
                      : "text-3xl sm:text-4xl text-muted italic")
                  }
                  style={
                    hasName
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg, var(--fg) 0%, var(--fg) 60%, rgb(59,130,246) 100%)",
                          WebkitBackgroundClip: "text",
                          backgroundClip: "text",
                          color: "transparent",
                        }
                      : undefined
                  }
                >
                  {user?.employerCompany?.trim() || "Add your company name"}
                </h1>

                <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
                  {user?.companyIndustry && (
                    <InlineMeta icon={Briefcase}>{user.companyIndustry}</InlineMeta>
                  )}
                  {user?.companyLocation && (
                    <>
                      <Dot />
                      <InlineMeta icon={MapPin}>{user.companyLocation}</InlineMeta>
                    </>
                  )}
                  {user?.companySize && (
                    <>
                      <Dot />
                      <InlineMeta icon={Users}>{user.companySize} people</InlineMeta>
                    </>
                  )}
                  {user?.companyFounded && (
                    <>
                      <Dot />
                      <InlineMeta icon={Calendar}>Since {user.companyFounded}</InlineMeta>
                    </>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  {user?.companyWebsite && (
                    <a
                      href={normalizeUrl(user.companyWebsite)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 font-bold transition-colors"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, rgb(29,78,216), rgb(124,58,237))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      <Globe size={12} className="text-brand-700" />
                      Visit {hostnameFor(user.companyWebsite)}
                      <ArrowRight size={11} className="text-brand-700" />
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <ShieldCheck size={12} /> Verified employer
                  </span>
                  {memberSinceYear && (
                    <span className="inline-flex items-center gap-1.5 text-subtle">
                      <Clock size={11} /> On BHN since {memberSinceYear}
                    </span>
                  )}
                  {hiredCount > 0 && (
                    <span
                      className="inline-flex items-center gap-1.5 font-semibold"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, rgb(244,114,182), rgb(124,58,237))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      <Sparkles size={11} className="text-fuchsia-500" /> {hiredCount} BHN talent hired
                    </span>
                  )}
                </div>

                {/* Empty-state CTA — if hardly anything is filled in,
                    surface the auto-fill button right here so day-one
                    employers don't have to hunt for the pencil. */}
                {!hasName && (
                  <div className="mt-5">
                    <EditProfileTrigger initial={profileForEditor} variant="button" />
                  </div>
                )}
              </div>

              {/* Right column: edit pencil + live status. The pencil
                  is the new primary entry point to the edit modal. */}
              <div className="flex flex-row sm:flex-col items-start gap-2 shrink-0">
                <EditProfileTrigger initial={profileForEditor} variant="icon" />
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
            </div>
          </section>

          {/* ── ABOUT QUOTE + business/ticker aside ─────────────
              Two-column on md+. The pull-quote sits in the left
              column with the brand-gradient rule on its left; main
              business + stock ticker live in the right column as a
              quiet metadata block. On small screens the columns
              stack — quote first, metadata below.
              The giant opening-quote glyph used to be absolutely
              positioned ABOVE the first word; it overlapped the
              prose at smaller sizes. It's now anchored to the
              far-right margin of the quote column so it acts as a
              decorative gutter mark and never collides with text. */}
          {(user?.companyDescription?.trim() ||
            user?.companyMainBusiness?.trim() ||
            user?.companyTicker?.trim()) && (
            <section
              aria-label="About"
              className="relative px-6 sm:px-10 lg:px-14 py-10 sm:py-12 border-t border-line"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(59,130,246,0.04) 0%, rgba(244,114,182,0.04) 100%)",
              }}
            >
              <SectionEyebrow>About {user?.employerCompany?.trim() || "us"}</SectionEyebrow>
              <div
                className={
                  "grid grid-cols-1 gap-8 lg:gap-12 items-start " +
                  ((user?.companyMainBusiness?.trim() || user?.companyTicker?.trim())
                    ? "md:grid-cols-[1fr_minmax(220px,320px)]"
                    : "")
                }
              >
                {/* Left column — pull-quote */}
                {user?.companyDescription?.trim() && (
                  <div className="relative pl-8 sm:pl-12 pr-12 sm:pr-16">
                    <div
                      aria-hidden
                      className="absolute left-0 top-1 bottom-1 w-1 rounded-full"
                      style={{
                        background:
                          "linear-gradient(180deg, rgb(56,189,248), rgb(124,58,237), rgb(244,114,182))",
                      }}
                    />
                    {/* Decorative “ — anchored to the right gutter
                        of the quote column so the glyph reads as a
                        margin mark rather than competing with the
                        first word of the prose. */}
                    <span
                      aria-hidden
                      className="absolute -top-6 right-0 text-[6rem] sm:text-[8rem] leading-none font-serif text-brand-100/70 pointer-events-none select-none"
                      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                    >
                      &rdquo;
                    </span>
                    <blockquote className="relative text-lg sm:text-xl lg:text-2xl text-fg leading-relaxed font-medium">
                      {user.companyDescription}
                    </blockquote>
                  </div>
                )}

                {/* Right column — main business sidecar. The "Listed
                    as" ticker block that used to live above the main-
                    business prose was removed at user request; the
                    companyTicker field is still editable in the form
                    and stored, just not surfaced on the public
                    employer profile. */}
                {user?.companyMainBusiness?.trim() && (
                  <aside aria-label="Business overview" className="space-y-5">
                    {user?.companyMainBusiness?.trim() && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
                          Main business &amp; products
                        </p>
                        <p className="mt-1.5 text-sm sm:text-base text-fg leading-relaxed">
                          {user.companyMainBusiness.trim()}
                        </p>
                      </div>
                    )}
                  </aside>
                )}
              </div>
            </section>
          )}

          {/* ── STATS ────────────────────────────────────────── */}
          <section
            aria-label="Hiring at a glance"
            className="relative px-6 sm:px-10 lg:px-14 py-10 sm:py-12 border-t border-line"
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(56,189,248,0.06) 0%, rgba(124,58,237,0.04) 50%, rgba(244,114,182,0.05) 100%)",
            }}
          >
            <SectionEyebrow>By the numbers</SectionEyebrow>
            <div className={`grid divide-x divide-line ${companyId ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
              <InlineStat
                label={isAdmin ? "Postings live (platform)" : "Postings live"}
                value={postingsLive}
                tone="brand"
              />
              <InlineStat
                label="Applicants reviewed"
                value={applicantsCount}
                tone="violet"
              />
              <InlineStat
                label="Interviews held"
                value={interviewsCount}
                tone="rose"
              />
              {companyId && (
                <InlineStat
                  label="Team members"
                  value={teamMemberCount}
                  tone="emerald"
                  href="/employer/team"
                />
              )}
            </div>
          </section>

          {/* ── PENDING JOIN REQUESTS callout ─────────────────── */}
          {pendingJoinRequestCount > 0 && (
            <section
              aria-label="Pending join requests"
              className="px-6 sm:px-10 lg:px-14 py-5 border-t border-amber-200/60 bg-amber-50/40"
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-bold shrink-0">
                    {pendingJoinRequestCount}
                  </span>
                  <p className="text-sm font-medium text-fg">
                    {pendingJoinRequestCount === 1
                      ? "1 person from your company domain is requesting to join"
                      : `${pendingJoinRequestCount} people from your company domain are requesting to join`}
                  </p>
                </div>
                <Link
                  href="/employer/team"
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-white border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Review requests <ArrowRight size={12} />
                </Link>
              </div>
            </section>
          )}

          {/* ── ACTION QUEUE CALLOUT ─────────────────────────── */}
          {/* Full queue lives in the My Postings workspace where
              applicants can be expanded, staged, and managed inline.
              The Overview page shows a compact summary so the brand
              stage isn't buried under an operational list. */}
          {actionQueue.length > 0 && (
            <section
              aria-label="Action queue"
              className="relative px-6 sm:px-10 lg:px-14 py-6 sm:py-8 border-t border-line"
            >
              <SectionEyebrow>Needs your attention</SectionEyebrow>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full text-white text-sm font-bold shrink-0"
                    style={{
                      background: "linear-gradient(135deg, rgb(56,189,248), rgb(124,58,237))",
                    }}
                  >
                    {actionQueue.length}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-fg text-sm leading-snug">
                      {[
                        actionQueue.filter((q) => q.kind === "new").length > 0
                          ? `${actionQueue.filter((q) => q.kind === "new").length} new`
                          : null,
                        actionQueue.filter((q) => q.kind === "stale").length > 0
                          ? `${actionQueue.filter((q) => q.kind === "stale").length} stalled`
                          : null,
                        actionQueue.filter((q) => q.kind === "offer-waiting").length > 0
                          ? `${actionQueue.filter((q) => q.kind === "offer-waiting").length} awaiting reply`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}{" "}
                      item{actionQueue.length !== 1 ? "s" : ""} need your attention
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      New applications, stalled candidates, and offers awaiting response.
                    </p>
                  </div>
                </div>
                <Link
                  href="/employer/postings"
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 bg-card border border-brand-200 hover:border-brand-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Review in workspace <ArrowRight size={12} />
                </Link>
              </div>
            </section>
          )}

          {/* ── HIRING SHOPFRONT ─────────────────────────────── */}
          {livePostingsPreview.length > 0 && (
            <section
              aria-label="Live postings"
              className="relative px-6 sm:px-10 lg:px-14 py-10 sm:py-12 border-t border-line"
            >
              <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
                <div>
                  <SectionEyebrow>Hiring shopfront</SectionEyebrow>
                  <h2 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
                    What trainees see when they find you
                  </h2>
                </div>
                <Link
                  href="/employer/postings"
                  className="text-xs font-bold inline-flex items-center gap-1"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgb(29,78,216), rgb(124,58,237))",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Manage all postings <ArrowRight size={11} className="text-brand-700" />
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {livePostingsPreview.map((p) => (
                  <PostingListRow key={p.id} posting={p} />
                ))}
              </ul>
            </section>
          )}

          {/* ── Empty postings hint ──────────────────────────── */}
          {livePostingsPreview.length === 0 && (
            <section className="relative px-6 sm:px-10 lg:px-14 py-10 sm:py-12 border-t border-line">
              <SectionEyebrow>Hiring shopfront</SectionEyebrow>
              <p className="text-sm text-muted max-w-xl leading-snug">
                No live postings yet. Once you publish your first one, this section will show what trainees see when they find your company.
              </p>
              <Link
                href="/employer/postings"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-800"
              >
                Create your first posting <ArrowRight size={11} />
              </Link>
            </section>
          )}

          {/* ── ADMIN: Employer portal feature inventory ─────────
              Visible only to admin / superadmin. A comprehensive
              map of every surface, tool, and feature built for HR
              accounts — so operators can audit the portal at a
              glance without memorising every route.
              Never rendered for employer or trainee roles. */}
          {isAdmin && (
            <section
              aria-label="Admin: employer feature inventory"
              className="relative px-6 sm:px-10 lg:px-14 py-10 sm:py-12 border-t border-sky-300/60"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(14,165,233,0.07) 0%, rgba(56,189,248,0.03) 100%)",
              }}
            >
              <SectionEyebrow>Admin view only</SectionEyebrow>
              <div className="mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
                  Employer portal — what&apos;s built
                </h2>
                <p className="text-sm text-muted mt-1.5 max-w-2xl leading-snug">
                  Complete inventory of every surface and tool built for HR accounts. Not visible to employers or trainees.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
                <HrFeatureGroup
                  color="#0ea5e9"
                  title="Brand Stage (this page)"
                  href="/employer"
                  items={[
                    { label: "Cinematic cover banner", note: "5-stop gradient · 5 aurora blobs · noise texture overlay" },
                    { label: "Logo disc", note: "Shape: natural / circle / rounded / square · pan + zoom crop in editor" },
                    { label: "Profile editor", note: "URL auto-fill via Clearbit/favicon · name, industry, size, location, founded, ticker, main business" },
                    { label: "Identity row", note: "Name · industry · location · size · founded · website · verified badge · hired-count chip" },
                    { label: "About section", note: "Pull-quote with 3-colour gradient rule · main-business sidecar" },
                    { label: "Stats bar", note: "Postings live · applicants reviewed · interviews held · team members (link to /team)" },
                    { label: "Pending join requests callout", note: "Amber banner when domain-match requests await approval" },
                    { label: "Action queue callout", note: "New apps · stalled ≥ 7 d · offers awaiting ≥ 2 d → deep-links to My Postings" },
                    { label: "Hiring shopfront", note: "Live postings as scannable list rows — what trainees see when they find the company" },
                  ]}
                />

                <HrFeatureGroup
                  color="#8b5cf6"
                  title="Hiring Workspace"
                  href="/employer/postings"
                  items={[
                    { label: "Create & manage postings", note: "Title · skills · location · type · compensation · deadline · status (draft / active / paused / closed)" },
                    { label: "Inline applicant pipeline", note: "7 stages: new → reviewing → shortlisted → phone screen → onsite → offer → hired / rejected" },
                    { label: "Action queue", note: "Per-posting queue surfacing new apps, stalled ≥ 7 d, and offers awaiting response" },
                    { label: "Demo seeder", note: "3 postings + applicants at every stage + interviews + offers — seed / clear without touching real data" },
                    { label: "Duplicate posting", note: "2-step confirm — creates draft copy titled '<original> (Copy)'" },
                    { label: "Scorecard builder", note: "≤10 criteria, 4/5-pt scale, lock, per-applicant interviewer submissions" },
                    { label: "Hiring team panel", note: "Assign recruiter / hiring_manager / interviewer / observer per posting" },
                    { label: "Bulk messaging", note: "Multi-select candidates + compose email with {{merge}} vars, 2-step confirm" },
                  ]}
                />

                <HrFeatureGroup
                  color="#10b981"
                  title="Team Management"
                  href="/employer/team"
                  items={[
                    { label: "Member roster", note: "Role chips · title · last-seen badges · change role · remove member" },
                    { label: "Invite by email", note: "Role assigned on invite · pending invite list with revoke · 7-day expiry" },
                    { label: "Join request panel", note: "Domain-match auto-suggest · approve / decline with one click" },
                    { label: "4-tier role system", note: "Owner → full admin · Manager → invite + approve · Generalist → post only · Viewer → read-only" },
                    { label: "Demo team seeder", note: "3 demo members (Manager, Generalist, Viewer) with staggered last-seen timestamps" },
                  ]}
                />

                <HrFeatureGroup
                  color="#f59e0b"
                  title="New HR Surfaces (May 2026 sprint)"
                  items={[
                    { label: "Email templates", href: "/employer/templates", note: "5 kinds · merge variables · starter protection · inline create/edit" },
                    { label: "Pipeline analytics + CSV", href: "/employer/analytics", note: "Stage funnel · velocity bars · offer acceptance rate · CSV download" },
                    { label: "Interview calendar", href: "/employer/calendar", note: "Week-view grid · format chips · confirmed vs pending slots" },
                    { label: "Notification inbox", note: "Bell + unread badge in sidebar · day-grouped drawer · mark-all-read" },
                    { label: "Public job board", href: "/jobs", note: "No-auth /jobs listing + /jobs/[id] detail + /jobs/[id]/apply direct apply" },
                    { label: "Talent pool filters", href: "/talent-pool", note: "Skills · stage · availability filters — all AND-combined with text search" },
                    { label: "Employer onboarding wizard", note: "4-step localStorage-persisted card (bottom-left) for new accounts" },
                    { label: "Hiring guide", href: "/employer/how-it-works", note: "End-to-end explainer with sidebar NavHighlight hover-integration" },
                  ]}
                />
              </div>

              {/* ── Interactive flowchart ──────────────────────────
                  Second subsection: a clickable node-map of every
                  route, page, API endpoint, and component in the
                  full HR module. Helps admins trace the exact data
                  and UI path for any hiring event. */}
              <div className="mt-12 pt-10 border-t border-sky-200/60">
                <HrFlowChart />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section sub-components ──────────────────────────────────────

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-subtle mb-4 inline-flex items-center gap-2">
      <span
        aria-hidden
        className="w-6 h-px"
        style={{
          background: "linear-gradient(90deg, rgb(56,189,248), rgb(124,58,237))",
        }}
      />
      {children}
    </p>
  );
}

function CoverBanner() {
  // Per-company brand-colour theming temporarily removed; cover
  // banner is the platform-default 5-stop purple-pink stage with
  // four auroras at full strength.
  return (
    <div className="relative h-56 sm:h-72 lg:h-[22rem] overflow-hidden">
      {/* Base layer — platform-default 5-stop gradient. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #0b0f24 0%, #142046 25%, #312e81 50%, #6b21a8 75%, #831843 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-40 -left-32 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, rgba(56,189,248,0.7), rgba(56,189,248,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 right-1/3 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-60"
        style={{
          background:
            "radial-gradient(closest-side, rgba(244,114,182,0.7), rgba(244,114,182,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[24rem] h-[24rem] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(closest-side, rgba(250,204,21,0.5), rgba(250,204,21,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 left-1/3 w-[22rem] h-[22rem] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(closest-side, rgba(74,222,128,0.5), rgba(74,222,128,0) 70%)",
        }}
      />
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full opacity-[0.22] mix-blend-overlay pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="cover-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0.4 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#cover-noise)" />
      </svg>
      <div
        aria-hidden
        className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-transparent to-black/40"
      />
      <div className="absolute top-5 left-6 sm:left-10 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] font-bold text-white/70">
        <span
          aria-hidden
          className="w-6 h-px"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.7))",
          }}
        />
        Brand stage
      </div>
    </div>
  );
}

function LogoDisc({
  src, alt, shape, transform,
}: {
  src?: string | null;
  alt: string;
  /** Mask shape resolved by `normalizeLogoShape` — "natural"
   *  | "circle" | "rounded" | "square". Drives the wrapper's
   *  corner radius and whether the inner image is contained or
   *  cropped. The conic glow ring stays circular regardless of
   *  the inner mask so the disc always reads as the "centre of
   *  gravity" of the identity row. */
  shape: "natural" | "circle" | "rounded" | "square";
  /** Pan / zoom applied INSIDE the mask. Mirrors what the
   *  operator dialed in via the cropper in the Edit Profile
   *  modal. Identity-default transform short-circuits to no style. */
  transform: LogoTransform;
}) {
  const { containerMask, imageFit } = logoShapeClasses(shape);
  const xformStyle = isIdentityTransform(transform)
    ? undefined
    : { transform: logoTransformCss(transform), transformOrigin: "center center" as const };
  // NO event handlers here — this is a server-component-rendered
  // chunk and onError={() => ...} on the <img> throws at render
  // ("Event handlers cannot be passed to Client Component props").
  // Broken-image fallback is handled by the briefcase glyph
  // layered absolutely under the img: when the browser can't load
  // the src, the img leaves a transparent gap and the glyph shows
  // through.
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-full opacity-70 blur-2xl"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(56,189,248,0.5), rgba(244,114,182,0.5), rgba(250,204,21,0.4), rgba(74,222,128,0.4), rgba(56,189,248,0.5))",
        }}
      />
      <div
        className={
          "relative w-32 h-32 sm:w-40 sm:h-40 bg-white ring-4 ring-white shadow-pedestal flex items-center justify-center overflow-hidden " +
          containerMask
        }
      >
        {/* Glyph fallback — only rendered when there's NO src. Earlier
            versions left it absolutely-positioned underneath the img,
            assuming the img would cover it. Logos with internal
            transparency (Bayer's white-on-cross mark, etc.) let the
            briefcase show THROUGH the logo, which read as an icon
            stacked on the brand mark. Mutually-exclusive render is
            cleaner — broken-image still shows the briefcase because
            the <img> simply isn't rendered when `src` is empty. */}
        {!src ? (
          <Briefcase size={40} className="text-slate-300" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className={
              imageFit + " " +
              (imageFit === "object-contain"
                // Natural: contain the logo inside the disc, with breathing room.
                ? "w-24 h-24 sm:w-28 sm:h-28"
                // Cropping shapes: fill the wrapper edge-to-edge.
                : "w-full h-full")
            }
            style={xformStyle}
          />
        )}
      </div>
    </div>
  );
}

function InlineMeta({
  icon: Icon, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg font-medium">
      <Icon size={13} className="text-subtle" />
      {children}
    </span>
  );
}

function Dot() {
  return <span aria-hidden className="inline-block w-1 h-1 rounded-full bg-line" />;
}

function InlineStat({
  label, value, tone, href,
}: {
  label: string;
  value: number;
  tone: "brand" | "violet" | "rose" | "emerald";
  href?: string;
}) {
  const gradients: Record<typeof tone, string> = {
    brand:   "linear-gradient(135deg, rgb(56,189,248) 0%, rgb(29,78,216) 100%)",
    violet:  "linear-gradient(135deg, rgb(167,139,250) 0%, rgb(109,40,217) 100%)",
    rose:    "linear-gradient(135deg, rgb(251,113,133) 0%, rgb(190,18,60) 100%)",
    emerald: "linear-gradient(135deg, rgb(52,211,153) 0%, rgb(4,120,87) 100%)",
  };
  const inner = (
    <>
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
        {label}
      </p>
      <p
        className="text-4xl sm:text-5xl lg:text-6xl font-bold tabular-nums tracking-tight leading-none mt-2"
        style={{
          backgroundImage: gradients[tone],
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {value.toLocaleString()}
      </p>
    </>
  );
  return href ? (
    <Link href={href} className="px-5 sm:px-8 first:pl-0 last:pr-0 hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  ) : (
    <div className="px-5 sm:px-8 first:pl-0 last:pr-0">
      {inner}
    </div>
  );
}

interface PostingPreview {
  id: string;
  title: string;
  location: string | null;
  type: string | null;
  compensation: string | null;
  deadline: Date | null;
  keySkills: string[];
  // Type-wise Prisma always populates this when included, but
  // defensive in case the runtime row is malformed.
  _count?: { applicationStatuses: number } | null;
}

function PostingListRow({ posting }: { posting: PostingPreview }) {
  const allSkills = posting.keySkills ?? [];
  const skills = allSkills.slice(0, 4);
  const applicantCount = posting._count?.applicationStatuses ?? 0;
  return (
    <li>
      <Link
        href={`/employer/postings/${posting.id}/applicants`}
        className="group block py-4 hover:bg-elevated/40 transition-colors -mx-3 sm:-mx-5 px-3 sm:px-5 rounded-xl"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-bold text-fg text-base group-hover:text-brand-700 transition-colors">
                {posting.title}
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] font-bold text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {posting.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {posting.location}
                </span>
              )}
              {posting.type && (<><Dot /><span>{posting.type}</span></>)}
              {posting.compensation && (<><Dot /><span>{posting.compensation}</span></>)}
              {posting.deadline && (
                <>
                  <Dot />
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={11} />
                    Closes {posting.deadline.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </span>
                </>
              )}
            </div>
            {skills.length > 0 && (
              <p className="mt-1.5 text-xs text-subtle truncate">
                {skills.join(" · ")}
                {allSkills.length > 4 && ` · +${allSkills.length - 4} more`}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p
              className="text-2xl font-bold tabular-nums tracking-tight leading-none"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgb(56,189,248), rgb(124,58,237))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {applicantCount}
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle mt-1">
              applicant{applicantCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

// ─── Admin sub-components ────────────────────────────────────────

/** One group in the admin HR feature inventory. A coloured dot +
 *  title header followed by a left-accented bullet list of features
 *  with short descriptive notes. Used only in the admin-gated section
 *  at the bottom of /employer. */
function HrFeatureGroup({
  color, title, href, items,
}: {
  color: string;
  title: string;
  href?: string;
  items: { label: string; note: string; href?: string }[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
        <h3 className="text-xs font-bold text-fg uppercase tracking-[0.18em]">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className="ml-auto text-[11px] font-semibold inline-flex items-center gap-1 hover:underline"
            style={{ color }}
          >
            Open <ArrowRight size={10} />
          </Link>
        )}
      </div>
      <ul
        className="space-y-1.5 border-l-2 pl-4"
        style={{ borderColor: `${color}44` }}
      >
        {items.map((item) => (
          <li key={item.label} className="text-xs leading-snug">
            {item.href ? (
              <Link
                href={item.href}
                className="font-semibold hover:underline"
                style={{ color }}
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-fg">{item.label}</span>
            )}{" "}
            <span className="text-muted">{item.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── URL helpers ─────────────────────────────────────────────────

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "#";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function hostnameFor(input: string): string {
  try {
    return new URL(normalizeUrl(input)).hostname.replace(/^www\./, "");
  } catch {
    return input;
  }
}
