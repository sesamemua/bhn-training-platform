"use client";
/**
 * Client-side renderer for the /profile/assist-history page.
 * Receives pre-serialized data from the server component and shows:
 *   • Counts strip
 *   • Wipe-everything button
 *   • Recent events table
 *   • Daily rollups
 *   • Weekly summaries
 *   • Hints shown
 */
import { useState } from "react";
import { Loader2, AlertCircle, Trash2, Activity, FileText, Calendar, Sparkles, ChevronDown } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  counts: {
    events: number;
    rollups: number;
    summaries: number;
    hints: number;
  };
  recentEvents: Array<{
    id: string;
    ts: string;
    kind: string;
    surface: string | null;
    target: string | null;
  }>;
  rollups: Array<{
    day: string;
    surface: string;
    views: number;
    clicks: number;
    rageClicks: number;
    deadClicks: number;
    formAbandons: number;
    errors: number;
    dwellMs: number;
    completed: boolean;
  }>;
  summaries: Array<{
    weekStart: string;
    summary: string;
    stuckOn: string[];
  }>;
  hints: Array<{
    id: string;
    helpKey: string;
    title: string;
    body: string;
    surface: string | null;
    triggeredBy: string;
    confidence: number;
    status: string;
    createdAt: string;
    shownAt: string | null;
  }>;
}

