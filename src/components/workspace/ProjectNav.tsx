"use client";

/**
 * Tabs inside one video project: Scripts, Call sheets, Production cost.
 * Same underline idiom as MerchNav, directly under the PageHero.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileText, Receipt } from "lucide-react";
import { callSheetsPath, productionCostPath, projectPath } from "@/lib/video/paths";

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const calls = callSheetsPath(projectId);
  const cost = productionCostPath(projectId);
  const tabs = [
    { key: "scripts", label: "Scripts", href: projectPath(projectId), icon: FileText, active: !pathname.startsWith(calls) && !pathname.startsWith(cost) },
    { key: "calls", label: "Call sheets", href: calls, icon: ClipboardList, active: pathname.startsWith(calls) },
    { key: "cost", label: "Production cost", href: cost, icon: Receipt, active: pathname.startsWith(cost) },
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
