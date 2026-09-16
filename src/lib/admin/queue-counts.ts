/**
 * Admin queue-count fetcher.
 *
 * Returns the number of items pending admin attention for every nav
 * item that has a real queue behind it. The Sidebar reads this map at
 * render time and stamps a small badge next to the matching nav row
 * so an admin can see at a glance — without clicking through — which
 * queues need triage.
 *
 * Design system pattern (new in May 2026): "queue badges".
 *   • Map<badgeKey, number> shape so the call-site stays decoupled
 *     from the nav table — adding a new badge is a single arm here +
 *     a `badgeKey` on the matching NavItem.
 *   • Only renders when count > 0 (we never show "0 pending" because
 *     the absence of the chip already means clear).
 *   • Capped at 99 for visual stability ("99+" rendered).
 *
 * Performance
 *   Six counts in parallel via Promise.all. On Postgres these are all
 *   indexed (.status partial indexes or composite (status, *)) so the
 *   request adds <30 ms to a layout render. Counts fall back to 0
 *   when a query errors so a one-table outage doesn't cascade into a
 *   sidebar render failure.
 *
 * Visibility gate
 *   The fetcher itself does NOT check auth — that's the caller's job.
 *   DashboardLayout only invokes this when the effective role is
 *   admin or above; for trainees / employers the map is empty and no
 *   badges render.
 */
import { prisma } from "@/lib/prisma";
import { isPausedPath } from "@/lib/deploy/paused";

/** Every key the Sidebar's NavItems can reference as `badgeKey`.
 *  Keep this in sync with the Sidebar's queueBadgeKey values — TS
 *  doesn't enforce that mapping for us, so a comment-anchor is the
 *  best we get. */
export type QueueBadgeKey =
  | "credit-applications"
  | "role-requests"
  | "pathway-enrollments"
  | "access-requests"
  | "theme-proposals"
  | "employer-intake-new"
  | "inbox-total";

/** PlatformSetting key holding the ISO timestamp an admin last opened the
 *  Employer-intake page. Submissions newer than this are "new". */
export const EMPLOYER_INTAKE_SEEN_KEY = "employerIntakeSeenAt";

export type QueueCounts = Partial<Record<QueueBadgeKey, number>>;

/** Read all admin queues in parallel. Every per-table failure is
 *  swallowed → 0 so the layout render never blows up on a missing
 *  table or a Prisma-client mismatch in CI. */
export async function getAdminQueueCounts(): Promise<QueueCounts> {
  // "New" employer-intake leads = submissions created after the last time an
  // admin opened that page (a global last-seen timestamp). Null = never opened
  // → everything counts as new until the first visit clears it.
  const seenRow = await prisma.platformSetting
    .findUnique({ where: { key: EMPLOYER_INTAKE_SEEN_KEY }, select: { value: true } })
    .catch(() => null);
  const seenAt = seenRow?.value ? new Date(seenRow.value) : null;

  const [
    creditApps,
    roleChanges,
    pathwayApps,
    accessRequests,
    themeProposals,
    employerIntakeNew,
  ] = await Promise.all([
    prisma.creditApplication.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.roleChangeRequest.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.pathwayEnrollment.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.accessRequest.count({ where: { status: "pending" } }).catch(() => 0),
    prisma.themeProposal.count({ where: { status: { in: ["submitted", "under_review"] } } }).catch(() => 0),
    prisma.eventFormSubmission
      .count({
        where: {
          form: { slug: "employer-intake" },
          ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
        },
      })
      .catch(() => 0),
  ]);
  const counts: QueueCounts = {
    "credit-applications":  creditApps,
    "role-requests":        roleChanges,
    "pathway-enrollments":  pathwayApps,
    "access-requests":      accessRequests,
    "theme-proposals":      themeProposals,
    "employer-intake-new":  employerIntakeNew,
    // Inbox = aggregate of the per-queue counts above (the page itself
    // surfaces them as one inbox). Surfaced separately so the sidebar
    // can badge /admin/inbox with the rolled-up total.
    // Queues whose page is paused on this deployment (ENGAGE's credit and
    // pathway queues, deploy/paused-routes.mjs) are left out, as on the page.
    "inbox-total":
      (isPausedPath("/admin/credit-applications") ? 0 : creditApps) +
      roleChanges +
      (isPausedPath("/admin/pathway-enrollments") ? 0 : pathwayApps) +
      accessRequests,
  };
  return counts;
}
