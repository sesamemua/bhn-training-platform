"use client";

/**
 * Tabs for Workspace → Video Production: projects, call sheets and the
 * production-cost sheet. Same underline idiom as MerchNav, directly under
 * the PageHero.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Clapperboard, Receipt } from "lucide-react";

const BASE = "/admin/workspace/marketing/video";
const COST = `${BASE}/production-cost`;
const CALLS = `${BASE}/call-sheets`;

const TABS = [
  { key: "projects", label: "Projects", href: BASE, icon: Clapperboard },
  { key: "calls", label: "Call sheets", href: CALLS, icon: ClipboardList },
  { key: "cost", label: "Production cost", href: COST, icon: Receipt },
] as const;

export function VideoNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Video production" className="flex w-fit max-w-full flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
      {TABS.map((t) => {
        // Projects owns everything else under Video, project pages included.
        const active = t.href === BASE
          ? !pathname.startsWith(COST) && !pathname.startsWith(CALLS)
          : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
              active ? "border-brand-400 text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            <Icon size={13} aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
