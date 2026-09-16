"use client";

/**
 * Tabs for Workspace → Merch: the giveaway board and the BHN Merch Store.
 * Same underline idiom as NewsletterNav, and it sits directly under the
 * PageHero on both pages — never above it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Store } from "lucide-react";

const BASE = "/admin/workspace/merch";

const TABS = [
  { key: "board", label: "Giveaway board", href: BASE, icon: Gift },
  { key: "store", label: "BHN Merch Store", href: `${BASE}/store`, icon: Store },
] as const;

export function MerchNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Merch" className="flex w-fit max-w-full flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
      {TABS.map((t) => {
        // The board owns the bare path only, or it would light up on /store too.
        const active = t.href === BASE ? pathname === BASE : pathname.startsWith(t.href);
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
