/**
 * A time-ordered feed of things that happened, each with a way in. Rows
 * come from different tables; the caller merges and sorts them and this
 * only draws. Lifted from /admin/inbox for the same reason as QueueLane.
 *
 * Timestamps are printed on the Toronto clock — the server runs on UTC.
 */
import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";

export type ActivityRow = {
  kind: string;
  icon: React.ElementType;
  iconCls: string;
  title: string;
  subtitle?: string;
  href: string;
  at: Date;
  /** Link label; "Review" unless the row is something you open rather than judge. */
  cta?: string;
};

const when = (d: Date) =>
  new Date(d).toLocaleString("en-GB", {
    timeZone: "America/Toronto", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

export function ActivityFeed({ title, rows, meta }: { title: string; rows: ActivityRow[]; meta?: string }) {
  return (
    <section className="bg-card border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-fg inline-flex items-center gap-2">
          <Calendar size={15} className="text-brand-600" /> {title}
        </h2>
        {meta && <span className="text-[11px] text-subtle">{meta}</span>}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5">
            <span className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${r.iconCls}`}>
              <r.icon size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-subtle font-semibold">{r.kind}</p>
              <p className="text-sm text-fg truncate">{r.title}</p>
              {r.subtitle && <p className="text-xs text-muted truncate">{r.subtitle}</p>}
            </div>
            <p className="text-[11px] text-subtle shrink-0">{when(r.at)}</p>
            <Link
              href={r.href}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"
            >
              {r.cta ?? "Review"} <ArrowRight size={11} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
