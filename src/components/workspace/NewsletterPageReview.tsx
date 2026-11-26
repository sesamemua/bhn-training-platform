"use client";

import { useState, type ReactNode } from "react";
import { Code2, Copy, Link2, Loader2, MessagesSquare, Save } from "lucide-react";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { NewsletterReviewInvite } from "./NewsletterReviewInvite";
import { getNewsletterReviewComments } from "@/lib/newsletter/review-comments";
import { NewsletterReviewOverview, type NewsletterRoundSummary, type NewsletterIssueChoice } from "./NewsletterReviewOverview";

interface Review { id: string; round: number; status: string; teamRound?: number | null }

export function NewsletterPageReview({ issueId, html, initialReview, canEdit, initialPaste = "", issueTitle = "Newsletter", issueNumber, initialRounds = [], issues = [], initialHasSavedPreview, initialHasReviewHtml, children }: {
  issueId: string; html: string; initialReview: Review | null; canEdit: boolean; initialPaste?: string;
  issueTitle?: string; issueNumber?: string; initialRounds?: NewsletterRoundSummary[]; issues?: NewsletterIssueChoice[];
  initialHasSavedPreview?: boolean;
  initialHasReviewHtml?: boolean;
  /** Footer row inside the tools card (sign-off). */
  children?: ReactNode;
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
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/workspace/newsletter/${encodeURIComponent(issueId)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action !== "save" ? action : review ? "revise" : "open", html: code, round: review?.round, ...(action !== "save" ? { teamRound: review?.teamRound ?? (action === "next" ? 1 : 0) } : {}) }),
      });
      const result = await response.json();
      if (!response.ok || !result.review) throw new Error(result.error ?? "Could not save the review.");
      if (review && result.review.round > review.round) {
        const now = new Date().toISOString();
        setRounds((current) => [...(current.some((r) => r.round === review.round) ? current : [...current, { round: review.round, savedAt: null }]), { round: result.review.round, savedAt: now }]);
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

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-card px-3 text-xs font-semibold text-fg transition-colors hover:bg-elevated disabled:opacity-50";
  const primary = "inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-xs font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50";
  const active = !!review && !["pending", "closed"].includes(review.status);
  const row = (label: string, body: ReactNode) => <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
    <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{body}</div>
  </div>;

  return <section className="min-w-0 space-y-5" aria-label="Newsletter review">
    <NewsletterReviewOverview issueId={issueId} issueTitle={issueTitle} issueNumber={issueNumber ?? issueId} currentRound={review?.round ?? null} teamRound={review?.teamRound ?? (review && review.status !== "pending" ? 1 : null)} status={review?.status ?? "unsaved"} hasPreview={hasSavedPreview} hasCurrentReviewHtml={hasReviewHtml} launch={launch} rounds={rounds} issues={issues}
      actions={active ? <NewsletterReviewInvite issueId={issueId} /> : null} />
    {review?.status === "pending" && <p role="status" className="rounded-lg border border-line bg-elevated px-4 py-3 text-sm">Draft only — team review is not open yet. {canEdit ? "Save your changes, then choose Open team review when it is ready." : "An editor will open team review when this draft is ready."}</p>}
    <div className="divide-y divide-line rounded-xl border border-line bg-card">
      {row("Share", <>
        {active && <button type="button" onClick={() => copy("link")} className={btn}><Link2 size={14} />{copied === "link" ? "Link copied" : "Copy review link"}</button>}
        <button type="button" onClick={copyComments} disabled={copyingComments} title="Copy open review comments and replies" className={btn}>
          {copyingComments ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}{copied === "comments" ? "Comments copied" : "Copy review comments"}
        </button>
        {active && <a href={`/admin/workspace/website-review?r=${encodeURIComponent(review!.id)}`} className={btn}><MessagesSquare size={14} />Review threads</a>}
      </>)}
      {commentBrief && <details className="px-4 py-3"><summary className="cursor-pointer text-xs font-semibold">Review comments</summary><textarea aria-label="Review comments to copy" value={commentBrief} readOnly rows={8} spellCheck={false} className="mt-2 w-full rounded-md border border-line bg-card p-3 font-mono text-xs" /></details>}
      {canEdit && review?.status !== "closed" && row("Revise", <>
        <label className="flex items-center gap-2 text-xs text-muted">Source
          <select value={source} onChange={(event) => setSource(event.target.value as "issue" | "paste")} className="h-9 rounded-md border border-line bg-card px-2 text-xs text-fg">
            <option value="issue">Current issue</option><option value="paste">Mailchimp HTML</option>
          </select>
        </label>
        <button type="button" onClick={() => save()} disabled={busy || (source === "paste" && !paste.trim())} className={primary}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{!review || review.status === "pending" ? "Save draft" : "Save version"}
        </button>
        {review?.status === "pending" && <button type="button" onClick={() => save("release")} disabled={busy || !code.trim()} className={btn}>Open team review</button>}
        {review && ["open", "exported"].includes(review.status) && <ConfirmPopover align="start" message="Open the saved version for the next team review?" detail="No invitations are sent." confirmLabel="Open next round" onConfirm={() => void save("next")}>
          {(open) => <button type="button" onClick={open} disabled={busy || !code.trim() || !hasReviewHtml} className={btn}>Open next team review</button>}
        </ConfirmPopover>}
      </>)}
      {row("Mailchimp", <>
        <button type="button" onClick={() => setShowCode(!showCode)} aria-expanded={showCode} aria-controls={`newsletter-code-${issueId}`} className={btn}><Code2 size={14} />{showCode ? "Hide code" : "View code"}</button>
        <button type="button" onClick={() => copy("code")} disabled={!code.trim()} className={btn}><Copy size={14} />{copied === "code" ? "Code copied" : "Copy Mailchimp code"}</button>
      </>)}
      {showCode && <div className="px-4 py-3"><textarea id={`newsletter-code-${issueId}`} aria-label="Mailchimp HTML" value={code} readOnly={!canEdit || source !== "paste"} onChange={(event) => setPaste(event.target.value)} rows={8} maxLength={1_000_000} spellCheck={false} className="w-full rounded-md border border-line bg-card p-3 font-mono text-xs" /></div>}
      {error && <p role="alert" className="px-4 py-3 text-sm text-red-600">{error}</p>}
      {!launch && <p className="px-4 py-3 text-sm text-muted">{canEdit ? "Ready for review." : "An editor has not opened this issue for review yet."}</p>}
      {children && <div className="px-4 py-3 empty:hidden [&>*]:border-0 [&>*]:pt-0">{children}</div>}
    </div>
  </section>;
}
