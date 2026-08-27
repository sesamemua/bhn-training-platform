"use client";

/**
 * Sub-navigation for the newsletter workspace — Compose, Calendar,
 * Review. Same segmented-pill idiom as OutreachNav so the two workspace
 * modules read as one system.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, MessageSquareText, PenLine } from "lucide-react";

const BASE = "/admin/workspace/marketing/newsletter";

const TABS = [
  { key: "compose", label: "Compose", href: BASE, icon: PenLine },
  { key: "calendar", label: "Calendar", href: `${BASE}/calendar`, icon: CalendarDays },
  { key: "review", label: "Review", href: `${BASE}/review`, icon: MessageSquareText },
] as const;

export function NewsletterNav() {
  const pathname = usePathname();
  return (
    <nav className="flex w-fit items-center gap-6 border-b border-line">
      {TABS.map((t) => {
        // Compose owns the bare base path only — otherwise it would light
        // up on every child route.
        const active = t.href === BASE ? pathname === BASE : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
              active
                ? "border-brand-400 text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            <Icon size={13} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
