"use client";

import { useId, useState } from "react";
import { Copy, ExternalLink, History, Mail, Send } from "lucide-react";
import { REPORT_API, REPORT_REVIEW_PATH } from "@/lib/symposium-report/document";
import { newsletterReviewTeam } from "@/lib/newsletter/review-invites";
import { reportReviewHistory, reportReviewRecipients, sendReportReviewInvites, type ReportInviteSent } from "@/lib/symposium-report/review-invites";
import styles from "./report.module.css";

export function ReportReviewShare({ round, revision, canInvite }: {
  round: number; revision: string; canInvite: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<{ id: string; label: string }[]>([]);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof newsletterReviewTeam>>["groups"]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [delivered, setDelivered] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [manualLink, setManualLink] = useState("");
  const [history, setHistory] = useState<ReportInviteSent[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function loadHistory() {
    try {
      const result = await reportReviewHistory();
      setHistory(result.sent);
      if (result.error) setError(result.error);
    } catch { setError("Could not load the sent history. Try again."); }
  }

  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next) { setHistory(null); void loadHistory(); }
  }

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
    setOpen(true); setBusy(true); setError(""); setStatus(""); setSelected([]); setRecipients([]); setGroups([]); setDelivered([]);
    try {
      const [result, team] = await Promise.all([reportReviewRecipients(), newsletterReviewTeam().catch(() => null)]);
      setRecipients(result.recipients);
      setGroups(team?.groups ?? []);
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
      setDelivered((current) => [...current, ...result.sent]);
      if (result.sent.length) setStatus(`Review request sent to ${result.sent.length} colleague${result.sent.length === 1 ? "" : "s"}.`);
      setError(result.error ?? "");
      if (result.sent.length && showHistory) void loadHistory();
    } catch { setError("Could not confirm delivery. Check with reviewers before retrying."); }
    finally { setBusy(false); }
  }

  return <section className={styles.reviewShare} aria-label="Share report for review">
    <div className={styles.actions}>
      <a href={REPORT_REVIEW_PATH} target="_blank" rel="noopener noreferrer" className="newsletter-review-launch"><ExternalLink size={18} aria-hidden />Open full-page review</a>
      <button type="button" onClick={async () => {
        setError(""); setStatus("");
        try {
          const response = await fetch(`${REPORT_API}/review?brief=1`);
          const result = await response.json();
          if (!response.ok || !result.ok || typeof result.brief !== "string") throw new Error();
          await navigator.clipboard.writeText(result.brief);
          setStatus("Review comments copied.");
        } catch { setError("Could not copy review comments. Try again."); }
      }}><Copy size={15} aria-hidden /> Copy review comments</button>
      <button type="button" onClick={() => void copy()}><Copy size={15} aria-hidden /> Copy review link</button>
      <button type="button" disabled={busy || (!canInvite && !open)} onClick={() => void openInvite()}
        aria-expanded={open} aria-controls={id}
        title={!canInvite && !open ? "Save changes and open the current round to send requests." : undefined}>
        <Mail size={15} aria-hidden /> {open ? "Close email request" : "Email review request"}
      </button>
      <button type="button" onClick={toggleHistory} aria-expanded={showHistory} aria-controls={`${id}-history`}>
        <History size={15} aria-hidden /> {showHistory ? "Hide sent history" : "Sent history"}
      </button>
      <span className={styles.status}>Staff sign-in required. Opens the saved draft.</span>
    </div>
    {manualLink && <label className={styles.reviewLink}>Copy this review link
      <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
    </label>}
    {open && <form id={id} className={styles.reviewInvite} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <fieldset disabled={busy || !canInvite}>
        <legend>Choose reviewers for Round {round}</legend>
        {groups.length > 0 && <label className={styles.reviewJump}>Reviewer group
          <select value="" onChange={(event) => {
            const group = groups.find((item) => item.id === event.target.value && item.available);
            if (group) setSelected(group.userIds.filter((id) => !delivered.includes(id) && recipients.some((recipient) => recipient.id === id)));
          }}>
            <option value="">Choose a preset or select individually</option>
            {groups.map((group) => <option key={group.id} value={group.id} disabled={!group.available}>{group.label}</option>)}
          </select>
        </label>}
        {recipients.length ? <div className={styles.reviewRecipients}>
          {recipients.map(({ id: userId, label }) => <label key={userId}>
            <input type="checkbox" checked={selected.includes(userId)}
              disabled={delivered.includes(userId) || (!selected.includes(userId) && selected.length >= 20)}
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
    {showHistory && <div id={`${id}-history`} className={styles.reviewHistory}>
      {history === null ? <p className={styles.status}>Loading…</p>
        : history.length === 0 ? <p className={styles.status}>No review emails sent yet.</p>
        : <table>
          <caption>Review emails sent ({history.length})</caption>
          <thead><tr><th scope="col">Sent</th><th scope="col">To</th><th scope="col">Round</th><th scope="col">By</th></tr></thead>
          <tbody>{history.map((row, i) => <tr key={`${row.at}-${i}`}>
            <td><time dateTime={row.at}>{new Date(row.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</time></td>
            <td title={row.email}>{row.to}</td>
            <td>{row.round ?? "—"}</td>
            <td>{row.by}</td>
          </tr>)}</tbody>
        </table>}
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {status && <p className={styles.status} role="status">{status}</p>}
  </section>;
}
