import Link from "next/link";
import { ArrowRight, MousePointerClick } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDuration, summarizePageUsage, type PageUsageRow } from "@/lib/page-usage";

const DAYS = 30;

/**
 * "Your most-used pages" — the signed-in user's own top pages over the last
 * 30 days, ranked by visits with visible-tab time alongside. Built only from
 * events the user consented to (see `track()`), so it is empty until then.
 */
export async function PageUsageCard({ userId }: { userId: string }) {
  const rows = await prisma.$queryRaw<{ path: string; visits: number; ms: bigint; last: Date }[]>`
    SELECT props->>'path' AS path,
      COUNT(*) FILTER (WHERE name = 'page_view')::int AS visits,
      COALESCE(SUM(CASE WHEN name = 'page_time' AND props->>'ms' ~ '^[0-9]{1,9}$'
        THEN (props->>'ms')::bigint END), 0)::bigint AS ms,
      MAX("createdAt") AS last
    FROM "Event"
    WHERE "userId" = ${userId} AND name IN ('page_view', 'page_time')
      AND "createdAt" > now() - make_interval(days => ${DAYS}::int)
      AND props->>'path' IS NOT NULL
    GROUP BY 1`.catch((e) => { console.error("page usage:", (e as Error).message); return []; });
  const usage = summarizePageUsage(rows.map((r): PageUsageRow => ({ ...r, ms: Number(r.ms) })));
  const maxMs = Math.max(1, ...usage.pages.map((p) => p.ms));

  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div className="inline-flex items-center gap-2">
          <MousePointerClick size={14} className="text-brand-600" />
          <p className="text-[10px] uppercase tracking-[0.22em] font-black text-brand-700">Your most-used pages</p>
        </div>
        <span className="text-[10px] text-fg-subtle">Last {DAYS} days · only you see this</span>
      </header>

      {usage.pages.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Nothing yet. Pages you open will show up here, with how long you spent on each.
          Stats are collected only if you allowed analytics cookies.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 mb-4">
            {[
              ["Time on platform", formatDuration(usage.totalMs)],
              ["Page visits", usage.totalVisits.toLocaleString()],
              ["Different pages", usage.distinctPages.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{k}</dt>
                <dd className="font-mono tabular-nums font-bold text-fg text-base">{v}</dd>
              </div>
            ))}
          </dl>
          <ol className="divide-y divide-line border-y border-line">
            {usage.pages.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="flex items-center gap-3 py-2 text-sm hover:bg-brand-50/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">{p.label}</span>
                    <span className="block truncate text-[11px] text-fg-subtle font-mono">{p.path}</span>
                  </span>
                  <span className="hidden sm:block w-24 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden>
                    <span className="block h-full bg-brand-500" style={{ width: `${(p.ms / maxMs) * 100}%` }} />
                  </span>
                  <span className="w-16 text-right font-mono tabular-nums text-xs text-fg">{formatDuration(p.ms)}</span>
                  <span className="w-14 text-right font-mono tabular-nums text-xs text-fg-muted">
                    {p.visits} {p.visits === 1 ? "visit" : "visits"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {usage.resume && (
            <Link href={usage.resume.path} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
              Pick up where you left off: {usage.resume.label} <ArrowRight size={12} />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
