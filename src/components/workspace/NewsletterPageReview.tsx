"use client";

import { useState } from "react";
import { Code2, Copy, Loader2, Save } from "lucide-react";
import { NewsletterReviewInvite } from "./NewsletterReviewInvite";
import { getNewsletterReviewComments } from "@/lib/newsletter/review-comments";
import { NewsletterReviewOverview, type NewsletterRoundSummary, type NewsletterIssueChoice } from "./NewsletterReviewOverview";

interface Review { id: string; round: number; status: string; teamRound?: number | null }

export function NewsletterPageReview({ issueId, html, initialReview, canEdit, initialPaste = "", issueTitle = "Newsletter", issueNumber, initialRounds = [], issues = [], initialHasSavedPreview, initialHasReviewHtml }: {
  issueId: string; html: string; initialReview: Review | null; canEdit: boolean; initialPaste?: string;
  issueTitle?: string; issueNumber?: string; initialRounds?: NewsletterRoundSummary[]; issues?: NewsletterIssueChoice[];
  initialHasSavedPreview?: boolean;
  initialHasReviewHtml?: boolean;
}) {
  const [review, setReview] = useState(initialReview);
  const [rounds, setRounds] = useState(initialRounds);
  const [hasSavedPreview, setHasSavedPreview] = useState(initialHasSavedPreview ?? !!(initialPaste || html).trim());
  const [hasReviewHtml, setHasReviewHtml] = useState(initialHasReviewHtml ?? !!initialReview);
  const [source, setSource] = useState<"issue" | "paste">(initialPaste ? "paste" : "issue");
  const [paste, setPaste] = useState(initialPaste);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | "comments" | null>(null);
  const [copyingComments, setCopyingComments] = useState(false);
  const [commentBrief, setCommentBrief] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const code = source === "paste" ? paste : html;
  const launch = hasSavedPreview ? review && hasReviewHtml && !["pending", "closed"].includes(review.status)
    ? `/api/workspace/page-review/${encodeURIComponent(review.id)}/launch`
    : `/api/workspace/newsletter/${encodeURIComponent(issueId)}/review-preview`
    : null;

  async function save(action: "save" | "release" | "next" = "save") {
    if (action === "next" && !window.confirm("Open the saved version for the next team review? No invitations will be sent.")) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/workspace/newsletter/${encodeURIComponent(issueId)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action !== "save" ? action : review ? "revise" : "open", html: code, round: review?.round, ...(action !== "save" ? { teamRound: review?.teamRound ?? (action === "next" ? 1 : 0) } : {}) }),
      });
      const result = await response.json();
      if (!response.ok || !result.review) throw new Error(result.error ?? "Could not save the review.");
      if (review && result.review.round > review.round) {
        setRounds((current) => current.some((r) => r.round === review.round) ? current : [...current, { round: review.round, savedAt: new Date().toISOString() }]);
      }
      setHasSavedPreview(true);
      setHasReviewHtml(true);
      setReview(result.review);
      // Another editor may have saved intervening rounds; reload their actual history.
      if (review && ((result.unchanged && result.review.round !== review.round) || result.review.round > review.round + 1)) window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the review."); }
    finally { setBusy(false); }
  }

  async function copy(kind: "link" | "code") {
    if (kind === "link" && !launch) return;
    try {
      await navigator.clipboard.writeText(kind === "code" ? code : new URL(`/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issueId)}`, window.location.origin).href);
      setCopied(kind); window.setTimeout(() => setCopied(null), 2000);
    } catch { setError(kind === "code" ? "Could not copy the code. Open View code to select it." : "Could not copy the link. Use Open full-page review instead."); }
  }

  async function copyComments() {
    setCopyingComments(true); setError(null); setCommentBrief(null);
    try {
      const result = await getNewsletterReviewComments(issueId);
      if (!result.ok) { setError(result.error); return; }
      setCommentBrief(result.brief);
      try {
        await navigator.clipboard.writeText(result.brief);
        setCopied("comments"); window.setTimeout(() => setCopied(null), 2000);
      } catch { setError("Could not copy automatically. Open Review comments below to select and copy the text."); }
    } catch { setError("Could not load review comments. Please try again."); }
    finally { setCopyingComments(false); }
  }

  return <section className="min-w-0 space-y-3" aria-label="Newsletter review">
    <NewsletterReviewOverview issueId={issueId} issueTitle={issueTitle} issueNumber={issueNumber ?? issueId} currentRound={review?.round ?? null} teamRound={review?.teamRound ?? (review && review.status !== "pending" ? 1 : null)} status={review?.status ?? "unsaved"} hasPreview={hasSavedPreview} hasCurrentReviewHtml={hasReviewHtml} launch={launch} rounds={rounds} issues={issues} />
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={copyComments} disabled={copyingComments} title="Copy open review comments and replies" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50">
        {copyingComments ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}{copied === "comments" ? "Comments copied" : "Copy review comments"}
      </button>
      {launch && review && !["pending", "closed"].includes(review.status) && <>
        <button onClick={() => copy("link")} className="inline-flex items-center gap-1.5 text-xs font-semibold"><Copy size={14} />{copied === "link" ? "Link copied" : "Copy review link"}</button>
        <a href={`/admin/workspace/website-review?r=${encodeURIComponent(review!.id)}`} className="text-xs font-semibold text-brand-700">Review threads</a>
      </>}
    </div>
    {review?.status === "pending" && <p role="status" className="rounded-lg border border-line bg-elevated px-4 py-3 text-sm">Draft only — team review is not open yet. {canEdit ? "Save your changes, then choose Open team review when it is ready." : "An editor will open team review when this draft is ready."}</p>}
    {review && review.status !== "closed" && review.status !== "pending" && <NewsletterReviewInvite issueId={issueId} />}
    {canEdit && review?.status !== "closed" && <div className="flex flex-wrap items-start gap-2">
      <label className="flex items-center gap-2 text-xs text-muted">Revision source
        <select value={source} onChange={(event) => setSource(event.target.value as "issue" | "paste")} className="rounded-md border border-line bg-card p-2 text-fg">
          <option value="issue">Current issue</option><option value="paste">Mailchimp HTML</option>
        </select>
      </label>
      <button onClick={() => save()} disabled={busy || (source === "paste" && !paste.trim())} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{!review || review.status === "pending" ? "Save draft" : "Save version"}
      </button>
      {review?.status === "pending" && <button type="button" onClick={() => save("release")} disabled={busy || !code.trim()} className="rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Open team review</button>}
      {review && ["open", "exported"].includes(review.status) && <button type="button" onClick={() => save("next")} disabled={busy || !code.trim() || !hasReviewHtml} className="rounded-md border border-line px-3 py-2 text-xs font-bold disabled:opacity-50">Open next team review</button>}
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => setShowCode(!showCode)} aria-expanded={showCode} aria-controls={`newsletter-code-${issueId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold"><Code2 size={14} />{showCode ? "Hide code" : "View code"}</button>
      <button onClick={() => copy("code")} disabled={!code.trim()} className="inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"><Copy size={14} />{copied === "code" ? "Code copied" : "Copy Mailchimp code"}</button>
    </div>
    {showCode && <textarea id={`newsletter-code-${issueId}`} aria-label="Mailchimp HTML" value={code} readOnly={!canEdit || source !== "paste"} onChange={(event) => setPaste(event.target.value)} rows={6} maxLength={1_000_000} spellCheck={false} className="w-full rounded-md border border-line bg-card p-3 font-mono text-xs" />}
    {commentBrief && <details className="space-y-2"><summary className="cursor-pointer text-xs font-semibold">Review comments</summary><textarea aria-label="Review comments to copy" value={commentBrief} readOnly rows={8} spellCheck={false} className="w-full rounded-md border border-line bg-card p-3 font-mono text-xs" /></details>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!launch && <p className="py-4 text-sm text-muted">{canEdit ? "Ready for review." : "An editor has not opened this issue for review yet."}</p>}
  </section>;
}
