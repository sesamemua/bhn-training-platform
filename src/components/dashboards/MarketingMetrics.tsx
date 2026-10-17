"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Megaphone, RefreshCw } from "lucide-react";
import type { SocialBrief, SocialBriefItem } from "@/lib/social/dashboard";

const SOCIAL = "/admin/workspace/marketing/social";
const SITE_REPORT = "https://datastudio.google.com/reporting/5bb8b6ee-9067-4390-8638-9b28e4a45790/page/TlJ0C";
const time = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));

function BriefPosts({ posts, empty }: { posts: SocialBriefItem[]; empty: string }) {
  return posts.length ? <ul className="mt-2 space-y-2">
    {posts.map(post => <li key={post.id} className="min-w-0">
      <a href={post.url} {...(post.url.startsWith("https:") ? { target: "_blank", rel: "noreferrer" } : {})}
        className="block truncate text-[12px] font-semibold text-fg hover:underline" title={post.title}>{post.title}</a>
      <p className="text-[10.5px] leading-snug text-muted"><time dateTime={post.at}>{time(post.at)}</time> · {post.note}</p>
    </li>)}
  </ul> : <p className="mt-2 text-[11px] text-muted">{empty}</p>;
}

export function SocialDashboardSummary({ data }: { data: SocialBrief | null }) {
  const recent = data?.recent;
  return <div className="mt-3 grid gap-4 md:grid-cols-3">
    <section className="min-w-0" aria-label="Social posts in the last 48 hours">
      <h4 className="text-[11px] font-semibold text-muted">Last 48 hours</h4>
      <p className="mt-1 text-[12px] text-fg"><strong className="text-[22px] tabular-nums">{recent?.count ?? "—"}</strong> posted
        <span className="ml-2 text-[11px] text-muted">{recent?.reactions ?? "—"} reactions · {recent?.comments ?? "—"} comments</span></p>
      <BriefPosts posts={recent?.posts ?? []} empty={!data ? "Reading posts…" : recent?.count === null ? "Recent posts unavailable." : "No recent posts."} />
      {recent && <p className="mt-1 text-[10px] text-muted">{recent.source}{recent.reactions === null ? " · Engagement unavailable" : " · Public engagement"}</p>}
    </section>
    <section className="min-w-0" aria-label="Scheduled social posts">
      <h4 className="text-[11px] font-semibold text-muted">Scheduled next</h4>
      <p className="mt-1 text-[12px] text-fg"><strong className="text-[22px] tabular-nums">{data?.scheduled.count ?? "—"}</strong> scheduled</p>
      <BriefPosts posts={data?.scheduled.posts ?? []} empty={!data ? "Reading schedule…" : data.scheduled.count === null ? "Queue unavailable." : "Nothing scheduled."} />
    </section>
    <section className="min-w-0" aria-label="Next social posts needing action">
      <h4 className="text-[11px] font-semibold text-muted">Post next</h4>
      <p className="mt-1 text-[12px] text-fg"><strong className="text-[22px] tabular-nums text-amber-700 dark:text-amber-300">{data?.next.due ?? "—"}</strong> due / needs checking</p>
      <BriefPosts posts={data?.next.posts ?? []} empty={!data ? "Reading queue…" : data.next.due === null ? "Queue unavailable." : "Nothing pending."} />
    </section>
  </div>;
}

export function MarketingMetrics() {
  const [data, setData] = useState<{ at: string; social: SocialBrief } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing-metrics", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json()); setFailed(false);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10 * 60_000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  return <article className="aero-frame"><div className="aero-card">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="aero-h"><Megaphone size={14} aria-hidden="true" /> Social pulse</h3>
        <p role="status" className="text-[10.5px] text-muted">{failed ? "Update unavailable. Retrying automatically." : data ? `Updated ${time(data.at)} ET` : "Reading social activity…"}</p>
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        <a href={SOCIAL} className="font-semibold text-fg hover:underline">Social queue</a>
        <button type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh social activity" title="Refresh social activity"
          className="grid h-7 w-7 place-items-center rounded-md text-fg hover:bg-elevated disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /></button>
      </div>
    </div>
    <SocialDashboardSummary data={data?.social ?? null} />
    <p className="mt-2 flex justify-end text-[10.5px]"><a href={SITE_REPORT} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-fg">Website analytics <ArrowUpRight size={11} aria-hidden="true" /></a></p>
  </div></article>;
}
