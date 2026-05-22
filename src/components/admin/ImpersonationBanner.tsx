"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, X, ShieldCheck } from "lucide-react";

interface Props {
  actingAs: string;
}

/**
 * Floating "view-as" pill — shown only when a superadmin is acting as
 * a less-privileged role. Previously this rendered as a full-width
 * striped banner at the top of every page (eats vertical space, hides
 * the editorial hero). Reworked as a fixed bottom-right pill that
 * stays unmissable (amber + soft pulse) but doesn't compete with the
 * page content.
 *
 * Layout notes:
 *   • `fixed bottom-4 right-4` lives outside any column.
 *   • `z-40` matches the PageTranslator dock (top-right at the same
 *     z-index) — both stay above page content but below modals at z-50.
 *   • The pulse ring is a pure CSS animation; the icon stays static
 *     so the moving target isn't the click target.
 *   • Collapses on small viewports — the descriptive text drops to a
 *     tooltip and only the icon + "Stop" remain, so the pill never
 *     wraps off-screen.
 */
export function ImpersonationBanner({ actingAs }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      await fetch("/api/admin/act-as", { method: "DELETE" });
      router.refresh();
      // Force a fresh hard-nav to /admin so server-rendered gates
      // re-evaluate against the restored real-role session.
      setTimeout(() => router.push("/admin"), 50);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed bottom-3 right-3 z-40 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label={`Viewing as ${actingAs}. Admin permissions are paused while in this mode.`}
    >
      <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-800/60 shadow-banner-amber pl-1 pr-0.5 py-0.5">
        {/* Pulsing eye disc, compact. */}
        <span className="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-900 shrink-0">
          <Eye size={11} />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-amber-400 animate-ping opacity-60 pointer-events-none"
          />
        </span>

        {/* "as trainee" — lowercase tag, no VIEW-AS chip needed
            (the eye + the espresso Stop button already telegraph the
            mode). Hidden on the tightest viewports. */}
        <span className="hidden sm:inline text-[11px] font-semibold leading-none lowercase">
          as {actingAs}
        </span>

        {/* CTA — single Stop pill. The eye + amber colour already say
            "view-as"; the button just has to offer the exit. */}
        <button
          onClick={stop}
          disabled={busy}
          title="Stop viewing as · Restore superadmin"
          className="inline-flex items-center gap-1 shrink-0 bg-amber-900 hover:bg-amber-800 text-amber-50 font-bold text-[11px] px-2.5 py-1 rounded-full border border-amber-950/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <ShieldCheck size={10} />
          Stop
        </button>
      </div>
    </div>
  );
}
