"use client";

import { useState } from "react";
import { Loader2, Mail, Send, X } from "lucide-react";
import { newsletterReviewTeam, sendNewsletterReviewInvites } from "@/lib/newsletter/review-invites";

export function NewsletterReviewInvite({ issueId }: { issueId: string }) {
  const [open, setOpen] = useState(false);
  const [colleagues, setColleagues] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function show() {
    setOpen(true); setBusy(true); setError(null);
    try {
      const result = await newsletterReviewTeam();
      setColleagues(result.colleagues);
      setError(result.error ?? null);
    } catch { setError("Could not load colleagues. Please try again."); }
    finally { setBusy(false); }
  }

  async function send() {
    setBusy(true); setError(null); setMessage("");
    try {
      const result = await sendNewsletterReviewInvites({ issueId, userIds: selected });
      setSelected((current) => current.filter((id) => !result.sent.includes(id)));
      setError(result.error ?? null);
      if (result.sent.length) setMessage(`Review link sent to ${result.sent.length} colleague${result.sent.length === 1 ? "" : "s"}.`);
    } catch { setError("Could not confirm delivery. Check with recipients before retrying."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3">
    <button type="button" onClick={() => open ? setOpen(false) : void show()} aria-expanded={open} aria-controls={`newsletter-invite-${issueId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold"><Mail size={14} />Send review link</button>
    {open && <section id={`newsletter-invite-${issueId}`} aria-label="Send newsletter review link" className="max-w-lg space-y-3 rounded-lg bg-elevated/60 p-4">
      <div className="flex items-center gap-3"><h3 className="mr-auto text-sm font-semibold">Choose colleagues</h3><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Close invitations" className="p-1"><X size={16} /></button></div>
      <fieldset disabled={busy} className="max-h-52 space-y-2 overflow-y-auto">
        <legend className="sr-only">Review recipients</legend>
        {colleagues.map((who) => <label key={who.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(who.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, who.id] : current.filter((id) => id !== who.id))} />
          <span className="min-w-0 break-words">{who.name || who.email}{who.name && <span className="block text-xs text-muted">{who.email}</span>}</span>
        </label>)}
        {!busy && !colleagues.length && !error && <p className="text-sm text-muted">No active colleagues found.</p>}
      </fieldset>
      <button type="button" onClick={send} disabled={busy || selected.length === 0 || selected.length > 20} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send{selected.length ? ` to ${selected.length}` : ""}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-brand-700">{message}</p>}
    </section>}
  </div>;
}
