"use client";

/**
 * Tabs inside one video project: Scripts, Production cost, Call sheets, Filming day, Prep day, Print job, Logistics.
 * Same underline idiom as MerchNav, directly under the PageHero. Rendered
 * by ProjectNav, which works out where Scripts should land.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Backpack, CalendarClock, ClipboardList, FileText, ListTodo, Printer, Receipt } from "lucide-react";
import { callSheetsPath, filmingPath, logisticsPath, prepPath, printoutPath, productionCostPath } from "@/lib/video/paths";

export function ProjectNavTabs({ projectId, scriptsHref }: { projectId: string; scriptsHref: string }) {
  const pathname = usePathname();
  const calls = callSheetsPath(projectId);
  const cost = productionCostPath(projectId);
  const filming = filmingPath(projectId);
  const printout = printoutPath(projectId);
  const logistics = logisticsPath(projectId);
  const prep = prepPath(projectId);
  const tabs = [
    { key: "scripts", label: "Scripts", href: scriptsHref, icon: FileText, active: ![calls, cost, filming, prep, printout, logistics].some((p) => pathname.startsWith(p)) },
    { key: "cost", label: "Production cost", href: cost, icon: Receipt, active: pathname.startsWith(cost) },
    { key: "calls", label: "Call sheets", href: calls, icon: ClipboardList, active: pathname.startsWith(calls) },
    { key: "filming", label: "Filming day", href: filming, icon: CalendarClock, active: pathname.startsWith(filming) },
    { key: "prep", label: "Prep day", href: prep, icon: ListTodo, active: pathname.startsWith(prep) },
    { key: "printout", label: "Print job", href: printout, icon: Printer, active: pathname.startsWith(printout) },
    { key: "logistics", label: "Logistics", href: logistics, icon: Backpack, active: pathname.startsWith(logistics) },
  ];
  return (
    <nav aria-label="Project" className="flex w-fit max-w-full flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
            t.active ? "border-brand-400 text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          <t.icon size={13} aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
