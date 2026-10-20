import Link from "next/link";
import { saveWorkshopRegistration } from "@/lib/training-week/workshop-registration";
import { loadCapacityMonitor } from "@/lib/training-week/capacity-server";
import { updateWorkshop } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { ArrowRight, Building2, Briefcase, BookOpen, Inbox, Rocket } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isPausedPath, withoutPaused } from "@/lib/deploy/paused";
import { AdminDashboardCards } from "@/components/dashboards/AdminDashboardCards";
import { loadDashboardLayout } from "@/lib/dashboard/card-order-store";
import { ReleasedSeats } from "@/components/training-week/ReleasedSeats";

/**
 * Admin / superadmin dashboard.
 *
 * Redesign v3.2 (May 2026): same magazine-cover idiom on top, but
 * THEME-AWARE — colors come from the platform's --bg / --card /
 * --fg / --brand-* tokens, not from hard-coded Y2K candy colors.
 * So when the user picks Light, Cinematic, Sakura, Atom Punk, etc.
 * the dashboard re-tints itself accordingly. The Y2K "look" — glassy
 * surfaces, pearl inner highlights, soft drop shadows — comes
 * through via box-shadow + backdrop-filter instead of palette.
 *
 *   • Top section — L21 magazine cover. Eyebrow + italic headline
 *     (priority cascade: pending > 0 → "X approvals waiting" /
 *     setup incomplete → "step N of M" / otherwise → "platform
 *     reads healthy"), deck, four stamp pills, signoff. Right-side
 *     numbered table of contents that deep-links to the action
 *     queue, bench, postings, audit, setup checklist (if open),
 *     credit-expiry watch (if any), AI calls (superadmin only).
 *
 * Shared event cards and personal page usage follow the cover.
 * Theme-aware tokens are scoped under `.adash-aero` in the AERO_CSS
 * constant at the bottom of this file — no leakage to other surfaces.
 */
