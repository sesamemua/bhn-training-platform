import { z } from "zod";

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

// ── Personal dashboard shortcuts ─────────────────────────────────────────
// Pinned shortcuts always show, in the user's order; the most-used pages
// (2+ visits) fill the row up to `limit` (as many tiles as fit the screen),
// and the next ones sit behind "See more". Removing an automatic one hides
// it for good.
export const SHORTCUT_MORE = 24;
const ShortcutPathSchema = z.string().trim().max(300).regex(/^\/(?!\/)[^\s\\]*$/, "Use a page on this platform, starting with /");
export const ShortcutPrefsSchema = z.object({
  pinned: z.array(z.object({ path: ShortcutPathSchema, label: z.string().trim().min(1).max(40) })).max(20)
    .refine((list) => new Set(list.map((p) => p.path)).size === list.length, "That page is already a shortcut."),
  hidden: z.array(z.string().max(300)).max(200),
});
export type ShortcutPrefs = z.infer<typeof ShortcutPrefsSchema>;
export type ShortcutCandidate = { path: string; label: string; visits: number };
export type Shortcut = ShortcutCandidate & { pinned: boolean };
export const EMPTY_SHORTCUTS: ShortcutPrefs = { pinned: [], hidden: [] };

export function buildShortcuts(candidates: ShortcutCandidate[], prefs: ShortcutPrefs, limit = 5) {
  const pinnedPaths = new Set(prefs.pinned.map((p) => p.path));
  const hidden = new Set(prefs.hidden);
  const visits = new Map(candidates.map((c) => [c.path, c.visits]));
  const pinned: Shortcut[] = prefs.pinned.map((p) => ({ ...p, visits: visits.get(p.path) ?? 0, pinned: true }));
  const auto: Shortcut[] = candidates
    .filter((c) => c.visits >= 2 && !pinnedPaths.has(c.path) && !hidden.has(c.path))
    .map((c) => ({ ...c, pinned: false }));
  const fill = Math.max(0, limit - pinned.length);
  return { shown: [...pinned, ...auto.slice(0, fill)], more: auto.slice(fill, fill + SHORTCUT_MORE) };
}

/** Accepts "/social", "admin/x" or a pasted full link to this site; returns a path or null. */
export function toShortcutPath(input: string, origin: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("/") || /^[a-z]+:/i.test(raw) ? raw : `/${raw}`, origin);
    if (url.origin !== origin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/** Only the page path and on-screen milliseconds survive for shortcut events. */
export function shortcutProps(raw: unknown) {
  const p = (raw && typeof raw === "object" ? raw : {}) as { path?: unknown; ms?: unknown };
  return {
    path: typeof p.path === "string" ? p.path.slice(0, 512) : null,
    ...(typeof p.ms === "number" && Number.isFinite(p.ms) ? { ms: Math.max(0, Math.round(p.ms)) } : {}),
  };
}
