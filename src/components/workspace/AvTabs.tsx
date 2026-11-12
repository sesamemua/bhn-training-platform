import Link from "next/link";
import { cn } from "@/lib/utils";

/** AV 2026 and AV 2025 are one sidebar tab; each year keeps its own URL. */
export function AvTabs({ active }: { active: "2026" | "2025" }) {
  return (
    <nav aria-label="AV years" className="mt-4 flex gap-1 border-b border-line">
      {([["2026", "AV 2026 · this year's quote"], ["2025", "AV 2025 · last year compared"]] as const).map(([year, label]) => (
        <Link key={year} href={`/admin/workspace/symposium-2026/av/${year}`} aria-current={active === year ? "page" : undefined}
          className={cn("border-b-2 px-4 py-2.5 text-[14px] font-semibold", active === year ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-fg")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
