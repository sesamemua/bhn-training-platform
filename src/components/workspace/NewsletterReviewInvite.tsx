"use client";

import { useState } from "react";
import { Loader2, Mail, Send, X } from "lucide-react";
import { newsletterReviewTeam, sendNewsletterReviewInvites } from "@/lib/newsletter/review-invites";

export function NewsletterReviewInvite({ issueId }: { issueId: string }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<{ id: string; label: string; userIds: string[]; available: boolean }[]>([]);
  const [selected, setSelected] = useState("editorial");
  const [delivered, setDelivered] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function show() {
    setOpen(true); setBusy(true); setError(null);
    try {
      const result = await newsletterReviewTeam();
      setGroups(result.groups);
      setError(result.error ?? null);
    } catch { setError("Could not load colleagues. Please try again."); }
    finally { setBusy(false); }
  }

  async function send() {
    setBusy(true); setError(null); setMessage("");
    try {
      const result = await sendNewsletterReviewInvites({ issueId, userIds: recipients });
      setDelivered((current) => [...current, ...result.sent]);
      setError(result.error ?? null);
      if (result.sent.length) setMessage(`Review link sent to ${result.sent.length} colleague${result.sent.length === 1 ? "" : "s"}.`);
    } catch { setError("Could not confirm delivery. Check with recipients before retrying."); }
    finally { setBusy(false); }
  }

  const group = groups.find((item) => item.id === selected);
  const recipients = group?.available ? group.userIds.filter((id) => !delivered.includes(id)) : [];

  return <div className="space-y-3">
    <button type="button" onClick={() => open ? setOpen(false) : void show()} aria-expanded={open} aria-controls={`newsletter-invite-${issueId}`} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-brand-600 px-6 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><Mail size={22} />Send review request</button>
    {open && <section id={`newsletter-invite-${issueId}`} aria-label="Send newsletter review link" className="max-w-lg space-y-3 rounded-lg bg-elevated/60 p-4">
      <div className="flex items-center gap-3"><h3 className="mr-auto text-sm font-semibold">Send review request</h3><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Close invitations" className="p-1"><X size={16} /></button></div>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="sr-only">Review recipients</legend>
        {groups.map((item) => <label key={item.id} className={`flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-sm ${selected === item.id ? "bg-brand-500/10" : "bg-card/50"} ${!item.available ? "opacity-50" : "cursor-pointer"}`}>
          <input type="radio" name={`newsletter-recipients-${issueId}`} disabled={!item.available} checked={selected === item.id} onChange={() => { setSelected(item.id); setDelivered([]); setMessage(""); setError(null); }} />
          <span className="min-w-0 break-words">{item.label}{!item.available && <span className="block text-xs text-muted">A team account is unavailable</span>}</span>
        </label>)}
      </fieldset>
      <button type="button" onClick={send} disabled={busy || recipients.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}{delivered.length && recipients.length ? "Retry unsent" : "Send"}{recipients.length ? ` to ${recipients.length}` : ""}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-brand-700">{message}</p>}
    </section>}
  </div>;
}