export async function AdminDashboard({
  user, role, committeeBadge, pageUsage,
}: {
  user: { id: string; name: string | null };
  role: string;
  /** Optional content rendered immediately AFTER the hero — used by
   *  the dashboard page to inject CommitteeBadgeStrip without
   *  pushing the editorial hero off the top of the page. */
  committeeBadge?: React.ReactNode;
  pageUsage?: React.ReactNode;
}) {
  const firstName = user.name?.split(" ")[0] ?? "there";
  const isSuperAdmin = role === "superadmin";
  const since7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, totalCourses, totalEnrollments, new7dUsers,
    pendingCreditApps, pendingRoleRequests, pendingPathwayApps,
    employerCount, employerInvitesPending,
    activePostings, totalApplications,
    demoWorkspaceCount,
    aiCalls7d,
    capacity,
    dashboardLayout,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true, accountKind: "real" } }),
    prisma.course.count({ where: { status: "published" } }),
    prisma.enrollment.count(),
    prisma.user.count({ where: { createdAt: { gt: since7d }, accountKind: "real" } }),
    prisma.creditApplication.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.roleChangeRequest.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.pathwayEnrollment.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.user.count({ where: { role: "employer", accountKind: "real" } }),
    prisma.employerInvite.count({ where: { usedAt: null, expiresAt: { gt: new Date() } } }).catch(() => 0),
    prisma.internshipPosting.count({ where: { status: "active" } }).catch(() => 0),
    prisma.applicationStatus.count().catch(() => 0),
    prisma.user.count({ where: { accountKind: "demo" } }).catch(() => 0),
    isSuperAdmin
      ? prisma.aIInteraction.count({ where: { createdAt: { gt: since7d } } }).catch(() => 0)
      : Promise.resolve(0),
    // Never lets the dashboard fail: no monitor rather than no page.
    loadCapacityMonitor().catch(() => []),
    loadDashboardLayout().catch(() => null),
  ]);

  // ENGAGE / EXPERIENCE links drop out where those pillars are paused on
  // this deployment (src/lib/deploy/paused.ts); all false elsewhere. A
  // paused queue is not counted as waiting: nobody can open it here.
  const creditQueuePaused = isPausedPath("/admin/credit-applications");
  const pathwayQueuePaused = isPausedPath("/admin/pathway-enrollments");
  const trainingPaused = isPausedPath("/courses");
  const employerPortalPaused = isPausedPath("/employer");
  const pendingCreditQueue = creditQueuePaused ? 0 : pendingCreditApps;
  const pendingPathwayQueue = pathwayQueuePaused ? 0 : pendingPathwayApps;
  const totalPending = pendingCreditQueue + pendingRoleRequests + pendingPathwayQueue;

  const now = new Date();
  const horizon = (days: number) => new Date(now.getTime() + days * 86_400_000);
  const expiringWindow = async (days: number) => {
    const rows = await prisma.creditTransaction.findMany({
      where: {
        type: "credit",
        expiresAt: { not: null, gt: now, lte: horizon(days) },
        expiredAt: null,
        user: { accountKind: "real" },
      },
      select: { amount: true, expiredAmount: true, userId: true },
    }).catch(() => []);
    const credits = rows.reduce((sum, r) => sum + Math.max(0, r.amount - r.expiredAmount), 0);
    const users = new Set(rows.map((r) => r.userId)).size;
    return { credits, users };
  };
  const [expiring7, expiring30, expiring90] = await Promise.all([
    expiringWindow(7), expiringWindow(30), expiringWindow(90),
  ]);
  const anyExpiry = expiring7.credits + expiring30.credits + expiring90.credits > 0;

  // ── Setup checklist heuristics ─────────────────────────────────
  const checklist: Array<{
    id: string;
    done: boolean;
    label: string;
    detail: string;
    href: string;
    icon: React.ElementType;
  }> = withoutPaused([
    {
      id: "demo-workspace",
      done: demoWorkspaceCount > 0,
      label: "Spawn a demo workspace",
      detail: "Throwaway accounts that walk a prospective partner through the full platform.",
      href: "/admin/demo-workspaces",
      icon: Rocket,
    },
    {
      id: "invite-employer",
      done: employerCount > 0 || employerInvitesPending > 0,
      label: "Invite your first employer",
      detail: "Drop in their email, copy the link, send via your usual channel.",
      href: "/admin/employer-invites",
      icon: Building2,
    },
    {
      id: "first-posting",
      done: activePostings > 0,
      label: "Create the first posting",
      detail: "Paste a JD; the AI fills in the fields. Or seed demo postings from /employer/postings.",
      href: "/admin/internships/new",
      icon: Briefcase,
    },
    {
      id: "first-course",
      done: totalCourses > 0,
      label: "Publish at least one course",
      detail: "The training catalog is the backbone — even one course lets sign-ups try the LMS loop.",
      href: "/courses?from=instructor",
      icon: BookOpen,
    },
    {
      id: "talent-application",
      done: totalApplications > 0,
      label: "See talent flow through",
      detail: "Once a trainee submits the talent application, cards appear on /employer/applicants with AI match scores.",
      href: "/employer/applicants",
      icon: Inbox,
    },
  ]);
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistOpen = checklist.length - checklistDone;
  const setupPct = checklist.length ? Math.round((checklistDone / checklist.length) * 100) : 100;
  const showChecklist = checklistOpen > 0 && (totalUsers < 10 || activePostings === 0 || employerCount === 0);
  const nextChecklistItem = checklist.find((c) => !c.done);

  // ── Cover headline (priority cascade) ──────────────────────────
  // Mirrors the old spotlight cascade but rendered as a magazine
  // masthead in the new Y2K Aero layout below.
  const issueDate = now.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();

  const cover: { headline: React.ReactNode; dek: string } =
    totalPending > 0
      ? {
          headline: (
            <>
              Hi, {firstName} — <span className="text-[0.5em] align-baseline"><em>{totalPending} {totalPending === 1 ? "approval" : "approvals"}</em> waiting.</span>
            </>
          ),
          dek: "Trainees across credit applications, role-change requests, and pathway enrolments are blocked until you triage. Most rows take less than a minute.",
        }
      : showChecklist && nextChecklistItem
        ? {
            headline: (
              <>
                Hi, {firstName} — setup, <em>step {checklistDone + 1} of {checklist.length}</em>.
              </>
            ),
            dek: nextChecklistItem.detail,
          }
        : {
            headline: (
              <>
                Hi, {firstName}.
              </>
            ),
            dek: `Nothing in the queue. ${totalUsers.toLocaleString()} active user${totalUsers === 1 ? "" : "s"}, ${activePostings} live posting${activePostings === 1 ? "" : "s"}, ${totalApplications} talent application${totalApplications === 1 ? "" : "s"} in flight.`,
          };


  return (
    <div className="adash-aero">
      {/* Scoped theme-aware CSS for the dashboard's glassy/aero look.
          Selectors live under `.adash-aero` so nothing leaks out. */}
      <style dangerouslySetInnerHTML={{ __html: AERO_CSS }} />

      {/* ════ MAGAZINE COVER ════════════════════════════════════════ */}
      <article className="aero-frame">
        <div className="cover-wrap">
          <section className="cover">
            <p className="issue">BHN OPERATIONS · ISSUE {issueDate}</p>
            <h1 className="headline">{cover.headline}</h1>
            <p className="dek">{cover.dek}</p>
            <div className="stamps">
              <span className="pill">{totalUsers.toLocaleString()} users</span>
              <span className="pill">{totalCourses} courses</span>
              <span className="pill">{activePostings} postings</span>
              <span className={totalPending > 0 ? "pill warn" : "pill"}>
                {totalPending} pending
              </span>
            </div>
            <p className="signoff">
              {isSuperAdmin ? "Superadmin desk" : "Admin desk"} · signed in as {firstName}
              {new7dUsers > 0 && <span> · {new7dUsers} new sign-up{new7dUsers === 1 ? "" : "s"} this week</span>}
            </p>
          </section>

          {/* TOC replaced with "Across the pillars" — three pillar
              status blocks aimed at a pillar lead who manages
              activities across Engage, Experience, Equip. Each block
              is a clickable card linking into that pillar's main
              admin surface. */}
          <aside className="toc">
            <h3>Across the pillars</h3>
            {!trainingPaused && (
            <Link className="pillar pillar-engage" href="/admin/courses">
              <div className="ph">
                <span className="px">Engage</span>
                <span className="pn">{totalUsers.toLocaleString()}</span>
              </div>
              <p className="pd">trainees on the platform</p>
              <div className="pm">
                <span><strong>{totalCourses}</strong> courses</span>
                <span><strong>{totalEnrollments.toLocaleString()}</strong> enrolments</span>
                <span><strong>+{new7dUsers}</strong> this week</span>
              </div>
            </Link>
            )}
            {!employerPortalPaused && (
            <Link className="pillar pillar-experience" href="/employer/applicants">
              <div className="ph">
                <span className="px">Experience</span>
                <span className="pn">{totalApplications.toLocaleString()}</span>
              </div>
              <p className="pd">talent applications in flight</p>
              <div className="pm">
                <span><strong>{activePostings}</strong> live postings</span>
                <span><strong>{employerCount}</strong> employers</span>
                {pendingRoleRequests > 0 && <span className="warn"><strong>{pendingRoleRequests}</strong> role req.</span>}
              </div>
            </Link>
            )}
            <Link className="pillar pillar-equip" href="/admin/equip">
              <div className="ph">
                <span className="px">Equip</span>
                {!creditQueuePaused && <span className={pendingCreditApps > 0 ? "pn warn" : "pn"}>{pendingCreditApps}</span>}
              </div>
              <p className="pd">{creditQueuePaused ? "commercialization review" : "commercialization apps pending"}</p>
              <div className="pm">
                {anyExpiry && !creditQueuePaused && <span className="warn"><strong>{expiring30.users}</strong> credit expiring 30d</span>}
                {!anyExpiry && !creditQueuePaused && <span>no expiry watch</span>}
                {isSuperAdmin && <span><strong>{aiCalls7d}</strong> AI calls · 7d</span>}
              </div>
            </Link>
            <Link href="/admin/insights" className="toc-cta">
              Open the operations briefing <ArrowRight size={11} />
            </Link>
          </aside>
        </div>
      </article>

      {committeeBadge}

      <AdminDashboardCards sessions={capacity} saveWorkshopState={saveWorkshopRegistration} saveCapacity={updateWorkshop}
        initialLayout={dashboardLayout} releasedSeats={<ReleasedSeats framed showEmpty />} />

      {pageUsage}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   THEME-AWARE AERO STYLES — scoped to `.adash-aero`.
   Same visual idiom as Y2K Aero (glassy cards, pearl inner highlights,
   soft drop shadows) but colors come from the platform's --bg /
   --card / --fg / --brand-* tokens so the dashboard re-tints per
   active theme (Light, Cinematic, Sakura, Atom Punk, etc.).
════════════════════════════════════════════════════════════════════ */
const AERO_CSS = `
.adash-aero {
  display: flex; flex-direction: column; gap: 14px;
  color: var(--fg);
  --porcelain-glaze:
    linear-gradient(180deg, color-mix(in srgb, var(--card-solid) 97%, var(--fg)) 0%, var(--card-solid) 20px, var(--card-solid) 80%, color-mix(in srgb, var(--card-solid) 98%, var(--fg)) 100%);
  --porcelain-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--card-solid) 92%, var(--fg)),
    inset 0 -1px 2px color-mix(in srgb, var(--card-solid) 96%, var(--fg)),
    0 2px 3px rgb(25 51 60 / 7%),
    0 10px 26px rgb(25 51 60 / 10%);
}

/* ── Outer frame ─────────────────────────────────────────────────── */
.adash-aero .aero-frame {
  background-color: var(--card-solid);
  background-image: var(--porcelain-glaze);
  border-radius: 22px;
  border: 1px solid transparent;
  overflow: hidden;
  box-shadow: var(--porcelain-shadow);
  position: relative;
  isolation: isolate;
  min-width: 0;
}
.adash-aero .aero-frame::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--card-solid) 98%, var(--fg)), transparent 12px);
  pointer-events: none; z-index: 0;
}
.adash-aero .aero-frame > * { position: relative; z-index: 1; }

/* ── Magazine cover ───────────────────────────────────────────── */
.adash-aero .cover-wrap { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); }
@media (max-width: 900px) { .adash-aero .cover-wrap { grid-template-columns: 1fr; } }
.adash-aero .cover { padding: 20px 24px; display: flex; flex-direction: column; justify-content: center; }
.adash-aero .cover .issue {
  font-family: ui-monospace, 'IBM Plex Mono', monospace;
  font-size: 10.5px; letter-spacing: 0; text-transform: uppercase;
  color: var(--fg-muted); margin: 0 0 8px; font-weight: 700;
}
.adash-aero .cover .headline {
  font-size: 28px; font-weight: 800; letter-spacing: 0;
  line-height: 1.2; margin: 0 0 8px; color: var(--fg); overflow-wrap: anywhere;
  text-shadow: 0 1px 0 rgba(255,255,255,0.45);
}
.adash-aero .cover .headline em {
  font-style: italic; color: var(--brand-700);
}
.adash-aero .cover .dek { font-size: 13px; color: var(--fg-muted); max-width: 70ch; line-height: 1.4; margin: 0 0 8px; }
.adash-aero .stamps { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.adash-aero .pill {
  display: inline-block; padding: 4px 11px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--line-strong);
  font-size: 11.5px; font-weight: 700; color: var(--brand-700);
  letter-spacing: 0.04em;
}
.adash-aero .pill.warn {
  background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.5);
  color: rgb(180, 83, 9);
}
.adash-aero .signoff {
  font-family: ui-monospace, 'IBM Plex Mono', monospace;
  font-size: 10.5px; letter-spacing: 0; text-transform: uppercase;
  color: var(--fg-subtle); margin: 10px 0 0;
}

.adash-aero .toc {
  background: var(--card);
  border-left: 1px solid var(--line);
  padding: 16px 20px; display: flex; flex-direction: column; gap: 8px;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
}
.adash-aero .toc h3 {
  font-family: ui-monospace, 'IBM Plex Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.32em; text-transform: uppercase;
  color: var(--fg-muted); margin: 0; font-weight: 700;
}
/* Pillar summary card (replaces the old TOC list). One per pillar
   — Engage / Experience / Equip. Each is a clickable tile linking
   into that pillar's main admin surface. */
.adash-aero .toc .pillar {
  display: block;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--card-solid);
  text-decoration: none;
  color: var(--fg);
  transition: all 120ms;
  box-shadow: 0 1px 0 rgba(255,255,255,0.4) inset;
}
.adash-aero .toc .pillar:hover {
  border-color: var(--line-strong);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.adash-aero .toc .pillar .ph {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin-bottom: 2px;
}
.adash-aero .toc .pillar .px {
  font-family: ui-monospace, 'IBM Plex Mono', monospace;
  font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase;
  color: var(--fg-muted); font-weight: 700;
}
.adash-aero .toc .pillar .pn {
  font-size: 28px; font-weight: 800; letter-spacing: -0.025em;
  line-height: 1; color: var(--brand-700);
  font-variant-numeric: tabular-nums;
}
.adash-aero .toc .pillar .pn.warn { color: rgb(180, 83, 9); }
.adash-aero .toc .pillar .pd {
  margin: 0 0 8px; font-size: 12px; color: var(--fg-muted); font-style: italic;
}
.adash-aero .toc .pillar .pm {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  font-size: 11.5px; color: var(--fg-muted);
}
.adash-aero .toc .pillar .pm strong {
  color: var(--fg); font-weight: 700;
  font-family: ui-monospace, 'IBM Plex Mono', monospace;
}
.adash-aero .toc .pillar .pm .warn { color: rgb(180, 83, 9); }
.adash-aero .toc .pillar.pillar-engage { border-left: 3px solid var(--brand-500); }
.adash-aero .toc .pillar.pillar-experience { border-left: 3px solid rgb(245, 158, 11); }
.adash-aero .toc .pillar.pillar-equip { border-left: 3px solid rgb(99, 102, 241); }
.adash-aero .toc-cta {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 8px;
  font-family: ui-monospace, 'IBM Plex Mono', monospace;
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  font-weight: 700; color: var(--brand-700); text-decoration: none;
  padding: 8px 14px; border-radius: 8px;
  background: var(--card-solid); border: 1px solid var(--line-strong);
  align-self: start; transition: all 120ms;
}
.adash-aero .toc-cta:hover { background: var(--brand-50); }

.adash-aero .aero-card {
  background-color: var(--card-solid);
  background-image: var(--porcelain-glaze);
  border: 1px solid transparent;
  border-radius: 14px;
  box-shadow: var(--porcelain-shadow);
  padding: 18px 22px;
}
/* A framed panel is one glazed surface, not two stacked cards. */
.adash-aero .aero-frame > .aero-card {
  background: transparent;
  border-color: transparent;
  border-radius: inherit;
  box-shadow: none;
}
@media (forced-colors: active) {
  .adash-aero .aero-frame, .adash-aero .aero-card {
    background: Canvas;
    color: CanvasText;
    border-color: CanvasText;
    box-shadow: none;
  }
  .adash-aero .aero-frame::before { display: none; }
}
.adash-aero .aero-h {
  font-size: 14px; font-weight: 700; margin: 0 0 4px;
  letter-spacing: -0.005em;
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--fg);
}
.adash-aero .aero-h svg { color: var(--brand-600); flex-shrink: 0; }
.adash-aero .aero-gloss { color: var(--fg-muted); font-size: 12px; margin: 0 0 12px; }
`;
