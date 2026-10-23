"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, ExternalLink, Loader2, Mail, RefreshCw, Save, Send, X } from "lucide-react";
import { loadTrainingEmailReview, saveTrainingEmailReview, sendTrainingEmailReviewInvites } from "@/app/(dashboard)/admin/workspace/training-admin/email-review-actions";
import { newsletterReviewTeam } from "@/lib/newsletter/review-invites";
import { trainingEmailReviewLink, type TrainingEmailReviewBundle } from "@/lib/training-week/email-review";

type Group = { id: string; label: string; userIds: string[]; available: boolean };
const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50";

export function TrainingEmailReview({ eventId }: { eventId: string }) {
  const [bundle, setBundle] = useState<TrainingEmailReviewBundle | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviting, setInviting] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState("editorial");
  const [delivered, setDelivered] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const review = bundle?.review;
  const group = groups.find((item) => item.id === selected);
  const recipients = group?.available ? group.userIds.filter((id) => !delivered.includes(id)) : [];
  const link = trainingEmailReviewLink(eventId);

  function refresh() {
    start(async () => {
      setError("");
      try {
        const result = await loadTrainingEmailReview(eventId);
        if (result.ok) setBundle(result.bundle); else setError(result.error);
      } catch { setError("Could not load the email review. Try again."); }
    });
  }
  useEffect(() => { refresh(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const result = await saveTrainingEmailReview({ eventId, round: review?.round });
    if (!result.ok) { setError(result.error); return false; }
    setBundle(result.bundle); setDelivered([]);
    return true;
  }

  function requestReview() {
    start(async () => {
      setError(""); setMessage("");
      try {
        if (!review && !await save()) return;
        const result = await newsletterReviewTeam();
        setGroups(result.groups); setInviting(true);
        if (result.error) setError(result.error);
      } catch { setError("Could not prepare the review request. Try again."); }
    });
  }

  function send() {
    if (!review) return;
    start(async () => {
      setError(""); setMessage("");
      try {
        const result = await sendTrainingEmailReviewInvites({ eventId, round: review.round, userIds: recipients });
        setDelivered((current) => [...new Set([...current, ...result.sent])]);
        if (result.error) setError(result.error);
        if (result.sent.length) setMessage(`Review request sent to ${result.sent.length} colleague${result.sent.length === 1 ? "" : "s"}.`);
      } catch { setError("Could not confirm delivery. Check with colleagues before retrying."); }
    });
  }

  return <section aria-label="Workshop email review" className="mb-5 space-y-3 border-b border-line pb-5">
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto min-w-0"><h2 className="text-base font-bold">Check-in email review</h2>
        {bundle && <p className="text-xs text-muted">{bundle.emailCount} emails · {bundle.workshopCount} workshops{review && ` · Round ${review.round}`}{bundle.stale && " · Draft changed"}</p>}
      </div>
      <button type="button" onClick={refresh} disabled={pending} title="Refresh review status" aria-label="Refresh review status" className="p-2 disabled:opacity-50"><RefreshCw size={16} /></button>
      {review && <>
        <a href={link} target="_blank" rel="noopener noreferrer" className={BUTTON}><ExternalLink size={16} />Open review</a>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(new URL(link, window.location.origin).href).then(() => setMessage("Review link copied."), () => setError("Could not copy the link. Use Open review.")); }} className={BUTTON}><Copy size={16} />Copy link</button>
        <button type="button" disabled={pending || !bundle?.stale || review.status === "closed"} onClick={() => start(async () => { setError(""); setMessage(""); try { if (await save()) setMessage("Revision saved."); } catch { setError("Could not save the revision. Refresh before retrying."); } })} className={BUTTON}><Save size={16} />Save revision</button>
      </>}
      <button type="button" onClick={requestReview} disabled={pending || !bundle || !!bundle.stale || review?.status === "closed"} aria-expanded={inviting} aria-controls={`training-email-invite-${eventId}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">{pending ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}Request review</button>
    </div>
    {bundle?.issues.map((issue) => <p key={issue} className="text-sm text-amber-700">{issue}</p>)}
    {inviting && <div id={`training-email-invite-${eventId}`} className="max-w-xl space-y-3 rounded-lg bg-elevated/60 p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Send review request</h3><button type="button" disabled={pending} onClick={() => setInviting(false)} aria-label="Close review request" className="p-1"><X size={16} /></button></div>
      <fieldset disabled={pending} className="space-y-2"><legend className="sr-only">Review recipients</legend>
        {groups.map((item) => <label key={item.id} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm ${selected === item.id ? "bg-brand-500/10" : "bg-card/50"} ${!item.available ? "opacity-50" : "cursor-pointer"}`}>
          <input type="radio" name={`training-email-review-${eventId}`} disabled={!item.available} checked={selected === item.id} onChange={() => { setSelected(item.id); setMessage(""); setError(""); }} />
          <span className="min-w-0 break-words">{item.label}{!item.available && <span className="block text-xs text-muted">A team account is unavailable</span>}</span>
        </label>)}
      </fieldset>
      <button type="button" onClick={send} disabled={pending || !recipients.length || !review || !!bundle?.stale} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send size={16} />{delivered.length && recipients.length ? "Retry unsent" : "Send"}{recipients.length ? ` to ${recipients.length}` : ""}</button>
    </div>}
    {message && <p role="status" className="text-sm text-fg">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
