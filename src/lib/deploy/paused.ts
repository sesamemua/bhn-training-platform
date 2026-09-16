/**
 * Which links lead into a paused pillar on THIS deployment.
 *
 * ENGAGE and EXPERIENCE are left out of the production build (see
 * deploy/paused-routes.mjs). next.config.ts inlines the paused prefixes
 * into the app at build time, and only on that build:
 *
 *   NEXT_PUBLIC_PAUSED_PREFIXES      page prefixes, plus exact paused
 *                                    paths and `!` exceptions
 *   NEXT_PUBLIC_PAUSED_API_PREFIXES  API prefixes (they 404 there)
 *
 * Everywhere else both are empty, so every function here returns
 * "not paused" and the UI is exactly what it was — local dev, the
 * bhn-demo project, tests that don't set them.
 *
 * Safe in client and server components: no imports, and the env values
 * are plain strings. Pure, so tests can exercise it (tests/unit).
 *
 * Matching is by whole path segment: "/admin/experience" pauses
 * "/admin/experience/employer-intake" but not "/admin/experience-metrics".
 * A `*` segment matches any one segment. An entry starting with `!` is a
 * live path that a wildcard would otherwise catch.
 */

export interface PausedPathList {
  include: string[];
  except: string[];
}

function splitSegments(p: string): string[] {
  return p.split("/").filter(Boolean);
}

/** Parse the comma-separated env format. */
export function parsePausedList(...raws: (string | undefined)[]): PausedPathList {
  const include: string[] = [];
  const except: string[] = [];
  for (const raw of raws) {
    for (const part of (raw ?? "").split(",")) {
      const entry = part.trim();
      if (!entry) continue;
      if (entry.startsWith("!")) {
        const p = entry.slice(1).trim();
        if (p.startsWith("/")) except.push(p);
      } else if (entry.startsWith("/") && splitSegments(entry).length > 0) {
        include.push(entry);
      }
    }
  }
  return { include, except };
}

let cache: { key: string; list: PausedPathList } | null = null;

/**
 * The list for this deployment. Read through a function (not a module
 * constant) so the build-time values Next inlines are picked up, and so
 * tests can change process.env between cases.
 */
export function currentPausedList(): PausedPathList {
  const pages = process.env.NEXT_PUBLIC_PAUSED_PREFIXES ?? "";
  const apis = process.env.NEXT_PUBLIC_PAUSED_API_PREFIXES ?? "";
  const key = `${pages}\n${apis}`;
  if (!cache || cache.key !== key) cache = { key, list: parsePausedList(pages, apis) };
  return cache.list;
}

/** True when this deployment pauses anything at all. */
export function pausedPillarsActive(): boolean {
  return currentPausedList().include.length > 0;
}

/**
 * The root-relative path of an internal href, without query or hash.
 * Absolute URLs, protocol-relative URLs and anything else return null:
 * they are not links into this app's routes as far as we can tell.
 */
function internalPath(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

/** Does `path` sit at or under `prefix`, segment by segment? */
export function pathHasPrefix(path: string, prefix: string): boolean {
  const p = splitSegments(path);
  const pre = splitSegments(prefix);
  if (pre.length === 0 || pre.length > p.length) return false;
  return pre.every((seg, i) => seg === "*" || seg.toLowerCase() === p[i].toLowerCase());
}

/** Pure form of isPausedPath, for tests and callers with their own list. */
export function isPausedPathIn(href: string | null | undefined, list: PausedPathList): boolean {
  if (!href || list.include.length === 0) return false;
  const path = internalPath(href);
  if (!path) return false;
  if (!list.include.some((pre) => pathHasPrefix(path, pre))) return false;
  return !list.except.some((pre) => pathHasPrefix(path, pre));
}

/**
 * Is this href (page or /api path) paused on this deployment? Always
 * false where nothing is paused.
 */
export function isPausedPath(href: string | null | undefined): boolean {
  return isPausedPathIn(href, currentPausedList());
}

/** Drop items whose `href` is paused. Returns the same array when nothing is paused. */
export function withoutPaused<T extends { href?: string | null }>(items: T[]): T[] {
  if (!pausedPillarsActive()) return items;
  return items.filter((item) => !isPausedPath(item.href));
}

interface PausableStep {
  path?: string;
  cta?: { href: string };
  body?: string;
  /** Describes a paused-pillar feature: dropped while paused. */
  pausedPillar?: boolean;
  /** Only meaningful while paused (the note explaining the pause). */
  onlyWhenPaused?: boolean;
  /** Replaces `body` while paused. */
  bodyWhenPaused?: string;
}

/**
 * The onboarding-tour steps for this deployment.
 *
 * Where something is paused: drops steps that live on a paused page, whose
 * button goes to one, or that are flagged `pausedPillar`, and swaps in
 * `bodyWhenPaused`. Where nothing is paused: drops only `onlyWhenPaused`
 * steps, and returns the same array when there are none.
 */
export function withoutPausedSteps<T extends PausableStep>(steps: T[]): T[] {
  if (!pausedPillarsActive()) {
    return steps.some((s) => s.onlyWhenPaused) ? steps.filter((s) => !s.onlyWhenPaused) : steps;
  }
  return steps
    .filter((s) => !s.pausedPillar && !isPausedPath(s.path) && !isPausedPath(s.cta?.href))
    .map((s) => (s.bodyWhenPaused ? { ...s, body: s.bodyWhenPaused } : s));
}
