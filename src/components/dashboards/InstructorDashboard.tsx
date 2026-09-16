import Link from "next/link";
import {
  BookOpen, GraduationCap, Users, ArrowRight, Plus, ClipboardList,
  Sparkles, ChevronRight, FileText, TrendingUp, Calendar,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { GreetingTagline } from "@/components/lms/GreetingTagline";
import { PageHero } from "@/components/ui/PageHero";
import { isPausedPath, withoutPaused } from "@/lib/deploy/paused";

/**
 * Instructor dashboard — what someone authoring courses actually wants
 * to see when they sign in: their own courses, who's enrolled, what
 * needs grading. Not the trainee's "continue learning" view.
 */
export async function InstructorDashboard({
  user, committeeBadge,
}: {
  user: { id: string; name: string | null };
  /** Optional content rendered immediately AFTER the hero — used by
   *  the dashboard page to inject CommitteeBadgeStrip without
   *  pushing the editorial hero off the top of the page. */
  committeeBadge?: React.ReactNode;
}) {
  const firstName = user.name?.split(" ")[0] ?? "there";

  // Run the dashboard queries in parallel — none depends on the others.
  const [myCourses, enrollmentsCount, certsCount, recentEnrollments, pendingAttempts] =
    await Promise.all([
      prisma.course.findMany({
        where: { instructorId: user.id },
        select: {
          id: true, title: true, status: true, thumbnail: true,
          createdAt: true,
          _count: { select: { enrollments: true, modules: true, assessments: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.enrollment.count({ where: { course: { instructorId: user.id } } }),
      prisma.certificate.count({ where: { course: { instructorId: user.id }, revokedAt: null } }),
      prisma.enrollment.findMany({
        where: { course: { instructorId: user.id } },
        include: {
          user: { select: { name: true, email: true } },
          course: { select: { id: true, title: true } },
        },
        orderBy: { enrolledAt: "desc" },
        take: 6,
      }),
      // Attempts the instructor might want to review — submitted but
      // not yet recorded in CSV-style. Schema may not flag "review"
      // separately, so we take the latest 5 attempts on their courses
      // as a stand-in for "things to glance at".
      prisma.assessmentAttempt.findMany({
        where: { assessment: { course: { instructorId: user.id } } },
        include: {
          user: { select: { name: true, email: true } },
          assessment: { select: { title: true, courseId: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 5,
      }).catch(() => []),
    ]);

  // Course links go where ENGAGE is paused on this deployment
  // (src/lib/deploy/paused.ts); false everywhere else.
  const coursesPaused = isPausedPath("/courses");
  const myCoursesCount = myCourses.length;
  const publishedCount = myCourses.filter((c) => c.status === "published").length;

  return (
    <div className="space-y-8">
      {/* Hero — converted to canonical PageHero so every dashboard
          surface uses the same cinematic shape. Stat tiles + greeting
          tagline that used to live IN the hero now live as their own
          card row beneath (see below). */}
      <PageHero
        eyebrow={<><BookOpen size={11} /> Instructor desk</>}
        title={<>Hi, {firstName}.</>}
        description={
          myCoursesCount > 0
            ? `You're authoring ${myCoursesCount} course${myCoursesCount === 1 ? "" : "s"} (${publishedCount} published) with ${enrollmentsCount} enrolment${enrollmentsCount === 1 ? "" : "s"} between them.`
            : "Create your first course to start authoring on BHN."
        }
        actions={(
          <>
            {!coursesPaused && (
            <Link
              href="/courses?from=instructor"
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Plus size={12} /> New course
            </Link>
            )}
            {!isPausedPath("/gradebook") && (
            <Link
              href="/gradebook"
              className="inline-flex items-center gap-1.5 bg-card hover:bg-elevated border border-line text-fg text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <ClipboardList size={12} /> Gradebook
            </Link>
            )}
          </>
        )}
      />

      {/* Committee badge — slotted in by the page wrapper. Renders
          immediately after the hero so the platform "hero is at the
          top" rule is preserved. */}
      {committeeBadge}

      {/* Stat tiles + greeting tagline pulled OUT of the previous hero
          so the new PageHero stays clean. Rendered as a peer row. */}
      <div className="space-y-4">
        <GreetingTagline tone="light" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: BookOpen,      label: "My courses",   value: myCoursesCount   },
            { icon: GraduationCap, label: "Enrolments",   value: enrollmentsCount },
            { icon: TrendingUp,    label: "Published",    value: publishedCount   },
            { icon: ClipboardList, label: "Certificates", value: certsCount       },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-card border border-line rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-2 text-subtle text-[11px] uppercase tracking-wider">
                  <Icon size={12} /> {s.label}
                </div>
                <p className="text-3xl font-bold text-fg mt-1">{s.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {withoutPaused([
          { href: "/courses",          label: "Catalog",     icon: BookOpen, tone: "brand" },
          { href: "/gradebook",        label: "Gradebook",   icon: ClipboardList, tone: "amber" },
          { href: "/admin/internships/new", label: "Authoring", icon: Sparkles, tone: "violet" },
          { href: "/changelog",        label: "Changelog",   icon: FileText, tone: "emerald" },
        ]).map((a) => {
          const Icon = a.icon;
          const tones: Record<string, string> = {
            brand:   "from-brand-500 to-brand-700 shadow-brand-600/20",
            violet:  "from-violet-500 to-violet-700 shadow-violet-600/20",
            amber:   "from-amber-400 to-amber-600 shadow-amber-500/20",
            emerald: "from-emerald-500 to-emerald-700 shadow-emerald-600/20",
          };
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group bg-card border border-line rounded-2xl p-4 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-200 transition-all flex items-center gap-3"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tones[a.tone]} text-white flex items-center justify-center shadow-md shrink-0`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg truncate">{a.label}</p>
                <p className="text-xs text-subtle mt-0.5 inline-flex items-center gap-0.5">Open <ChevronRight size={11} /></p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* My courses */}
      <section className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-fg">My courses</h2>
            <p className="text-xs text-muted mt-0.5">Most-recently updated first</p>
          </div>
          {!coursesPaused && (
          <Link href="/courses?from=instructor" className="text-xs font-medium text-brand-700 hover:underline inline-flex items-center gap-1">
            See all <ArrowRight size={11} />
          </Link>
          )}
        </div>
        {myCourses.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted">
            <div className="w-12 h-12 mx-auto rounded-xl bg-elevated text-muted flex items-center justify-center mb-3">
              <BookOpen size={20} />
            </div>
            No courses yet. Create your first to start enrolling learners.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {myCourses.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-elevated/40">
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-line bg-elevated shrink-0">
                  {c.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-subtle">
                      <BookOpen size={18} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {coursesPaused ? (
                    <span className="font-medium text-fg leading-tight">{c.title}</span>
                  ) : (
                  <Link href={`/courses/${c.id}`} className="font-medium text-fg leading-tight hover:text-brand-700 transition-colors">
                    {c.title}
                  </Link>
                  )}
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
                    <span>{c._count.modules} modules</span>
                    <span>·</span>
                    <span>{c._count.assessments} assessments</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {c._count.enrollments}</span>
                  </div>
                </div>
                <StatusPill status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent enrolments + recent attempts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-card border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="font-semibold text-fg">Recent enrolments</h2>
            <p className="text-xs text-muted mt-0.5">Latest learners across your courses</p>
          </div>
          {recentEnrollments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">No enrolments yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {recentEnrollments.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(e.user.name?.[0] ?? e.user.email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg truncate">{e.user.name ?? e.user.email}</p>
                    <p className="text-xs text-muted truncate">{e.course.title}</p>
                  </div>
                  <span className="text-[11px] text-subtle inline-flex items-center gap-1 shrink-0">
                    <Calendar size={11} /> {new Date(e.enrolledAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-card border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="font-semibold text-fg">Recent assessment attempts</h2>
            <p className="text-xs text-muted mt-0.5">Glance at how learners are scoring</p>
          </div>
          {pendingAttempts.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">No attempts yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {pendingAttempts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg truncate">{a.assessment.title}</p>
                    <p className="text-xs text-muted truncate">{a.user.name ?? a.user.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {typeof a.score === "number" ? (
                      <p className={`text-sm font-semibold ${a.score >= 80 ? "text-emerald-700" : a.score >= 60 ? "text-amber-700" : "text-rose-700"}`}>
                        {Math.round(a.score)}%
                      </p>
                    ) : (
                      <p className="text-xs text-subtle">In progress</p>
                    )}
                    <p className="text-[10px] text-subtle mt-0.5">{new Date(a.startedAt).toLocaleDateString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "published"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "draft"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-elevated text-muted border-line";
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cls}`}>
      {status}
    </span>
  );
}
