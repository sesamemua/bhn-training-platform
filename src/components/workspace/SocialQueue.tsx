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
import { Check, Copy, Clock, Download, Pencil, RefreshCw, Save, X, Image as ImageIcon } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { withSocialTags } from "@/lib/social/tags";
import { cn } from "@/lib/utils";

export interface QueuePost {
  id: string;
  stream: string;
  kind: string;
  status: string;
  cycleLabel: string;
  daysBefore: number;
  body: string;
  assetUrl: string | null;
  organization: string | null;
  companyLogoUrl: string | null;
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
  speaker: "Speaker highlight",
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
  const [group, setGroup] = useState<"symposium_2026" | "venture_connect">("symposium_2026");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  async function act(id: string, action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
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
      return true;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogo(post: QueuePost, file: File) {
    if (file.size > 3_000_000) {
      setNote("Choose a logo under 3 MB.");
      return;
    }
    setBusy(post.id);
    setNote(null);
    try {
      const form = new FormData();
      form.set("logo", file);
      const response = await fetch(`/api/admin/social/posts/${post.id}/company-logo`, {
        method: "POST", body: form,
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Couldn't upload the logo.");
      setPosts((all) => all.map((item) => item.id === post.id
        ? { ...item, companyLogoUrl: result.url!, assetUrl: post.assetUrl ? `${post.assetUrl.split("?")[0]}?v=${Date.now()}` : null }
        : item));
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't upload the logo.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(p: QueuePost) {
    try {
      await navigator.clipboard.writeText(withSocialTags(p.body));
      setCopied(p.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy the post:", withSocialTags(p.body));
    }
  }

  const visible = posts.filter((post) => post.stream === group);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Social content groups">
        {([
          ["symposium_2026", "2026 Symposium speakers"],
          ["venture_connect", "VentureConnect"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={group === key}
            onClick={() => setGroup(key)}
            className={cn(
              "border-b-2 px-4 py-3 text-[16px] font-semibold transition-colors",
              group === key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {label} <span className="ml-1 text-subtle">{posts.filter((post) => post.stream === key).length}</span>
          </button>
        ))}
      </div>
      <h2 className="text-[26px] font-bold leading-tight text-fg sm:text-[32px]">
        {group === "symposium_2026" ? "2026 Annual Symposium" : "VentureConnect"}
      </h2>
      <p className="text-[14px] text-muted">
        {group === "symposium_2026"
          ? "Drafts use the speaker bios and headshots saved for the symposium. Review each person's details and permission before posting."
          : "Posts follow live VentureConnect cycles. Approve the words before sharing them."}
      </p>
      {note && <p className="text-[12.5px] text-rose-700">{note}</p>}
      {visible.length === 0 && (
        <p className="rounded-lg border border-line bg-card p-5 text-[13px] leading-relaxed text-muted">
          {group === "symposium_2026"
            ? "No speaker highlights are ready yet. Add a bio and headshot in 2026 Symposium → Speakers; the draft will appear here."
            : "No VentureConnect drafts yet. They appear when a cycle opens."}
        </p>
      )}
      {visible.map((p) => (
        <article key={p.id} className="mx-auto w-full max-w-[860px] overflow-hidden rounded-[8px] border border-line-strong bg-card-solid text-fg shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-elevated px-5 py-3">
            <span className="text-[14px] font-bold">
              {KIND_LABEL[p.kind] ?? p.kind}
              {p.kind === "reminder" && (
                <span className="ml-1.5 font-normal text-muted">
                  {p.daysBefore === 0 ? "closing day" : `${p.daysBefore} days out`}
                </span>
              )}
            </span>
            <span className="text-[17px] font-semibold text-fg">{p.cycleLabel}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ring-inset",
                STATUS_TONE[p.status] ?? STATUS_TONE.draft,
              )}
            >
              {p.status}
            </span>
            {p.overdue && p.status === "draft" && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700">
                <Clock size={12} /> due {new Date(p.scheduledFor).toLocaleDateString("en-CA")}
              </span>
            )}
            {/* The one thing the queue can tell you that the post cannot
                tell you itself: the cycle moved after somebody approved
                these words, so the date in them is out of date. */}
            {p.stale && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-700">
                <RefreshCw size={12} /> {p.stream === "symposium_2026"
                  ? "Speaker details changed; review this draft and graphic again"
                  : "the deadline moved since this was approved"}
              </span>
            )}
            {p.stream !== "symposium_2026" && (
              <span className="ml-auto text-[12px] tabular-nums text-muted">
                {new Date(p.scheduledFor).toLocaleDateString("en-CA")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 pb-2 pt-5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-card-solid">
              <LogoMark size={40} />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-bold leading-tight">BioHubNet</p>
              <p className="text-[13px] text-muted">LinkedIn post preview</p>
            </div>
          </div>

          <div className="px-5 pb-5 pt-3">
            {editingId === p.id ? (
              <div className="space-y-3">
                <textarea
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                  rows={Math.max(12, editBody.split("\n").length + Math.ceil(editBody.length / 65))}
                  maxLength={6000}
                  className="w-full resize-y rounded-[6px] border border-line bg-card-solid p-3 text-[16px] leading-[1.55] text-fg outline-none focus:ring-2 focus:ring-brand-500"
                  aria-label="Edit LinkedIn post"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === p.id || !editBody.trim()}
                    onClick={async () => {
                      if (await act(p.id, "edit", { body: editBody })) setEditingId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[6px] bg-brand-600 px-3 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
                  >
                    <Save size={16} /> Save copy
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="px-3 py-2 text-[14px] font-semibold text-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words text-[16px] leading-[1.55]">{withSocialTags(p.body)}</p>
            )}
          </div>

          {p.assetUrl && (p.stream !== "symposium_2026" || p.companyLogoUrl) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={p.assetUrl} alt={`Social graphic for ${p.cycleLabel}`} className="block aspect-square w-full border-y border-line object-contain" />
          )}

          {p.stream === "symposium_2026" && !p.companyLogoUrl && (
            <p className="border-y border-line bg-brand-50 px-5 py-5 text-[15px] font-semibold text-brand-800">
              Add the {p.organization ?? "organization"} logo to complete this speaker graphic.
            </p>
          )}

          {p.stream === "symposium_2026" && (
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
              {p.companyLogoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.companyLogoUrl} alt={`${p.organization ?? "Organization"} logo`} className="h-16 w-40 object-contain" />
              ) : <span className="text-[13px] text-muted">No organization logo selected</span>}
              {p.status !== "published" && p.status !== "skipped" && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
                  <ImageIcon size={16} /> {p.companyLogoUrl ? "Replace organization logo" : "Upload organization logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy === p.id}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadLogo(p, file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-2 px-5 py-4">
            <button
              type="button"
              onClick={() => void copy(p)}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[14px] font-semibold text-fg transition-colors hover:bg-brand-50"
            >
              <Copy size={16} /> {copied === p.id ? "Copied" : "Copy post"}
            </button>

            {p.stream === "symposium_2026" && p.assetUrl && p.companyLogoUrl && (
              <a
                href={`${p.assetUrl}${p.assetUrl.includes("?") ? "&" : "?"}download=1`}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[14px] font-semibold text-fg transition-colors hover:bg-brand-50"
              >
                <Download size={16} /> Download graphic
              </a>
            )}

            {p.status !== "published" && p.status !== "skipped" && editingId !== p.id && (
              <button
                type="button"
                onClick={() => { setEditingId(p.id); setEditBody(withSocialTags(p.body)); }}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[14px] font-semibold text-fg transition-colors hover:bg-brand-50"
              >
                <Pencil size={16} /> Edit post
              </button>
            )}

            {p.status === "draft" && (
              <button
                type="button"
                disabled={busy === p.id || (p.stream === "symposium_2026" && !p.companyLogoUrl)}
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
