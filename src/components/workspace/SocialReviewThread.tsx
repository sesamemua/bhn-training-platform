"use client";

import { useId, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { SocialComment } from "@/lib/social/review";

/**
 * Review notes under a social post: comments, and "please review" asks
 * aimed at a named teammate. Approving answers every open ask.
 */
export function SocialReviewThread({ postId, label, comments, team, onAdded }: {
  postId: string;
  label: string;
  comments: SocialComment[];
  team: { id: string; name: string }[];
  onAdded: (comment: SocialComment) => void;
}) {
  const [body, setBody] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function submit() {
    if (!body.trim()) return setError(reviewerId ? "Say what you'd like reviewed." : "Write a comment first.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/social/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", id: postId, body, ...(reviewerId ? { reviewerId } : {}) }),
      });
      const j = await res.json().catch(() => ({})) as { comment?: SocialComment; error?: string };
      if (!res.ok || !j.comment) throw new Error(j.error ?? "Couldn't save the comment.");
      onAdded(j.comment); setBody(""); setReviewerId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the comment."); }
    finally { setBusy(false); }
  }

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
                {" · "}{new Date(c.at).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-fg">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
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
          <button type="submit" disabled={busy}
            className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : reviewerId ? "Ask for review" : "Comment"}
          </button>
        </div>
        {error && <p role="alert" className="text-[12px] text-rose-700">{error}</p>}
      </form>
    </details>
  );
}
