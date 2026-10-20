"use client";

import { useState } from "react";
import { Code2, Copy, ExternalLink, Loader2, MessageSquareText, Save } from "lucide-react";

interface Review { id: string; round: number; status: string }

export function NewsletterPageReview({ issueId, html, initialReview, canEdit, initialPaste = "" }: {
  issueId: string; html: string; initialReview: Review | null; canEdit: boolean; initialPaste?: string;
}) {
  const [review, setReview] = useState(initialReview);
  const [source, setSource] = useState<"issue" | "paste">(initialPaste ? "paste" : "issue");
  const [paste, setPaste] = useState(initialPaste);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [showCode, setShowCode] = useState(false);
  const code = source === "paste" ? paste : html;
  const launch = review ? `/api/workspace/page-review/${encodeURIComponent(review.id)}/launch` : null;

  async function save() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/workspace/newsletter/${encodeURIComponent(issueId)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: review ? "revise" : "open", html: source === "paste" ? paste : html, round: review?.round }),
      });
      const result = await response.json();
      if (!response.ok || !result.review) throw new Error(result.error ?? "Could not save the review.");
      setReview(result.review);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the review."); }
    finally { setBusy(false); }
  }

  async function copy(kind: "link" | "code") {
    if (kind === "link" && !launch) return;
    try {
      await navigator.clipboard.writeText(kind === "code" ? code : new URL(launch!, window.location.origin).href);
      setCopied(kind); window.setTimeout(() => setCopied(null), 2000);
    } catch { setError(kind === "code" ? "Could not copy the code. Open View code to select it." : "Could not copy the link. Use Open full-page review instead."); }
  }

  return <section className="min-w-0 space-y-3" aria-label="Newsletter review">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="mr-auto flex items-center gap-2 text-sm font-bold" title="Saved newsletter HTML version"><MessageSquareText size={16} />{review ? `Version ${review.round}` : "Newsletter review"}</h2>
      {launch && <>
        <a href={launch} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white"><ExternalLink size={14} />Open full-page review</a>
        <button onClick={() => copy("link")} className="inline-flex items-center gap-1.5 text-xs font-semibold"><Copy size={14} />{copied === "link" ? "Link copied" : "Copy review link"}</button>
        <a href={`/admin/workspace/website-review?r=${encodeURIComponent(review!.id)}`} className="text-xs font-semibold text-brand-700">Threads &amp; revision rounds</a>
      </>}
    </div>
    {canEdit && review?.status !== "closed" && <div className="flex flex-wrap items-start gap-2">
      <label className="flex items-center gap-2 text-xs text-muted">Revision source
        <select value={source} onChange={(event) => setSource(event.target.value as "issue" | "paste")} className="rounded-md border border-line bg-card p-2 text-fg">
          <option value="issue">Current issue</option><option value="paste">Mailchimp HTML</option>
        </select>
      </label>
      <button onClick={save} disabled={busy || (source === "paste" && !paste.trim())} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{review ? "Save revision" : "Start review"}
      </button>
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => setShowCode(!showCode)} aria-expanded={showCode} aria-controls={`newsletter-code-${issueId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold"><Code2 size={14} />{showCode ? "Hide code" : "View code"}</button>
      <button onClick={() => copy("code")} disabled={!code.trim()} className="inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"><Copy size={14} />{copied === "code" ? "Code copied" : "Copy Mailchimp code"}</button>
    </div>
    {showCode && <textarea id={`newsletter-code-${issueId}`} aria-label="Mailchimp HTML" value={code} readOnly={!canEdit || source !== "paste"} onChange={(event) => setPaste(event.target.value)} rows={6} maxLength={1_000_000} spellCheck={false} className="w-full rounded-md border border-line bg-card p-3 font-mono text-xs" />}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!launch && <p className="py-4 text-sm text-muted">{canEdit ? "Ready for review." : "An editor has not opened this issue for review yet."}</p>}
  </section>;
}
