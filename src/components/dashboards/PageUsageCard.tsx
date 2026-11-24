import Link from "next/link";
import { cache } from "react";
import { MousePointerClick } from "lucide-react";
import { Prisma } from "@prisma/client";
import { ShortcutsEditor } from "./ShortcutsEditor";
import { prisma } from "@/lib/prisma";
import { EMPTY_SHORTCUTS, ShortcutPrefsSchema, formatDuration, summarizePageUsage, type PageUsage, type PageUsageRow } from "@/lib/page-usage";

const DAYS = 30;

/** The user's per-path visits and visible-tab time. Cached per request so
 *  the shortcut bar and this card share one query. */
export const loadPageUsage = cache(async (userId: string): Promise<PageUsageRow[]> => {
  const rows = await prisma.$queryRaw<{ path: string; visits: number; ms: bigint; last: Date }[]>`
    SELECT props->>'path' AS path,
      COUNT(*) FILTER (WHERE name IN ('page_view', 'shortcut_visit'))::int AS visits,
      COALESCE(SUM(CASE WHEN name IN ('page_time', 'shortcut_time') AND props->>'ms' ~ '^[0-9]{1,9}$'
        THEN (props->>'ms')::bigint END), 0)::bigint AS ms,
      MAX("createdAt") AS last
    FROM "Event"
    WHERE "userId" = ${userId} AND name IN ('page_view', 'page_time', 'shortcut_visit', 'shortcut_time')
      AND "createdAt" > now() - make_interval(days => ${DAYS}::int)
      AND props->>'path' IS NOT NULL
    GROUP BY 1`.catch((e) => { console.error("page usage:", (e as Error).message); return []; });
  return rows.map((r) => ({ ...r, ms: Number(r.ms) }));
});

/** Staff roles counted as "the team" in the most-used pages panel. */
const TEAM_ROLES = ["instructor", "admin", "superadmin"];

/** Every staff member's page usage added together (no per-person rows), with how many people opened each page. */
export const loadTeamUsage = cache(async (): Promise<{ rows: PageUsageRow[]; people: number }> => {
  const [rows, people] = await Promise.all([
    prisma.$queryRaw<{ path: string; visits: number; ms: bigint; last: Date; people: number }[]>`
      SELECT e.props->>'path' AS path,
        COUNT(*) FILTER (WHERE e.name IN ('page_view', 'shortcut_visit'))::int AS visits,
        COALESCE(SUM(CASE WHEN e.name IN ('page_time', 'shortcut_time') AND e.props->>'ms' ~ '^[0-9]{1,9}$'
          THEN (e.props->>'ms')::bigint END), 0)::bigint AS ms,
        MAX(e."createdAt") AS last,
        COUNT(DISTINCT e."userId")::int AS people
      FROM "Event" e JOIN "User" u ON u.id = e."userId"
      WHERE u.role IN (${Prisma.join(TEAM_ROLES)}) AND e.name IN ('page_view', 'page_time', 'shortcut_visit', 'shortcut_time')
        AND e."createdAt" > now() - make_interval(days => ${DAYS}::int)
        AND e.props->>'path' IS NOT NULL
      GROUP BY 1`,
    prisma.$queryRaw<{ people: number }[]>`
      SELECT COUNT(DISTINCT e."userId")::int AS people
      FROM "Event" e JOIN "User" u ON u.id = e."userId"
      WHERE u.role IN (${Prisma.join(TEAM_ROLES)}) AND e.name IN ('page_view', 'page_time')
        AND e."createdAt" > now() - make_interval(days => ${DAYS}::int)`,
  ]).catch((e) => { console.error("team page usage:", (e as Error).message); return [[], [{ people: 0 }]] as const; });
  return { rows: rows.map((r) => ({ ...r, ms: Number(r.ms) })), people: people[0]?.people ?? 0 };
});

/**
 * Personal shortcuts under the dashboard hero: the page the user last opened,
 * then their kept shortcuts and the pages they open most.
 */
