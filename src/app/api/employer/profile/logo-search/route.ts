/**
 * POST /api/employer/profile/logo-search
 *
 * Run logo discovery on the company website and return ALL ranked
 * candidates (not just the top one). The Edit Profile modal calls
 * this when the operator clicks "Find logo from website" — instead
 * of the auto-fill endpoint's one-best behaviour, this lets the
 * operator pick from a short list.
 *
 * "Search again" / variety
 *
 *   Subsequent searches on the same site should return DIFFERENT
 *   candidates — otherwise re-running the search is useless when
 *   the homepage's top guesses aren't right. We accept an `attempt`
 *   number (0 = first call, 1+ = re-searches) and progressively
 *   crawl additional pages where brand assets typically live:
 *
 *     attempt 0  → /                        (homepage only)
 *     attempt 1  → / + /about + /about-us
 *     attempt 2  → / + /about + /press + /press-room + /newsroom
 *     attempt 3  → / + everything above + /contact + /media
 *     attempt ≥4 → all of the above + /company + /our-company
 *
 *   Each new page contributes its own discovery candidates, which
 *   get merged into the global pool (deduped by URL, keeping the
 *   highest score). We cap the final list at 6 so the picker grid
 *   stays readable.
 *
 * Body:    { website: string, attempt?: number }
 * Response:
 *   { ok: true, best: string | null, candidates: LogoCandidate[],
 *     favicon: string, pagesScanned: string[] }
 *
 * Persists nothing. Pick-and-save is the modal's job.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  fetchHomepageHtml,
  discoverLogoCandidates,
  faviconFallback,
  type LogoCandidate,
} from "@/lib/employer/logo-discovery";

export const runtime = "nodejs";

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** Paths to crawl per attempt — cumulative. */
const ATTEMPT_PATHS: string[][] = [
  ["/"],
  ["/about", "/about-us"],
  ["/press", "/press-room", "/newsroom"],
  ["/contact", "/media"],
  ["/company", "/our-company"],
];

function pagesForAttempt(attempt: number): string[] {
  const paths = new Set<string>();
  for (let i = 0; i <= attempt; i++) {
    for (const p of ATTEMPT_PATHS[i] ?? []) paths.add(p);
  }
  // If we ran out of canned paths, fall back to just the homepage.
  if (paths.size === 0) paths.add("/");
  return Array.from(paths);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  if (!session || (role !== "employer" && !["admin", "superadmin"].includes(role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    website?: string;
    attempt?: number;
  };
  const baseUrl = normalizeUrl(body.website ?? "");
  if (!baseUrl) {
    return NextResponse.json({ error: "Enter a valid company website." }, { status: 400 });
  }
  const attempt = Math.max(0, Math.min(Math.floor(body.attempt ?? 0), 10));
  const paths = pagesForAttempt(attempt);

  // Fetch all target pages in parallel and run discovery on each.
  // Failed fetches return "" → discoverLogoCandidates returns [] →
  // nothing added to the pool.
  const fetches = paths.map(async (path) => {
    try {
      const pageUrl = new URL(path, baseUrl);
      const html = await fetchHomepageHtml(pageUrl);
      const cands = html ? discoverLogoCandidates(html, pageUrl) : [];
      return { path, url: pageUrl.toString(), candidates: cands };
    } catch {
      return { path, url: baseUrl.toString(), candidates: [] };
    }
  });
  const pageResults = await Promise.all(fetches);

  // Merge all candidates, deduping by URL and keeping the max score
  // we ever saw for that URL.
  const merged = new Map<string, LogoCandidate>();
  for (const { candidates } of pageResults) {
    for (const c of candidates) {
      const existing = merged.get(c.url);
      if (!existing || c.score > existing.score) merged.set(c.url, c);
    }
  }

  const allCandidates = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const favicon = faviconFallback(baseUrl.hostname);

  // "If can't find logos, try other sources — you must find one."
  // When the website crawl yields nothing usable (private CDN, JS-only
  // app shell, hostile WAF, dead path, etc.), synthesise candidates
  // from third-party brand-asset services that derive a logo from
  // just the domain. At least one of these almost always returns a
  // displayable image for any registered domain, so the picker
  // always has options for the operator to choose from.
  //
  // Render-time fallback: each candidate `<img>` in the modal carries
  // an `onError` that hides the broken image, so the operator
  // visually picks whichever loads cleanly.
  if (allCandidates.length === 0) {
    const fallback: LogoCandidate[] = [
      {
        url: `https://logo.clearbit.com/${baseUrl.hostname}?size=400`,
        source: "Clearbit logo service · 400 px",
        score: 30,
      },
      {
        url: `https://icons.duckduckgo.com/ip3/${baseUrl.hostname}.ico`,
        source: "DuckDuckGo icon service",
        score: 25,
      },
      {
        url: `https://www.google.com/s2/favicons?domain=${baseUrl.hostname}&sz=256`,
        source: "Google favicon · 256 px",
        score: 22,
      },
      {
        url: `https://www.google.com/s2/favicons?domain=${baseUrl.hostname}&sz=128`,
        source: "Google favicon · 128 px",
        score: 20,
      },
      {
        url: new URL("/favicon.ico", baseUrl).toString(),
        source: "Direct /favicon.ico",
        score: 15,
      },
      {
        url: new URL("/apple-touch-icon.png", baseUrl).toString(),
        source: "Direct /apple-touch-icon.png",
        score: 14,
      },
    ];
    return NextResponse.json({
      ok: true,
      best: fallback[0].url,
      candidates: fallback,
      favicon,
      pagesScanned: pageResults.map((p) => p.path),
      fallbackSources: true,
    });
  }

  return NextResponse.json({
    ok: true,
    best: allCandidates[0]?.url ?? null,
    candidates: allCandidates,
    favicon,
    pagesScanned: pageResults.map((p) => p.path),
    fallbackSources: false,
  });
}
