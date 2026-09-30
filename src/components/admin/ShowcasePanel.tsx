"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Sparkles, RefreshCw, Trash2, Copy, ExternalLink, Check,
  GraduationCap, Award, Coins, Gift, Calendar, Lightbulb,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ShowcaseSummary {
  exists: true;
  email: string;
  name: string;
  magicToken: string;
  credits: number;
  counts: {
    enrollments: number;
    certificates: number;
    creditTransactions: number;
    merchRewards: number;
    interviews: number;
    userSkills: number;
  };
  createdAt: string;
}

interface NoShowcase { exists: false }

type State = ShowcaseSummary | NoShowcase;

/**
 * Admin panel for managing the global Showcase Trainee.
 *
 *   • If no showcase exists → big "Spawn" button.
 *   • If one exists         → summary card + Sign in (magic link) +
 *                              Reset (wipe + re-seed) + Delete.
 *
 * Magic link is the recommended sign-in path because it's one-click
 * and doesn't require keeping a password around. We surface a Copy
 * button next to it for sharing in Slack with teammates running
 * their own demos.
 */
export function ShowcasePanel({ initial }: { initial: State }) {
  const router = useRouter();
  const [state, setState] = useState<State>(initial);
  const [busy, setBusy] = useState<null | "spawn" | "reset" | "delete">(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const magicLink = state.exists
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/sandbox/${state.magicToken}`
    : "";

  async function call(method: "POST" | "PATCH" | "DELETE", action: "spawn" | "reset" | "delete") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/showcases", { method });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        showcase?: { user: { email: string; name: string; magicToken: string }; counts: ShowcaseSummary["counts"] };
        deleted?: boolean;
      };
      if (!res.ok) throw new Error(j.error ?? "Action failed.");

      if (action === "delete") {
        setState({ exists: false });
        router.refresh();
        return;
      }
      // Server returns the seed result. We re-read counts via router.refresh()
      // afterwards so this card reflects the latest DB state, but optimistically
      // update the headline fields so the UI doesn't feel sluggish.
      if (j.showcase) {
        setState({
          exists: true,
          email: j.showcase.user.email,
          name: j.showcase.user.name,
          magicToken: j.showcase.user.magicToken,
          credits: 1000,                       // matches seed.ts
          counts: j.showcase.counts,
          createdAt: new Date().toISOString(),
        });
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!state.exists) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6 sm:p-8 surface-shadow text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
          <Sparkles size={26} />
        </div>
        <h2 className="text-lg font-bold text-fg tracking-tight">No showcase trainee yet</h2>
        <p className="text-sm text-muted mt-1.5 max-w-md mx-auto leading-snug">
          Spawn the global Showcase Trainee account. Pre-populated with
          completed coursework, both merch tiers, full profile, and scheduled
          interviews — ready to demo in under a minute.
        </p>
        <button
          type="button"
          onClick={() => call("POST", "spawn")}
          disabled={busy !== null}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-md shadow-brand-600/25"
        >
          {busy === "spawn" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy === "spawn" ? "Spawning…" : "Spawn Showcase Trainee"}
        </button>
        {error && (
          <p className="mt-4 text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2 max-w-md mx-auto">
            {error}
          </p>
        )}
      </section>
    );
  }

  const stats: { label: string; value: number; icon: React.ElementType }[] = [
    { label: "Enrollments",    value: state.counts.enrollments,        icon: GraduationCap },
    { label: "Certificates",   value: state.counts.certificates,       icon: Award },
    { label: "Credit history", value: state.counts.creditTransactions, icon: Coins },
    { label: "Merch rewards",  value: state.counts.merchRewards,       icon: Gift },
    { label: "Interviews",     value: state.counts.interviews,         icon: Calendar },
    { label: "Skills earned",  value: state.counts.userSkills,         icon: Lightbulb },
  ];

  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-6 surface-shadow space-y-5">
      {confirmNode}
      {/* Header — name + email */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">Active showcase</p>
          <h2 className="text-xl font-bold text-fg mt-1 tracking-tight">{state.name}</h2>
          <p className="text-xs text-muted font-mono mt-0.5">{state.email}</p>
        </div>
        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
          Trainee · accountKind=showcase
        </span>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-line bg-elevated p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-subtle">
                <Icon size={11} />
                {s.label}
              </div>
              <p className="text-2xl font-bold text-fg mt-0.5 tabular-nums">{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Magic link — primary action surface */}
      <div className="rounded-xl border border-brand-300 bg-brand-50 p-4">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-brand-700 mb-1.5">
          One-click sign-in
        </p>
        <div className="flex items-center gap-2">
          <a
            href={magicLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            <ExternalLink size={13} />
            Sign in as Maya — opens new tab
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(magicLink).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card text-brand-700 text-sm font-semibold ring-1 ring-inset ring-brand-300 hover:bg-elevated transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="text-[11px] text-brand-700/80 mt-2 leading-snug">
          Open in incognito to keep your admin session alive in the main
          window. Tip for superadmins: the View-as switcher in the sidebar
          also lets you peek as a trainee without leaving your account.
        </p>
      </div>

      {/* Reset / Delete */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => call("PATCH", "reset")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card text-fg text-xs font-semibold ring-1 ring-inset ring-line hover:bg-elevated disabled:opacity-50 transition-colors"
          title="Wipe related rows and re-seed for a known-good demo state"
        >
          {busy === "reset" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {busy === "reset" ? "Resetting…" : "Reset to canonical state"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!(await confirmDialog({
              title: "Delete the showcase trainee account and all owned rows?",
              description: "You can spawn a fresh one afterwards.",
              confirmLabel: "Delete",
              tone: "destructive",
            }))) return;
            call("DELETE", "delete");
          }}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50 transition-colors"
        >
          {busy === "delete" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {busy === "delete" ? "Deleting…" : "Delete account"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </section>
  );
}
