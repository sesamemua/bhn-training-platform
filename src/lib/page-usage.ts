/**
 * Per-user page usage, built from the user's own `page_view` (one per
 * navigation) and `page_time` (visible-tab milliseconds) events. Pure so
 * the dashboard card and tests share one ranking.
 */
export type PageUsageRow = { path: string; visits: number; ms: number; last: Date };
export type PageUsage = {
  pages: (PageUsageRow & { label: string })[];
  totalMs: number;
  totalVisits: number;
  distinctPages: number;
  resume: { path: string; label: string } | null;
};

// Pages that are not worth "going back to": the dashboard itself, auth and
// onboarding flows, API and print routes.
const SKIP = /^\/(dashboard|login|logout|signin|signup|register|welcome|onboarding|api|auth|paused)(\/|$)|^\/$/;
const ID_SEGMENT = /^(c[a-z0-9]{20,}|[0-9a-f-]{16,}|\d+)$/i;

export function pageLabel(path: string): string {
  const parts = path.split("/").filter(Boolean).filter((p) => p !== "admin" && p !== "workspace");
  const words = parts.filter((p) => !ID_SEGMENT.test(p));
  const name = words.at(-1) ?? "Home";
  const nice = decodeURIComponent(name).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  // `/courses/<id>` reads as "Courses · item", not as a bare id.
  return ID_SEGMENT.test(parts.at(-1) ?? "") && words.length ? `${nice} · item` : nice;
}

export function summarizePageUsage(rows: PageUsageRow[], limit = 6): PageUsage {
  const kept = rows.filter((r) => r.path.startsWith("/") && !SKIP.test(r.path) && (r.visits > 0 || r.ms > 0));
  const ranked = [...kept].sort((a, b) => b.visits - a.visits || b.ms - a.ms || b.last.getTime() - a.last.getTime());
  const latest = [...kept].sort((a, b) => b.last.getTime() - a.last.getTime())[0];
  return {
    pages: ranked.slice(0, limit).map((r) => ({ ...r, label: pageLabel(r.path) })),
    totalMs: kept.reduce((s, r) => s + r.ms, 0),
    totalVisits: kept.reduce((s, r) => s + r.visits, 0),
    distinctPages: kept.length,
    resume: latest ? { path: latest.path, label: pageLabel(latest.path) } : null,
  };
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return ms > 0 ? "<1 min" : "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