export function AssistHistoryView({ counts, recentEvents, rollups, summaries, hints }: Props) {
  const [wiping, setWiping] = useState(false);
  const [wipeResult, setWipeResult] = useState<{ deleted: typeof counts } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  // Long lists are collapsed to the latest few; expandable to all.
  const COLLAPSED = 5;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showAllHints, setShowAllHints] = useState(false);
  const shownEvents = showAllEvents ? recentEvents : recentEvents.slice(0, COLLAPSED);
  const shownHints = showAllHints ? hints : hints.slice(0, COLLAPSED);

  async function wipe() {
    if (!(await confirmDialog({
      title: "Permanently delete every behaviour signal, rollup, summary, and hint we have on file for you?",
      description: "This can't be undone. Your preferences (consent toggle, sensitivity) are NOT deleted.",
      confirmLabel: "Delete everything",
      tone: "destructive",
    }))) {
      return;
    }
    setWiping(true);
    setError(null);
    try {
      const res = await fetch("/api/assist/history", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Wipe failed");
      }
      const j = (await res.json()) as { deleted: typeof counts };
      setWipeResult(j);
      // After 2s, refresh the page so the new (empty) state shows.
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="space-y-5">
      {confirmNode}
      {/* Counts strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Activity} label="Raw events" value={counts.events} help="last 90 days" />
        <Stat icon={Calendar} label="Daily rollups" value={counts.rollups} help="last 12 months" />
        <Stat icon={FileText} label="Weekly summaries" value={counts.summaries} help="last 18 months" />
        <Stat icon={Sparkles} label="Hints" value={counts.hints} help="ever" />
      </section>

      {/* Wipe */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 flex flex-wrap items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
          <Trash2 size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-rose-900">Delete everything</p>
          <p className="text-[11px] text-rose-800 leading-snug mt-0.5">
            Wipes every event, rollup, weekly summary, and hint we have
            on file for you. Your preferences row (consent toggle,
            sensitivity) is left alone — turn off consent above if you
            want to stop new collection too.
          </p>
        </div>
        <button
          type="button"
          onClick={wipe}
          disabled={wiping || counts.events + counts.rollups + counts.summaries + counts.hints === 0}
          className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-sm shadow-rose-600/25 transition-colors"
        >
          {wiping ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {wiping ? "Wiping…" : "Delete all"}
        </button>
      </section>

      {wipeResult && (
        <p className="text-[11px] text-emerald-700">
          Deleted {wipeResult.deleted.events} events, {wipeResult.deleted.rollups} rollups, {wipeResult.deleted.summaries} summaries, {wipeResult.deleted.hints} hints. Refreshing…
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </p>
      )}

      {/* Weekly summaries */}
      {summaries.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle mb-2">
            Weekly journey summaries
          </h2>
          <ul className="space-y-2">
            {summaries.map((s) => (
              <li key={s.weekStart} className="rounded-xl border border-line bg-card p-4">
                <p className="text-[10px] text-subtle font-mono tabular-nums">
                  Week of {s.weekStart.slice(0, 10)}
                </p>
                <p className="text-sm text-fg leading-relaxed mt-1">{s.summary}</p>
                {s.stuckOn.length > 0 && (
                  <p className="text-[11px] text-subtle mt-2">
                    Stuck on: {s.stuckOn.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Hints shown */}
      {hints.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle mb-2">
            Hints shown to you
          </h2>
          <ul className="space-y-2">
            {shownHints.map((h) => (
              <li key={h.id} className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-fg">{h.title}</p>
                    <p className="text-xs text-muted mt-0.5">{h.body}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-elevated text-muted ring-1 ring-inset ring-line whitespace-nowrap">
                    {h.status}
                  </span>
                </div>
                <p className="text-[10px] text-subtle mt-2 font-mono">
                  {h.surface ?? "(any surface)"} · trigger {h.triggeredBy} · confidence {(h.confidence * 100).toFixed(0)}% · {h.createdAt.slice(0, 16).replace("T", " ")}
                </p>
              </li>
            ))}
          </ul>
          {hints.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setShowAllHints((v) => !v)}
              aria-expanded={showAllHints}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800"
            >
              {showAllHints ? "Show fewer" : `Show all ${hints.length}`}
              <ChevronDown
                size={12}
                className={`transition-transform ${showAllHints ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </section>
      )}

      {/* Daily rollups */}
      {rollups.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle mb-2">
            Daily aggregates · last 30
          </h2>
          <div className="rounded-xl border border-line bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-subtle">
                <tr>
                  <th className="text-left px-3 py-2">Day</th>
                  <th className="text-left px-3 py-2">Surface</th>
                  <th className="text-right px-3 py-2">Views</th>
                  <th className="text-right px-3 py-2">Clicks</th>
                  <th className="text-right px-3 py-2">Rage</th>
                  <th className="text-right px-3 py-2">Dead</th>
                  <th className="text-right px-3 py-2">Errors</th>
                  <th className="text-right px-3 py-2">Dwell (s)</th>
                  <th className="text-center px-3 py-2">Done</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((r, i) => (
                  <tr key={`${r.day}-${r.surface}-${i}`} className="border-t border-line">
                    <td className="px-3 py-2 font-mono tabular-nums">{r.day.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-muted truncate max-w-[180px]">{r.surface}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.views}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.clicks}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rageClicks > 0 ? <span className="text-rose-700">{r.rageClicks}</span> : 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.deadClicks}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.errors > 0 ? <span className="text-amber-700">{r.errors}</span> : 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.dwellMs / 1000)}</td>
                    <td className="px-3 py-2 text-center">{r.completed ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent raw events — collapsed to the latest few, expandable. */}
      {recentEvents.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle mb-2">
            Recent events · last {recentEvents.length}
          </h2>
          <div className="rounded-xl border border-line bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-subtle">
                <tr>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Kind</th>
                  <th className="text-left px-3 py-2">Surface</th>
                  <th className="text-left px-3 py-2">Target</th>
                </tr>
              </thead>
              <tbody>
                {shownEvents.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-subtle text-[10px]">{e.ts.slice(11, 19)} · {e.ts.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-fg">{e.kind}</td>
                    <td className="px-3 py-2 text-muted truncate max-w-[180px]">{e.surface ?? "—"}</td>
                    <td className="px-3 py-2 text-muted truncate max-w-[200px]">{e.target ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recentEvents.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setShowAllEvents((v) => !v)}
              aria-expanded={showAllEvents}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800"
            >
              {showAllEvents
                ? "Show fewer"
                : `Show all ${recentEvents.length}`}
              <ChevronDown
                size={12}
                className={`transition-transform ${showAllEvents ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </section>
      )}

      {/* Empty state */}
      {counts.events === 0 && counts.rollups === 0 && counts.summaries === 0 && counts.hints === 0 && (
        <section className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="text-sm text-muted">
            No assist data on file. Either you haven't opted in yet, or
            we've deleted everything we had.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({
  icon: Icon, label, value, help,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  help?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle inline-flex items-center gap-1.5">
        <Icon size={11} /> {label}
      </div>
      <p className="text-2xl font-bold text-fg tabular-nums mt-1">{value.toLocaleString()}</p>
      {help && <p className="text-[10px] text-subtle mt-0.5">{help}</p>}
    </div>
  );
}
