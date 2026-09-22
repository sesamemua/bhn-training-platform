"use client";

/**
 * LinkedIn and biohubnet.ca at a glance, on the admin dashboard. Loads
 * after the page, refreshes every 10 minutes while the tab is visible,
 * and on Refresh. LinkedIn itself is read at most every 30 minutes.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Globe, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { LINKEDIN_FOLLOW_WIDGET, LINKEDIN_PAGE, type LinkedInSnapshot } from "@/lib/metrics/linkedin";
import type { SiteMetrics, SiteTotals } from "@/lib/metrics/ga4";

const EVERY_MS = 10 * 60_000;

/*
 * The Data Studio report of biohubnet.ca traffic (owned by
 * info@biohubnet.ca, embedding on), shown while the GA4 Data API is not
 * connected. Google decides who sees it: whoever is signed in to Google
 * with access to the report.
 */
const SITE_REPORT = "https://datastudio.google.com/reporting/5bb8b6ee-9067-4390-8638-9b28e4a45790/page/TlJ0C";
const SITE_REPORT_EMBED = "https://datastudio.google.com/embed/reporting/5bb8b6ee-9067-4390-8638-9b28e4a45790/page/TlJ0C";

interface Metrics {
  at: string;
  linkedin: LinkedInSnapshot | null;
  site: SiteMetrics;
}

export function MarketingMetrics() {
  const [data, setData] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing-metrics", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Metrics);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <article className="aero-frame">
      <div className="aero-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="aero-h"><Globe size={14} /> LinkedIn and biohubnet.ca</h3>
            <p className="aero-gloss">
              {failed
                ? "Couldn’t reach the numbers just now — they will retry."
                : data
                  ? `Updated ${new Date(data.at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })} · refreshes every 10 minutes`
                  : "Reading the numbers…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        {/* Side by side with the native numbers; stacked when the website is the embedded report, which needs the width. */}
        <div className={`grid gap-3 ${data?.site.connected ? "md:grid-cols-2" : ""}`}>
          <LinkedInPanel data={data} />
          <SitePanel site={data?.site ?? null} />
        </div>
      </div>
    </article>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line px-4 py-3">
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg no-underline hover:text-brand-700">
        {title} <ArrowUpRight size={11} />
      </a>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-[24px] font-bold leading-tight tabular-nums">{value}</p>
      {change !== undefined && change !== null && (
        <p className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {change >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {change >= 0 ? "+" : ""}{Math.round(change)}% vs week before
        </p>
      )}
    </div>
  );
}

export function LinkedInPanel({ data }: { data: Metrics | null }) {
  const li = data?.linkedin;
  const posts = li?.posts ?? null;
  const reactions = posts?.reduce((s, p) => s + p.reactions, 0) ?? 0;
  const comments = posts?.reduce((s, p) => s + p.comments, 0) ?? 0;
  const top = posts?.slice().sort((a, b) => b.reactions - a.reactions)[0];
  return (
    <Panel title="LinkedIn" href={LINKEDIN_PAGE}>
      {data && li === null ? (
        // LinkedIn turned the server away: its own Follow button still shows the count.
        <div>
          <iframe title="BioHubNet on LinkedIn" src={LINKEDIN_FOLLOW_WIDGET} className="h-[70px] w-full border-0" />
          <p className="text-[11px] text-muted">LinkedIn didn’t answer the platform this time, so this is LinkedIn’s own follower count.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Followers" value={li?.followers?.toLocaleString() ?? "—"} />
            <Stat label="Posts, 30 days" value={posts ? String(posts.length) : "—"} />
            <Stat label="Reactions" value={posts ? reactions.toLocaleString() : "—"} />
          </div>
          {posts && (
            <p className="mt-2 text-[11.5px] text-muted">
              {comments} comment{comments === 1 ? "" : "s"} on those posts.
              {top && (
                <>
                  {" "}Most liked:{" "}
                  <a href={top.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {top.text.slice(0, 60)}{top.text.length > 60 ? "…" : ""}
                  </a>{" "}
                  ({top.reactions})
                </>
              )}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

export function SitePanel({ site }: { site: SiteMetrics | null }) {
  if (site && !site.connected) {
    return (
      <Panel title="biohubnet.ca · Google Analytics" href={SITE_REPORT}>
        <iframe
          title="biohubnet.ca traffic from Google Analytics"
          src={SITE_REPORT_EMBED}
          className="block h-[480px] w-full rounded-lg border-0"
          allowFullScreen
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
        <p className="mt-1 text-[11px] text-muted">
          Google shows this to anyone signed in to Google as info@biohubnet.ca, or with an account the report is shared with.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="biohubnet.ca · last 7 days" href="https://biohubnet.ca">
      {!site ? (
        <p className="text-[12px] text-muted">Reading…</p>
      ) : site.error ? (
        <p className="text-[12px] text-rose-700">Google Analytics said: {site.error}</p>
      ) : (
        <SiteNumbers current={site.current!} previous={site.previous!} topPages={site.topPages ?? []} />
      )}
    </Panel>
  );
}

function SiteNumbers({ current, previous, topPages }: { current: SiteTotals; previous: SiteTotals; topPages: { path: string; views: number }[] }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Visitors" value={current.users.toLocaleString()} change={change(current.users, previous.users)} />
        <Stat label="Visits" value={current.sessions.toLocaleString()} change={change(current.sessions, previous.sessions)} />
        <Stat label="Page views" value={current.views.toLocaleString()} change={change(current.views, previous.views)} />
      </div>
      {topPages.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11.5px]">
          {topPages.slice(0, 3).map((p) => (
            <li key={p.path} className="flex justify-between gap-2">
              <span className="truncate text-muted">{p.path}</span>
              <span className="tabular-nums text-fg">{p.views.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
