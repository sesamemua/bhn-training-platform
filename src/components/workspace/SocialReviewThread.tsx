"use client";

import { useId, useState } from "react";
import { Check, Link as LinkIcon, Mail, MessageSquare } from "lucide-react";
import { reviewPath, type SocialComment } from "@/lib/social/review";

/**
 * Review notes under a social post: comments, and "please review" asks
 * aimed at a named teammate. Approving answers every open ask.
 */
export function SocialReviewThread({ postId, label, comments, team, onAdded, showLink = true }: {
  postId: string;
  label: string;
  comments: SocialComment[];
  team: { id: string; name: string }[];
  onAdded: (comment: SocialComment) => void;
  /** Off on the series review, which shows whole posts rather than links to them. */
  showLink?: boolean;
}) {
  const [body, setBody] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [email, setEmail] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function submit() {
    if (!body.trim()) return setError(reviewerId ? "Say what you'd like reviewed." : "Write a comment first.");
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/admin/social/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", id: postId, body, ...(reviewerId ? { reviewerId, email } : {}) }),
      });
      const j = await res.json().catch(() => ({})) as { comment?: SocialComment; error?: string; emailError?: string | null };
      if (!res.ok || !j.comment) throw new Error(j.error ?? "Couldn't save the comment.");
      onAdded(j.comment); setBody(""); setReviewerId("");
      if (j.emailError) setNotice(`Review request saved, but ${j.emailError.charAt(0).toLowerCase()}${j.emailError.slice(1)}`);
      else if (j.comment.emailed) setNotice(`Emailed ${j.comment.reviewerName} the review link. You're copied.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the comment."); }
    finally { setBusy(false); }
  }

  const link = () => `${window.location.origin}${reviewPath(postId)}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(link()); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setNotice(`Review link: ${link()}`); }
  }
  const reviewer = team.find((t) => t.id === reviewerId);

  return (
    <details className="border-b border-line px-1 py-2 text-[13px]" open={comments.length > 0 || undefined}>
      <summary className="cursor-pointer font-semibold text-fg">
        <MessageSquare size={14} className="mr-1.5 inline align-[-2px] text-brand-600" aria-hidden />
        Review & comments{comments.length ? ` (${comments.length})` : ""}
      </summary>
      {comments.length > 0 && (
        <ol className="mt-2 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-elevated px-3 py-2">
              <p className="text-[12px] text-muted">
                <span className="font-semibold text-fg">{c.author}</span>
                {c.reviewerName && <> asked <span className="font-semibold text-fg">{c.reviewerName}</span> to review</>}
                {c.emailed && <span className="ml-1 inline-flex items-center gap-0.5 align-[-1px] text-muted"><Mail size={11} aria-hidden /> emailed</span>}
                {" · "}{new Date(c.at).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-fg">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      {showLink && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
        <LinkIcon size={13} className="shrink-0 text-brand-600" aria-hidden />
        <span className="text-[12px] font-semibold text-fg">Review link</span>
        <code className="min-w-0 flex-1 truncate text-[11px] text-muted">{reviewPath(postId)}</code>
        <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700">
          {copied ? <><Check size={12} /> Copied</> : "Copy"}
        </button>
      </div>}
      <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label htmlFor={`${id}-body`} className="sr-only">Comment on {label}</label>
        <textarea id={`${id}-body`} rows={2} maxLength={2000} value={body} disabled={busy}
          onChange={(e) => { setBody(e.target.value); setError(null); }}
          placeholder="Leave a note, or say what to check"
          className="w-full rounded-md border border-line bg-card-solid px-3 py-2 text-fg" />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-reviewer`} className="text-[12px] text-muted">Ask to review</label>
          <select id={`${id}-reviewer`} value={reviewerId} disabled={busy} onChange={(e) => setReviewerId(e.target.value)}
            className="rounded-md border border-line bg-card-solid px-2 py-1.5 text-[13px] text-fg">
            <option value="">No one — just a comment</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {reviewer && (
            <label className="inline-flex items-center gap-1.5 text-[12px] text-fg">
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="size-3.5 accent-brand-600" />
              <Mail size={12} className="text-brand-600" aria-hidden /> Email {reviewer.name.split(" ")[0]} the review link
            </label>
          )}
          <button type="submit" disabled={busy}
            className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">
            {busy ? (reviewerId && email ? "Sending…" : "Saving…") : reviewerId ? (email ? "Ask & email" : "Ask for review") : "Comment"}
          </button>
        </div>
        {error && <p role="alert" className="text-[12px] text-rose-700">{error}</p>}
        {notice && <p role="status" className="break-all text-[12px] text-fg">{notice}</p>}
      </form>
    </details>
  );
}
