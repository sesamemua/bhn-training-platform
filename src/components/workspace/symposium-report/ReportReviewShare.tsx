"use client";

import { useId, useState } from "react";
import { Copy, Mail, Send } from "lucide-react";
import { REPORT_REVIEW_PATH } from "@/lib/symposium-report/document";
import { reportReviewRecipients, sendReportReviewInvites } from "@/lib/symposium-report/review-invites";
import styles from "./report.module.css";

export function ReportReviewShare({ round, revision, canInvite }: {
  round: number; revision: string; canInvite: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<{ id: string; label: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [manualLink, setManualLink] = useState("");

  async function copy() {
    const link = new URL(REPORT_REVIEW_PATH, window.location.origin).href;
    setError(""); setStatus("");
    try {
      await navigator.clipboard.writeText(link);
      setManualLink("");
      setStatus("Review link copied.");
    } catch { setManualLink(link); }
  }

  async function openInvite() {
    if (open) { setOpen(false); return; }
    setOpen(true); setBusy(true); setError(""); setStatus(""); setSelected([]); setRecipients([]);
    try {
      const result = await reportReviewRecipients();
      setRecipients(result.recipients);
      setError(result.error ?? "");
    } catch { setError("Could not load staff reviewers. Close this panel and try again."); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!canInvite || busy || !selected.length) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await sendReportReviewInvites({ round, revision, userIds: selected });
      setSelected((current) => current.filter((id) => !result.sent.includes(id)));
      if (result.sent.length) setStatus(`Review request sent to ${result.sent.length} colleague${result.sent.length === 1 ? "" : "s"}.`);
      setError(result.error ?? "");
    } catch { setError("Could not confirm delivery. Check with reviewers before retrying."); }
    finally { setBusy(false); }
  }

  return <section className={styles.reviewShare} aria-label="Share report for review">
    <div className={styles.actions}>
      <button type="button" onClick={() => void copy()}><Copy size={15} aria-hidden /> Copy review link</button>
      <button type="button" disabled={busy || (!canInvite && !open)} onClick={() => void openInvite()}
        aria-expanded={open} aria-controls={id}
        title={!canInvite && !open ? "Save changes and open the current round to send requests." : undefined}>
        <Mail size={15} aria-hidden /> {open ? "Close email request" : "Email review request"}
      </button>
      <span className={styles.status}>Staff sign-in required. Opens the saved draft.</span>
    </div>
    {manualLink && <label className={styles.reviewLink}>Copy this review link
      <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
    </label>}
    {open && <form id={id} className={styles.reviewInvite} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <fieldset disabled={busy || !canInvite}>
        <legend>Choose reviewers for Round {round}</legend>
        {recipients.length ? <div className={styles.reviewRecipients}>
          {recipients.map(({ id: userId, label }) => <label key={userId}>
            <input type="checkbox" checked={selected.includes(userId)}
              disabled={!selected.includes(userId) && selected.length >= 20}
              onChange={(event) => setSelected((current) => event.target.checked ? [...current, userId] : current.filter((id) => id !== userId))} />
            {label}
          </label>)}
        </div> : !busy && !error && <p className={styles.status}>No eligible staff accounts found.</p>}
      </fieldset>
      <div className={styles.actions}>
        <button type="submit" disabled={busy || !canInvite || selected.length === 0}>
          <Send size={15} aria-hidden /> {busy ? "Working…" : selected.length ? `Send to ${selected.length}` : "Send review request"}
        </button>
      </div>
      {!canInvite && <p className={styles.status}>Save the current draft before sending requests.</p>}
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {status && <p className={styles.status} role="status">{status}</p>}
  </section>;
}
