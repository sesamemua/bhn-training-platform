import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/lms/Sidebar";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { DemoBanner } from "@/components/admin/DemoBanner";
import { UnverifiedEmailBanner } from "@/components/auth/UnverifiedEmailBanner";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { PageTranslator } from "@/components/translation/PageTranslator";
import { KeyboardShortcuts } from "@/components/system/KeyboardShortcuts";
import { NavHighlightOverlay } from "@/components/guide/NavHighlightOverlay";

/**
 * /events layout. Two modes:
 *
 *   • Signed in → render the full dashboard chrome (sidebar, banners,
 *     translator dock, onboarding) so it feels like every other
 *     authenticated surface. Previously the sidebar disappeared the
 *     moment a user clicked the Events nav link, which made the route
 *     feel like a dead-end and broke the "always-on" sidebar mental
 *     model.
 *
 *   • Anonymous → marketing chrome (logo header + footer) so the page
 *     can also be linked from biohubnet.ca / LinkedIn / email. No
 *     redirect — the same URL serves both audiences.
 *
 * The signed-in branch deliberately mirrors `src/app/(dashboard)/
 * layout.tsx` instead of nesting through a route group: keeping
 * /events outside `(dashboard)` preserves the anonymous-visitor case
 * (no `redirect("/login")`), and the chrome duplication is cheap
 * given how rarely it changes.
 */
export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const signedIn = session !== null;

  if (signedIn) {
    const role = (session.user as { role?: string }).role ?? "trainee";
    const realRole = (session.user as { realRole?: string }).realRole;
    const actingAs = (session.user as { actingAs?: string }).actingAs;
    const userId = (session.user as { id?: string }).id;
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
          },
        })
      : null;

    const showUnverifiedBanner =
      !!userRow &&
      !userRow.emailVerified &&
      (userRow.accountKind === "real" || userRow.accountKind == null);

    return (
      <div className="flex h-screen bg-page">
        <Sidebar
          role={role}
          realRole={realRole}
          actingAs={actingAs ?? null}
          user={session.user ?? {}}
          credits={userRow?.credits ?? undefined}
          allowPlatformContent={userRow?.allowPlatformContent ?? false}
        />
        <main className="flex-1 overflow-y-auto relative">
          {actingAs && <ImpersonationBanner actingAs={actingAs} />}
          {userRow?.accountKind === "demo" && (
            <DemoBanner kind="demo" expiresAt={userRow.demoExpiresAt?.toISOString() ?? null} />
          )}
          {showUnverifiedBanner && userRow?.email && (
            <UnverifiedEmailBanner email={userRow.email} />
          )}
          {/* Events pages bring their own hero/typography — we skip
              the (dashboard) wrapper's max-width + padding so the
              event marketing layout has the full canvas. */}
          <div className="pt-16">{children}</div>
        </main>
        <div className="fixed top-3 right-4 z-40 pointer-events-auto" data-no-translate>
          <div className="surface px-1 py-1">
            <PageTranslator />
          </div>
        </div>
        <Onboarding />
        <KeyboardShortcuts realRole={realRole} actingAs={actingAs ?? null} />
        <NavHighlightOverlay />
      </div>
    );
  }

  // Anonymous branch — marketing chrome.
  return (
    <div data-theme="light" className="min-h-screen bg-page flex flex-col">
      <header className="border-b border-line bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-bold text-fg text-sm">
              BHN <span className="text-[var(--brand-600)] font-semibold">Events</span>
            </span>
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold text-muted hover:text-fg transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-subtle">
          <p>© BioHubNet · The Biomanufacturing Hub Network</p>
          <p className="flex gap-4">
            <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
            <Link href="/" className="hover:text-fg transition-colors">BHN Training</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
