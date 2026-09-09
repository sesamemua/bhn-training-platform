/**
 * One queue as a card: a count, a label, a link to the page that clears
 * it. Dims to a quiet "empty" chip at zero so a full row of lanes still
 * reads as navigation.
 *
 * Lifted from /admin/inbox so the workspace index and the inbox draw the
 * same lane — two copies of one card drift.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type LaneTone = "amber" | "emerald" | "violet" | "brand" | "rose";

const TONE: Record<LaneTone, string> = {
  amber:   "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
  violet:  "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100",
  brand:   "bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100",
  rose:    "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100",
};

export function QueueLane({
  href, icon: Icon, label, count, tone,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  count: number;
  tone: LaneTone;
}) {
  const empty = count === 0;
  return (
    <Link
      href={href}
      className={empty
        ? "rounded-xl border px-4 py-3 bg-card-solid border-line text-subtle"
        : `rounded-xl border px-4 py-3 transition-colors ${TONE[tone]}`
      }
    >
      <div className="flex items-center justify-between mb-1">
        <Icon size={15} />
        {empty ? (
          <span className="text-[10px] uppercase tracking-wider">empty</span>
        ) : (
          <ArrowRight size={11} />
        )}
      </div>
      <p className="text-2xl font-bold leading-none tabular-nums mt-1">{count}</p>
      <p className="text-[11px] uppercase tracking-wider font-semibold mt-1.5 opacity-90">{label}</p>
    </Link>
  );
}
