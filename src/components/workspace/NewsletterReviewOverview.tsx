"use client";

import { useState } from "react";
import { ExternalLink, History } from "lucide-react";

export interface NewsletterRoundSummary { round: number; savedAt: string | null }
export interface NewsletterIssueChoice { id: string; title: string; dateline: string }

/** A saved-round preview never edits content or opens the review to the team. */
export function NewsletterReviewOverview({ issueId, issueTitle, issueNumber, currentRound, status, hasPreview, hasCurrentReviewHtml = true, launch, rounds, issues }: {
  issueId: string; issueTitle: string; issueNumber: string; currentRound: number | null;
  status: string; hasPreview: boolean; launch: string | null;
  hasCurrentReviewHtml?: boolean;
  rounds: NewsletterRoundSummary[]; issues: NewsletterIssueChoice[];
}) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const historical = selectedRound !== null && selectedRound !== currentRound;
  const previewRound = historical ? selectedRound : hasCurrentReviewHtml ? currentRound : null;
  const base = `/api/workspace/newsletter/${encodeURIComponent(issueId)}/review-preview`;
  const preview = `${base}${previewRound ? `?round=${previewRound}` : ""}`;
  const history = [...rounds].filter((r) => r.round !== currentRound).sort((a, b) => b.round - a.round);
  const stateLabel = status === "pending" ? "Draft · team review not open" : status === "exported" ? "Feedback exported · round locked" : status === "closed" ? "Closed · read-only" : status === "open" ? "Open for team review" : "Not yet saved for review";

  return <div className="space-y-5 border-b border-line pb-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Issue {issueNumber}</p>
        <h2 className="mt-1 text-xl font-bold text-fg">{issueTitle}</h2>
      </div>
      {issues.length > 1 && <form action="/admin/workspace/marketing/newsletter/review" method="get" className="min-w-0 max-w-full"><label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted">Switch issue
        <select name="issue" defaultValue={issueId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="max-w-full rounded-md border border-line bg-card p-2 text-sm text-fg">
          {issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}
        </select>
      </label></form>}
    </div>
    <div className="flex flex-col items-start gap-5 sm:flex-row sm:gap-7">
      {hasPreview ? <a href={historical ? preview : launch ?? preview} target="_blank" rel="noopener noreferrer" aria-label={`Open ${issueTitle}, ${previewRound ? `Round ${previewRound}` : "saved draft"}`} className="block shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
        <div className="pointer-events-none h-72 w-48 overflow-hidden border border-line bg-white" aria-hidden="true">
          <iframe key={preview} title={`${issueTitle} — Round ${previewRound ?? "draft"} thumbnail`} src={preview} sandbox="" referrerPolicy="no-referrer" tabIndex={-1} className="h-[900px] w-[600px] origin-top-left scale-[0.32] border-0" />
        </div>
      </a> : <div className="flex h-48 w-48 shrink-0 items-center justify-center border border-dashed border-line px-5 text-center text-sm text-muted">No saved preview yet</div>}
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <p className="text-2xl font-bold text-fg">{currentRound ? `Revision Round ${currentRound}` : "Ready for a first revision"}</p>
          <p className="mt-1 text-sm text-muted">{stateLabel}</p>
        </div>
        {launch && hasPreview && <a href={launch} target="_blank" rel="noopener noreferrer" className="newsletter-review-launch"><ExternalLink size={20} aria-hidden="true" />Open full-page review</a>}
        {(status === "pending" || !currentRound) && <p className="max-w-lg text-sm leading-relaxed text-muted">Previewing is private and read-only. It does not open team review or send notifications.</p>}
        {hasPreview && currentRound && !hasCurrentReviewHtml && !historical && <p className="text-xs text-muted">Showing the saved Compose preview; no HTML has been saved for this review round yet.</p>}
        <div className="space-y-2" aria-label="Revision history">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><History size={15} aria-hidden="true" />Revision history</h3>
          {currentRound ? <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedRound(null)} aria-pressed={!historical} className={`rounded-md border px-3 py-2 text-xs font-semibold ${!historical ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line text-muted hover:text-fg"}`}>Round {currentRound} · Current</button>
            {history.map((r) => <button type="button" key={r.round} onClick={() => setSelectedRound(r.round)} aria-pressed={historical && selectedRound === r.round} title={r.savedAt ? `Archived ${new Date(r.savedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}` : "Saved historical version"} className={`rounded-md border px-3 py-2 text-xs font-semibold ${historical && selectedRound === r.round ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line text-muted hover:text-fg"}`}>Round {r.round}</button>)}
          </div> : null}
          {!history.length && <p className="text-xs text-muted">No earlier rounds saved yet.</p>}
          {historical && <p className="text-sm text-muted" role="status">Previewing Round {selectedRound} · read-only. <a href={preview} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Open this round full-page</a></p>}
        </div>
      </div>
    </div>
  </div>;
}
