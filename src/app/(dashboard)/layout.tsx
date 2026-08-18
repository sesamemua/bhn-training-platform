import { redirect } from "next/navigation";
import { getSession, ROLE_RANK } from "@/lib/auth";
import { Sidebar } from "@/components/lms/Sidebar";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { TranslatorDock } from "@/components/translation/TranslatorDock";
import { KeyboardShortcuts } from "@/components/system/KeyboardShortcuts";
import { RoleSwitchOverlay } from "@/components/system/RoleSwitchOverlay";
import { NavHighlightOverlay } from "@/components/guide/NavHighlightOverlay";
import { DemoOverlay } from "@/components/demo/DemoOverlay";
import { AssistTracker } from "@/components/assist/AssistTracker";
import { AssistHintDock } from "@/components/assist/AssistHintDock";
import { ASSIST_ENABLED } from "@/lib/assist/flags";
import { prisma } from "@/lib/prisma";
import { getAdminQueueCounts, type QueueCounts } from "@/lib/admin/queue-counts";
import { getTraineeQueueCounts } from "@/lib/trainee/queue-counts";
import { getEmployerQueueCounts } from "@/lib/employer/queue-counts";
import { getCommitteesForUser } from "@/lib/committees/membership";
import {
  LayoutBannerProvider,
  type LayoutBannerData,
} from "@/components/layout/LayoutBanners";
import { resolveSidebarHiddenSet, parsePrefs } from "@/lib/preferences/active";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string }).role ?? "trainee";
  const realRole = (session.user as { realRole?: string }).realRole;
  const actingAs = (session.user as { actingAs?: string }).actingAs;
  const userId = (session.user as { id?: string }).id;
  // Single user fetch — used by both the Sidebar (credits,
  // allowPlatformContent) and the LayoutBannerProvider (banner
  // state: accountKind, demoExpiresAt, email, emailVerified).
  const userRow = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          credits: true,
          allowPlatformContent: true,
          accountKind: true,
          demoExpiresAt: true,
          email: true,
          emailVerified: true,
          // Per-user sidebar prefs (see src/lib/preferences/registry.ts).
          // Null until the user makes their first toggle on
          // /profile/preferences. Resolved into a Set<string> below.
          featurePrefs: true,
        },
      })
    : null;

  // Compute banner state for the LayoutBannerProvider.
  // "Verify your email" only shows for real accounts — demo / sandbox
  // accounts deliberately bypass email verification.
  const showUnverifiedBanner =
    !!userRow &&
    !userRow.emailVerified &&
    (userRow.accountKind === "real" || userRow.accountKind == null);
  const bannerData: LayoutBannerData = {
    actingAs: actingAs ?? null,
    isDemo: userRow?.accountKind === "demo",
    demoExpiresAt: userRow?.demoExpiresAt?.toISOString() ?? null,
    showUnverifiedBanner,
    email: userRow?.email ?? null,
  };

  // Queue badges — two layers stitched into one map:
  //   • Admin badges (credit apps, role requests, pathway enrolments,
  //     theme proposals, inbox) — only for admin/superadmin.
  //   • Trainee badges (interview requests, offer requests, buddy
  //     invites) — for every signed-in user, since they're per-user
  //     "someone's waiting on you" counts.
  //
  // Using the same Record<string, number> shape means the Sidebar
  // doesn't need to know which set it received; it just looks up by
  // badgeKey. The two key namespaces ("interview-requests" vs.
  // "credit-applications") never collide.
  const canSeeAdminQueues = ROLE_RANK[realRole ?? role] >= ROLE_RANK.admin;
  const isEmployer = (realRole ?? role) === "employer";
  const [adminCounts, traineeCounts, employerCounts, committeeSlugs, translationSetting, unreadCount] = await Promise.all([
    canSeeAdminQueues ? getAdminQueueCounts() : Promise.resolve(undefined),
    userId ? getTraineeQueueCounts(userId) : Promise.resolve(undefined),
    // Employer join-request badge — only fetched for employer accounts
    // (and admins acting as employer) to avoid an unnecessary DB query
    // on every trainee page load.
    (isEmployer || canSeeAdminQueues) && userId
      ? getEmployerQueueCounts(userId)
      : Promise.resolve(undefined),
    userId ? getCommitteesForUser(userId) : Promise.resolve([]),
    prisma.platformSetting.findUnique({ where: { key: "translationEnabled" }, select: { value: true } }).catch(() => null),
    // Notification unread count — only for signed-in users. Shown as a
    // badge on the bell icon in the sidebar header.
    userId
      ? prisma.notification.count({ where: { userId, readAt: null } }).catch(() => 0)
      : Promise.resolve(0),
  ]);
  // Platform-level gate: absent row (never set) → enabled (default true).
  const translationPlatformEnabled = translationSetting?.value !== "false";
  const queueCounts: QueueCounts | undefined =
    adminCounts || traineeCounts || employerCounts
      ? { ...traineeCounts, ...adminCounts, ...employerCounts }
      : undefined;

  return (
    <div className="dashboard-layout flex h-screen bg-page">
      <Sidebar
        role={role}
        realRole={realRole}
        actingAs={actingAs ?? null}
        user={session.user ?? {}}
        credits={userRow?.credits ?? undefined}
        allowPlatformContent={userRow?.allowPlatformContent ?? false}
        queueCounts={queueCounts}
        committees={committeeSlugs}
        hiddenFeatures={resolveSidebarHiddenSet(
          // realRole is the user's true role even when they're acting
          // as another. Staff (admin + superadmin) always see every
          // sidebar item their role allows — see active.ts for the
          // rationale and the centralised rule.
          realRole ?? role,
          parsePrefs(userRow?.featurePrefs),
        )}
        initialUnreadCount={unreadCount}
      />
      <main className="flex-1 overflow-y-auto relative">
        {/* Platform rule: the editorial hero (DSPageHeader) is the
            absolute top of every page. Layout-level banners
            (impersonation, demo expiry, unverified email, AutoPipette
            first-run) used to render here ABOVE {children}; they now
            render IMMEDIATELY AFTER the hero via the
            <LayoutBannersSlot /> inside DSPageHeader, fed by
            <LayoutBannerProvider> wrapping the page content below. */}
        <LayoutBannerProvider data={bannerData}>
          <div className="dashboard-container max-w-screen-2xl mx-auto px-6 py-8 pt-16">
            {children}
            {/* Portal target for <DemoSeedAndClearTray />. The tray
                component uses createPortal to render itself here no
                matter where in the page's JSX it's mounted — that
                makes it STRUCTURALLY IMPOSSIBLE for a page to render
                the seeder above its hero (project rule:
                feedback_bhn_hero_top_rule.md). Multiple trays on the
                same page stack vertically.

                If a page wants the seeder to appear elsewhere, it
                still can: the portal only fires once this element is
                in the DOM, so pages outside (dashboard) (e.g. public
                /showcase/...) get a no-op tray. */}
            <div
              id="bhn-demo-tray-slot"
              data-bhn-demo-slot
              className="mt-8 space-y-3 empty:hidden"
            />
          </div>
        </LayoutBannerProvider>
      </main>
      {/* Floating page-translator dock — fixed to viewport so it stays
          clickable above all page content (modals at z-50 still win).
          Hides entirely when the user toggles "Page translation" off
          from the ThemePicker dropdown. */}
      <TranslatorDock platformEnabled={translationPlatformEnabled} />
      <Onboarding />
      <KeyboardShortcuts realRole={realRole} actingAs={actingAs ?? null} />
      <RoleSwitchOverlay />
      <NavHighlightOverlay />
      {/* Demo tour overlay — spotlight curtain, animated cursor, tooltip
          card, and persistent demo bar. Renders only when a tour is
          active (useDemoTour().stage !== "idle"). Portal-mounted onto
          document.body to escape any stacking context. */}
      <DemoOverlay />
      {/* AutoPipette (AI behaviour-watcher) — telemetry + hint chip.
          Both are no-ops for users who have opted out via the /profile
          toggle or the first-run notice. The whole subsystem is gated
          behind the master kill-switch (NEXT_PUBLIC_ASSIST_ENABLED). */}
      {ASSIST_ENABLED && (
        <>
          <AssistTracker />
          <AssistHintDock />
        </>
      )}
    </div>
  );
}
