"use client";

/**
 * Registration totals for the three upcoming events, on the admin
 * dashboard. Loads after the page (Luma is never allowed to slow the
 * dashboard down), then refreshes itself every two minutes while the tab
 * is visible, and on Refresh.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, RefreshCw, Users } from "lucide-react";
import type { RegistrationCount } from "@/lib/events/registrations";

const EVERY_MS = 2 * 60_000;

export function RegistrationCounts() {
  const [events, setEvents] = useState<RegistrationCount[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/registration-counts", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { at: string; events: RegistrationCount[] };
      setEvents(j.events);
      setAt(j.at);
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
            <h3 className="aero-h"><Users size={14} /> Event registrations</h3>
            <p className="aero-gloss">
              {failed
                ? "Couldn’t reach the counts just now — they will retry."
                : at
                  ? `Updated ${new Date(at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })} · refreshes every 2 minutes`
                  : "Reading the counts…"}
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
        <div className="grid gap-3 sm:grid-cols-3">
          {(events ?? PLACEHOLDER).map((e) => {
            const external = e.href.startsWith("http");
            return (
              <Link
                key={e.key}
                href={e.href}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group rounded-xl border border-line px-4 py-3 text-fg no-underline transition hover:border-brand-400"
              >
                <p className="text-[12.5px] font-semibold">{e.title}</p>
                <p className="text-[11px] text-muted">{e.when}</p>
                <p className="mt-1.5 text-[30px] font-bold leading-none tabular-nums">
                  {e.count === null ? "—" : e.count.toLocaleString()}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-muted group-hover:text-brand-700">
                  registered {e.source} {external ? <ArrowUpRight size={11} /> : <ArrowRight size={11} />}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </article>
  );
}

/** What the tiles say before the first answer arrives. */
const PLACEHOLDER: RegistrationCount[] = [
  { key: "insights", title: "Industry Insights", when: "Thu 24 Sep", count: null, source: "on Luma", href: "https://luma.com/413vhu2v" },
  { key: "symposium", title: "Annual Symposium", when: "Thu 29 Oct", count: null, source: "on Luma", href: "https://luma.com/wh30nh1n" },
  { key: "training", title: "Training Week", when: "26–28 Oct", count: null, source: "on the registration form", href: "/admin/workspace/training-admin?tab=registrants" },
];
