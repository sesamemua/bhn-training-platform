"use client";

/**
 * Tabs inside one video project: By person, Scripts, Production cost, Call sheets, Before the shoot, Filming day, Prep day, Print job, Logistics, Sign-ups, Messages.
 * Same underline idiom as MerchNav, directly under the PageHero. Rendered
 * by ProjectNav, which works out where Scripts should land.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Backpack, CalendarClock, Mail, UserPlus, Users, ClipboardCheck, ClipboardList, FileText, ListTodo, Printer, Receipt } from "lucide-react";
import { beforePath, callSheetsPath, filmingPath, logisticsPath, messagesPath, peoplePath, prepPath, printoutPath, productionCostPath, signupsPath } from "@/lib/video/paths";

export function ProjectNavTabs({ projectId, scriptsHref }: { projectId: string; scriptsHref: string }) {
  const pathname = usePathname();
  const calls = callSheetsPath(projectId);
  const cost = productionCostPath(projectId);
  const filming = filmingPath(projectId);
  const printout = printoutPath(projectId);
  const logistics = logisticsPath(projectId);
  const prep = prepPath(projectId);
  const before = beforePath(projectId);
  const people = peoplePath(projectId);
  const signups = signupsPath(projectId);
  const messages = messagesPath(projectId);
  const tabs = [
    { key: "people", label: "By person", href: people, icon: Users, active: pathname.startsWith(people) },
    { key: "scripts", label: "Scripts", href: scriptsHref, icon: FileText, active: ![people, calls, cost, before, filming, prep, printout, logistics, signups, messages].some((p) => pathname.startsWith(p)) },
    { key: "cost", label: "Production cost", href: cost, icon: Receipt, active: pathname.startsWith(cost) },
    { key: "calls", label: "Call sheets", href: calls, icon: ClipboardList, active: pathname.startsWith(calls) },
    { key: "before", label: "Before the shoot", href: before, icon: ClipboardCheck, active: pathname.startsWith(before) },
    { key: "filming", label: "Filming day", href: filming, icon: CalendarClock, active: pathname.startsWith(filming) },
    { key: "prep", label: "Prep day", href: prep, icon: ListTodo, active: pathname.startsWith(prep) },
    { key: "printout", label: "Print job", href: printout, icon: Printer, active: pathname.startsWith(printout) },
    { key: "logistics", label: "Logistics", href: logistics, icon: Backpack, active: pathname.startsWith(logistics) },
    { key: "signups", label: "Sign-ups", href: signups, icon: UserPlus, active: pathname.startsWith(signups) },
    { key: "messages", label: "Messages", href: messages, icon: Mail, active: pathname.startsWith(messages) },
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
