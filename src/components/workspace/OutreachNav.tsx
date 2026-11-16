"use client";

/**
 * In-page sub-nav for the Outreach CRM — dashboard, contacts, companies,
 * deals, tasks, sequences, campaigns and tracked links. Sits below the
 * PageHero on every page so they read as one tool.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookUser, Building2, CheckSquare, Gauge, HandCoins, Link2, ListOrdered, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "dashboard", label: "Dashboard", href: "/admin/workspace/outreach/dashboard", icon: Gauge },
  { key: "contacts", label: "Contacts", href: "/admin/workspace/outreach/contacts", icon: BookUser },
  { key: "companies", label: "Companies", href: "/admin/workspace/outreach/companies", icon: Building2 },
  { key: "deals", label: "Deals", href: "/admin/workspace/outreach/deals", icon: HandCoins },
  { key: "tasks", label: "Tasks", href: "/admin/workspace/outreach/tasks", icon: CheckSquare },
  { key: "sequences", label: "Sequences", href: "/admin/workspace/outreach/sequences", icon: ListOrdered },
  { key: "campaigns", label: "Campaigns", href: "/admin/workspace/outreach/campaigns", icon: Megaphone },
  { key: "links", label: "Tracked links", href: "/admin/workspace/outreach/links", icon: Link2 },
] as const;

export function OutreachNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Outreach CRM" className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg bg-elevated/60 p-1">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors",
              active ? "bg-card-solid text-fg shadow-card-rest" : "text-muted hover:text-fg",
            )}
          >
            <Icon size={13} /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
