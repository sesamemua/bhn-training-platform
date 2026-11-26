"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, History } from "lucide-react";

/** savedAt = when the version was created. autosaves/fromRound = inline-edit checkpoints folded into it. */
export interface NewsletterRoundSummary { round: number; savedAt: string | null; autosaves?: number; fromRound?: number }
export interface NewsletterIssueChoice { id: string; title: string; dateline: string }

const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A saved-round preview never edits content or opens the review to the team. */
export function NewsletterReviewOverview({ issueId, issueTitle, issueNumber, currentRound, teamRound = null, status, hasPreview, hasCurrentReviewHtml = true, launch, rounds, issues, actions }: {
  issueId: string; issueTitle: string; issueNumber: string; currentRound: number | null; teamRound?: number | null;
  status: string; hasPreview: boolean; launch: string | null;
  hasCurrentReviewHtml?: boolean;
  rounds: NewsletterRoundSummary[]; issues: NewsletterIssueChoice[];
  /** Rendered beside the full-page launcher (e.g. Send review request). */
  actions?: ReactNode;
}) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const historical = selectedRound !== null && selectedRound !== currentRound;
  const previewRound = historical ? selectedRound : hasCurrentReviewHtml ? currentRound : null;
  const base = `/api/workspace/newsletter/${encodeURIComponent(issueId)}/review-preview`;
  const preview = `${base}${previewRound ? `?round=${previewRound}` : ""}`;
  const history = rounds.filter((r) => r.round !== currentRound).sort((a, b) => b.round - a.round);
  const current = rounds.find((r) => r.round === currentRound);
  const rows = currentRound ? [{ round: currentRound, savedAt: current?.savedAt ?? null, autosaves: current?.autosaves, fromRound: current?.fromRound, isCurrent: true }, ...history.map((r) => ({ ...r, isCurrent: false }))] : [];
  const stateLabel = status === "pending" ? "Draft · team review not open" : status === "exported" ? "Feedback exported · round locked" : status === "closed" ? "Closed · read-only" : status === "open" ? "Open for team review" : "Not yet saved for review";

  return <div className="space-y-5">
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
    <div className="grid items-start gap-6 lg:grid-cols-[192px_minmax(0,1fr)_minmax(260px,320px)]">
      {hasPreview ? <a href={historical ? preview : launch ?? preview} target="_blank" rel="noopener noreferrer" aria-label={`Open ${issueTitle}, ${previewRound ? `Version ${previewRound}` : "saved draft"}`} className="block w-48 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
        <div className="pointer-events-none h-72 w-48 overflow-hidden rounded-md border border-line bg-white" aria-hidden="true">
          <iframe key={preview} title={`${issueTitle} — Version ${previewRound ?? "draft"} thumbnail`} src={preview} sandbox="" referrerPolicy="no-referrer" tabIndex={-1} className="h-[900px] w-[600px] origin-top-left scale-[0.32] border-0" />
        </div>
      </a> : <div className="flex h-48 w-48 shrink-0 items-center justify-center rounded-md border border-dashed border-line px-5 text-center text-sm text-muted">No saved preview yet</div>}

      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-2xl font-bold text-fg">{teamRound ? `Team review · Round ${teamRound}` : "Team review not yet open"}</p>
          <p className="mt-1 text-sm text-muted">{stateLabel}{currentRound ? ` · Saved version ${currentRound}` : ""}</p>
        </div>
        {((launch && hasPreview) || actions) && <div className="flex flex-wrap items-start gap-3">
          {launch && hasPreview && <a href={launch} target="_blank" rel="noopener noreferrer" className="newsletter-review-launch"><ExternalLink size={20} aria-hidden="true" />Open full-page review</a>}
          {actions}
        </div>}
        {(status === "pending" || !currentRound) && <p className="max-w-lg text-sm leading-relaxed text-muted">Previewing is private and read-only. It does not open team review or send notifications.</p>}
        {hasPreview && currentRound && !hasCurrentReviewHtml && !historical && <p className="text-xs text-muted">Showing the saved Compose preview; no review version has been saved yet.</p>}
        {historical && <p className="text-sm text-muted" role="status">Previewing Version {selectedRound} · read-only. <a href={preview} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Open this version full-page</a></p>}
      </div>

      <div className="min-w-0" role="group" aria-label="Version history">
        <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
          <span className="inline-flex items-center gap-1.5"><History size={13} aria-hidden="true" />Version history</span>
          {rows.length > 0 && <span className="tabular-nums">{rows.length}</span>}
        </h3>
        {rows.length > 0 && <ol className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-card">
          {rows.map((r) => {
            const selected = r.isCurrent ? !historical : historical && selectedRound === r.round;
            return <li key={r.round} className={`relative flex items-baseline gap-3 px-3 py-2.5 ${selected ? "bg-brand-50" : "hover:bg-elevated"}`}>
              <button type="button" onClick={() => setSelectedRound(r.isCurrent ? null : r.round)} aria-pressed={selected}
                className={`whitespace-nowrap text-left text-[13px] font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand-600 ${selected ? "text-brand-700" : "text-fg"}`}>
                {r.isCurrent ? `Version ${r.round} · Current` : `Version ${r.round}`}
              </button>
              <span className="ml-auto text-right text-[11.5px] leading-snug text-muted tabular-nums">
                {r.savedAt ? when(r.savedAt) : ""}
                {r.autosaves ? <span className="block">{r.fromRound && r.fromRound < r.round ? `v${r.fromRound}–${r.round} · ` : ""}{r.autosaves} inline {r.autosaves === 1 ? "edit" : "edits"}</span> : null}
              </span>
            </li>;
          })}
        </ol>}
        {!history.length && <p className="mt-2 text-xs text-muted">No earlier versions saved yet.</p>}
      </div>
    </div>
  </div>;
}
