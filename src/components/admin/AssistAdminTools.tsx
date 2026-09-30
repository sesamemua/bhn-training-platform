"use client";
/**
 * Operator-action panel on /admin/assist. Buttons that POST to the
 * underlying maintenance endpoints (rollup cron, weekly summary,
 * ad-hoc AI inference). Shows the JSON response inline so the
 * admin can verify what happened.
 */
import { useState } from "react";
import { Loader2, Play, FileText, Sparkles, Share2, Beaker, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export function AssistAdminTools() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function run(label: string, fn: () => Promise<Response>) {
    setBusy(label);
    setResult(null);
    try {
      const r = await fn();
      const text = await r.text();
      try {
        const parsed = JSON.parse(text);
        setResult(JSON.stringify(parsed, null, 2));
      } catch {
        setResult(text);
      }
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function copyShare() {
    // Builds a markdown report from the page's visible data and
    // copies to clipboard. Simple share-as-text affordance.
    try {
      const lines = [
        `# Assist findings — ${new Date().toISOString().slice(0, 10)}`,
        "",
        "Snapshot of `/admin/assist` for sharing with the team. Numbers + summaries copied verbatim from the dashboard above.",
        "",
        "(Open the page to see the live tables — this clipboard copy is the human-readable header only.)",
      ];
      await navigator.clipboard.writeText(lines.join("\n"));
      setResult("✓ Findings header copied to clipboard.");
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card surface-shadow p-5 space-y-4">
      {confirmNode}
      <h2 className="text-sm font-bold text-fg inline-flex items-center gap-2">
        <Play size={14} className="text-brand-600" />
        Operator actions
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ActionTile
          icon={FileText}
          title="Run nightly rollup now"
          body="Aggregates yesterday's events into daily rollups, purges 90-day-old raw events, expires stale hints."
          busy={busy === "rollup"}
          onClick={() => run("rollup", () => fetch("/api/cron/assist-rollup", { method: "POST" }))}
        />
        <ActionTile
          icon={FileText}
          title="Run weekly summary now"
          body="Asks the LLM to write a journey summary for every user with activity last week (one chat call each)."
          busy={busy === "summary"}
          onClick={() => run("summary", () => fetch("/api/cron/assist-weekly-summary", { method: "POST" }))}
        />
      </div>

      <div className="rounded-xl border border-line bg-elevated/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle mb-2 inline-flex items-center gap-1.5">
          <Sparkles size={11} className="text-brand-600" />
          Trigger AI inference on a user
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user id (cuid)"
            className="flex-1 min-w-[200px] bg-card-solid border border-line rounded-lg px-3 py-1.5 text-xs text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 font-mono"
          />
          <button
            type="button"
            disabled={!userId.trim() || busy === "infer"}
            onClick={() => run("infer", () => fetch("/api/assist/infer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: userId.trim() }),
            }))}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-brand-600/25 transition-colors"
          >
            {busy === "infer" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            Run inference
          </button>
        </div>
        <p className="text-[10px] text-subtle leading-snug mt-2">
          Loads the user's recent events + last week's summary, picks
          the best help card, queues an AssistHint if confidence is
          high enough. Respects the user's consent + threshold.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-line bg-elevated/30 p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle mb-1 inline-flex items-center gap-1.5">
          <Beaker size={11} className="text-amber-600" />
          Demo data — only for this page
        </p>
        <p className="text-[11px] text-muted leading-snug mb-3">
          Spins up six throwaway trainees with a week of behavior
          covering every stuck-pattern (rage clicks, form abandons,
          error loops, long dwell, healthy path). Lets you see what
          the dashboard above looks like with realistic data. Wipes
          cleanly — these users only exist so this page has examples.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy === "seed-demo"}
            onClick={() => run("seed-demo", () => fetch("/api/admin/assist/demo/seed", { method: "POST" }))}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-amber-600/25 transition-colors"
          >
            {busy === "seed-demo" ? <Loader2 size={11} className="animate-spin" /> : <Beaker size={11} />}
            Seed demo data
          </button>
          <button
            type="button"
            disabled={busy === "clear-demo"}
            onClick={async () => {
              if (!(await confirmDialog({
                title: "Delete every demo trainee (assist-demo-*@bhn.test) and the assist data they own?",
                description: "Real users are untouched.",
                confirmLabel: "Delete",
                tone: "destructive",
              }))) return;
              run("clear-demo", () => fetch("/api/admin/assist/demo/seed", { method: "DELETE" }));
            }}
            className="inline-flex items-center gap-1.5 bg-card-solid hover:bg-elevated border border-line text-fg text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {busy === "clear-demo" ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            Clear demo data
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line">
        <button
          type="button"
          onClick={copyShare}
          className="inline-flex items-center gap-1.5 bg-card-solid hover:bg-elevated border border-line text-fg text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Share2 size={11} /> Copy findings header
        </button>
      </div>

      {busy && (
        <p className="text-[11px] text-subtle inline-flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> Running…
        </p>
      )}
      {result && (
        <pre className="text-[10px] font-mono bg-fg text-background p-3 rounded-lg overflow-x-auto max-h-64">
{result}
        </pre>
      )}
    </section>
  );
}

function ActionTile({
  icon: Icon, title, body, busy, onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-left rounded-xl border border-line bg-card-solid hover:bg-elevated disabled:opacity-60 transition-colors p-3 flex items-start gap-2"
    >
      <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-fg">{title}</span>
        <span className="block text-[11px] text-muted leading-snug mt-0.5">{body}</span>
      </span>
    </button>
  );
}
