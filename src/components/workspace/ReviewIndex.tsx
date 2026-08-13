"use client";
/**
 * Website Review — the index of pages under review.
 *
 * Replaces a flat row of pills whose two bare numbers ("R2", "14") didn't
 * say what they counted. The number that actually matters is how many
 * items are still open in the current round, because that is exactly what
 * the export brief will contain — so that is the number the card leads on.
 *
 * Sorted so the pages needing attention surface first: open reviews with
 * outstanding items, then quiet ones, then closed.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, ExternalLink, MessageSquareText, CheckCircle2, ArrowRight, Archive, Lock,
} from "lucide-react";

export interface ReviewSummary {
  id: string;
  url: string;
  title: string;
  status: string;
  round: number;
  updatedAt: string;
  /** Open items in the CURRENT round — what an export would pick up. */
  openCount: number;
  /** Settled items in the current round (resolved or wontfix). */
  settledCount: number;
  totalComments: number;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "biohubnet.ca/engage/regulatory-affairs" — the bit worth reading. */
function prettyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return raw;
  }
}

export function ReviewIndex({
  reviews,
  activeId,
}: {
  reviews: ReviewSummary[];
  activeId: string | null;
}) {
  const [q, setQ] = useState("");

  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reviews
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.url.toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => {
        const closed = (r: ReviewSummary) => (r.status === "closed" ? 1 : 0);
        if (closed(a) !== closed(b)) return closed(a) - closed(b);
        // Anything with outstanding work sits above anything without.
        const busy = (r: ReviewSummary) => (r.openCount > 0 ? 0 : 1);
        if (busy(a) !== busy(b)) return busy(a) - busy(b);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [reviews, q]);

  const totalOpen = reviews.reduce((n, r) => n + r.openCount, 0);

  return (
    <section className="space-y-3">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-fg">Pages under review</h2>
          <p className="text-xs text-muted mt-0.5">
            {reviews.length === 0
              ? "Nothing open yet."
              : `${reviews.length} ${reviews.length === 1 ? "page" : "pages"} · ${totalOpen} open ${
                  totalOpen === 1 ? "item" : "items"
                }`}
          </p>
        </div>

        {reviews.length > 5 && (
          <label className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by page or URL"
              aria-label="Filter reviews"
              className="w-56 text-xs bg-card border border-line rounded-lg pl-7 pr-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>
        )}
      </header>

      {sorted.length === 0 ? (
        <p className="text-xs text-subtle px-1 py-3">No page matches “{q}”.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sorted.map((r) => {
            const isActive = r.id === activeId;
            const closed = r.status === "closed";
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/workspace/website-review?r=${r.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`group flex h-full flex-col rounded-2xl border bg-card p-4 transition-colors ${
                    isActive
                      ? "border-brand-400 ring-2 ring-brand-500/25"
                      : "border-line hover:border-brand-300 hover:bg-elevated"
                  } ${closed ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <h3 className="flex-1 text-sm font-bold text-fg leading-snug">{r.title}</h3>
                    {closed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold text-muted shrink-0">
                        <Archive size={9} /> Closed
                      </span>
                    ) : r.status !== "open" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shrink-0"
                        title="Exported — comments reopen when the next round starts"
                      >
                        <Lock size={9} /> R{r.round} locked
                      </span>
                    ) : (
                      <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[10px] font-semibold text-muted shrink-0">
                        Round {r.round}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate font-mono text-[11px] text-subtle" title={r.url}>
                    {prettyUrl(r.url)}
                  </p>

                  {/* The counts are for the current round — the same set the
                      export brief would produce. */}
                  <div className="mt-3 flex items-center gap-4">
                    <span
                      className={`inline-flex items-baseline gap-1.5 ${
                        r.openCount > 0 ? "text-fg" : "text-subtle"
                      }`}
                    >
                      <MessageSquareText
                        size={13}
                        className={r.openCount > 0 ? "text-brand-600" : "text-subtle"}
                      />
                      <span className="font-mono text-lg font-bold tabular-nums leading-none">
                        {r.openCount}
                      </span>
                      <span className="text-[11px]">open</span>
                    </span>

                    {r.settledCount > 0 && (
                      <span className="inline-flex items-baseline gap-1.5 text-subtle">
                        <CheckCircle2 size={12} className="text-emerald-600/70" />
                        <span className="font-mono text-sm tabular-nums leading-none">
                          {r.settledCount}
                        </span>
                        <span className="text-[11px]">settled</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="text-[10px] text-subtle">Updated {relTime(r.updatedAt)}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 opacity-0 transition-opacity group-hover:opacity-100">
                      {isActive ? "Viewing" : "Open"} <ArrowRight size={11} />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Shown when nothing is under review yet. */
export function ReviewIndexEmpty({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
      <MessageSquareText size={22} className="mx-auto text-subtle" />
      <p className="mt-3 text-sm font-semibold text-fg">No pages under review yet</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
        {isAdmin
          ? "Open a review on any biohubnet.ca page. Everyone on the link can comment on the page itself, and you export the open threads as a brief when the round is done."
          : "An admin needs to open a review before you can comment on a page."}
      </p>
      <a
        href="https://biohubnet.ca"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
      >
        Browse biohubnet.ca <ExternalLink size={10} />
      </a>
    </section>
  );
}