export async function ShortcutBar({ userId }: { userId: string }) {
  const [rows, saved] = await Promise.all([
    loadPageUsage(userId),
    prisma.platformSetting.findUnique({ where: { key: `dashboard.shortcuts.v1.${userId}` } }).catch(() => null),
  ]);
  let prefs = EMPTY_SHORTCUTS;
  try { if (saved) prefs = ShortcutPrefsSchema.parse(JSON.parse(saved.value)); } catch { /* bad row: start fresh */ }
  const usage = summarizePageUsage(rows, 40);
  const candidates = usage.pages.map(({ path, label, visits }) => ({ path, label, visits }));
  const last = usage.resume && { ...usage.resume, label: prefs.pinned.find((p) => p.path === usage.resume!.path)?.label ?? usage.resume.label };
  return <ShortcutsEditor candidates={candidates} initialPrefs={prefs} lastOpened={last} />;
}

/**
 * "Most-used pages" — the signed-in user's own top pages over the last 30
 * days and, for staff (`team`), the whole team's totals beside them. Ranked
 * by visits with visible-tab time alongside (see `trackUsage()`).
 */
export async function PageUsageCard({ userId, team = false }: { userId: string; team?: boolean }) {
  const [mine, everyone] = await Promise.all([loadPageUsage(userId), team ? loadTeamUsage() : null]);
  return <PageUsagePanel mine={summarizePageUsage(mine, 8)} team={everyone && { usage: summarizePageUsage(everyone.rows, 8), people: everyone.people }} />;
}

export function PageUsagePanel({ mine, team }: { mine: PageUsage; team: { usage: PageUsage; people: number } | null }) {
  return (
    <section aria-labelledby="most-used-pages" className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        {/* The global h2 rule wins over utilities on the heading itself; style the span. */}
        <h2 id="most-used-pages" className="m-0">
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-black text-brand-700">
            <MousePointerClick size={14} className="text-brand-600" aria-hidden /> Most-used pages
          </span>
        </h2>
        <span className="text-[10px] text-fg-subtle">
          Last {DAYS} days{team ? " · team figures are totals, never one person’s pages" : " · only you see this"}
        </span>
      </header>
      <div className={team ? "grid gap-6 lg:grid-cols-2" : undefined}>
        <UsageColumn title={team ? "You" : null} usage={mine} stats={[
          ["Time on platform", formatDuration(mine.totalMs)],
          ["Page visits", mine.totalVisits.toLocaleString()],
          ["Different pages", mine.distinctPages.toLocaleString()],
        ]} empty="Nothing yet. Pages you open will show up here, with how long you spent on each." />
        {team && <UsageColumn title="Whole team" usage={team.usage} stats={[
          ["Time on platform", formatDuration(team.usage.totalMs)],
          ["Page visits", team.usage.totalVisits.toLocaleString()],
          ["Active people", team.people.toLocaleString()],
        ]} empty="No team activity in the last 30 days." />}
      </div>
    </section>
  );
}

function UsageColumn({ title, usage, stats, empty }: { title: string | null; usage: PageUsage; stats: string[][]; empty: string }) {
  const maxMs = Math.max(1, ...usage.pages.map((p) => p.ms));
  return (
    <div className="min-w-0" role="group" aria-label={title ?? undefined}>
      {title && <h3 className="mb-2"><span className="text-sm font-bold text-fg">{title}</span></h3>}
      {usage.pages.length === 0 ? <p className="text-sm text-fg-muted">{empty}</p> : <>
        <dl className="grid grid-cols-3 gap-3 mb-3">
          {stats.map(([k, v]) => (
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
                <span className="hidden sm:block w-20 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden>
                  <span className="block h-full bg-brand-500" style={{ width: `${(p.ms / maxMs) * 100}%` }} />
                </span>
                <span className="w-16 text-right font-mono tabular-nums text-xs text-fg">{formatDuration(p.ms)}</span>
                <span className="w-16 text-right font-mono tabular-nums text-xs text-fg-muted">
                  {p.people !== undefined ? `${p.people} ${p.people === 1 ? "person" : "people"}` : `${p.visits} ${p.visits === 1 ? "visit" : "visits"}`}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </>}
    </div>
  );
}
