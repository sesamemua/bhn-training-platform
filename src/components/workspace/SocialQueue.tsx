"use client";

/**
 * The social queue — drafts waiting for a person.
 *
 * Every post here was written from a cycle's own facts and none of it
 * goes anywhere until somebody approves it. The copy button is the
 * publish button: you take the words and the image and post them
 * yourself, then mark it done. That is not a placeholder for a proper
 * integration so much as an honest description of what the platform can
 * do — there is no LinkedIn app behind this, and pretending otherwise
 * in the UI would be the worst of both.
 */
import { useState } from "react";
import { Check, Copy, Clock, RefreshCw, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QueuePost {
  id: string;
  kind: string;
  status: string;
  cycleLabel: string;
  daysBefore: number;
  body: string;
  assetUrl: string | null;
  assetSpec: unknown;
  scheduledFor: string;
  overdue: boolean;
  /** The cycle's deadline moved after this post was approved. */
  stale: boolean;
}

const KIND_LABEL: Record<string, string> = {
  launch: "Launch",
  reminder: "Reminder",
  recipients: "Recipients",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-elevated text-muted ring-line",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  scheduled: "bg-brand-50 text-brand-800 ring-brand-200",
  published: "bg-violet-50 text-violet-800 ring-violet-200",
  skipped: "bg-elevated text-subtle ring-line",
};

export function SocialQueue({ initial }: { initial: QueuePost[] }) {
  const [posts, setPosts] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch("/api/admin/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, ...extra }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't save.");
      setPosts((all) =>
        all.map((p) =>
          p.id === id
            ? {
                ...p,
                status:
                  action === "approve" ? "approved"
                  : action === "unapprove" ? "draft"
                  : action === "skip" ? "skipped"
                  : action === "markPublished" ? "published"
                  : p.status,
                ...(action === "edit" ? { body: String(extra.body ?? p.body) } : {}),
              }
            : p,
        ),
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(p: QueuePost) {
    try {
      await navigator.clipboard.writeText(p.body);
      setCopied(p.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy the post:", p.body);
    }
  }

  if (posts.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-card p-5 text-[13px] leading-relaxed text-muted">
        Nothing drafted yet. Posts appear here once a VentureConnect cycle is open —
        the daily job drafts a launch and a reminder ladder from the cycle&apos;s own
        deadline, so nothing here has a date typed into it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {note && <p className="text-[12.5px] text-rose-700">{note}</p>}
      {posts.map((p) => (
        <article key={p.id} className="rounded-xl border-2 border-line-strong bg-card">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5">
            <span className="text-[13px] font-bold text-fg">
              {KIND_LABEL[p.kind] ?? p.kind}
              {p.kind === "reminder" && (
                <span className="ml-1.5 font-normal text-muted">
                  {p.daysBefore === 0 ? "closing day" : `${p.daysBefore} days out`}
                </span>
              )}
            </span>
            <span className="text-[11.5px] text-subtle">{p.cycleLabel}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ring-inset",
                STATUS_TONE[p.status] ?? STATUS_TONE.draft,
              )}
            >
              {p.status}
            </span>
            {p.overdue && p.status === "draft" && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-700">
                <Clock size={12} /> due {new Date(p.scheduledFor).toLocaleDateString("en-CA")}
              </span>
            )}
            {/* The one thing the queue can tell you that the post cannot
                tell you itself: the cycle moved after somebody approved
                these words, so the date in them is out of date. */}
            {p.stale && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-700">
                <RefreshCw size={12} /> the deadline moved since this was approved
              </span>
            )}
            <span className="ml-auto text-[11px] tabular-nums text-subtle">
              {new Date(p.scheduledFor).toLocaleDateString("en-CA")}
            </span>
          </header>

          <div className="px-4 py-3">
            <textarea
              defaultValue={p.body}
              rows={Math.min(14, p.body.split("\n").length + 2)}
              disabled={p.status === "published" || p.status === "skipped"}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== p.body) {
                  void act(p.id, "edit", { body: e.target.value });
                }
              }}
              className="w-full resize-y rounded-lg border border-line bg-elevated/40 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg outline-none focus:border-brand-500 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-subtle">
              {p.assetUrl ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <ImageIcon size={11} /> image ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon size={11} /> no image yet — the renderer writes one back from the asset spec
                </span>
              )}
            </p>
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
            <button
              type="button"
              onClick={() => void copy(p)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg transition-colors hover:bg-elevated"
            >
              <Copy size={12} /> {copied === p.id ? "Copied" : "Copy text"}
            </button>

            {p.status === "draft" && (
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => void act(p.id, "approve")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
              >
                <Check size={12} /> Approve
              </button>
            )}
            {p.status === "approved" && (
              <>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void act(p.id, "markPublished")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  <Check size={12} /> Mark posted
                </button>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void act(p.id, "unapprove")}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-elevated"
                >
                  Back to draft
                </button>
              </>
            )}
            {p.status !== "published" && p.status !== "skipped" && (
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => void act(p.id, "skip")}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-elevated"
                title="Decline this post — it will not be drafted again"
              >
                <X size={12} /> Not this one
              </button>
            )}
          </footer>
        </article>
      ))}
    </div>
  );
}
