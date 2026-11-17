"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { newsletterReviewTeam } from "@/lib/newsletter/review-invites";

export function ReviewGroupInvite({ send, disabled = false }: {
  send: (ids: string[]) => Promise<{ sent: string[]; error?: string }>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof newsletterReviewTeam>>["groups"]>([]);
  const [selected, setSelected] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = groups.find((item) => item.id === selected);
  const recipients = group?.available ? group.userIds.filter((id) => !sent.includes(id)) : [];
  return <div className="space-y-2 text-sm">
    <button type="button" aria-expanded={open} disabled={disabled || busy} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={async () => {
      if (open) { setOpen(false); return; }
      setOpen(true); setBusy(true); setError("");
      try { const result = await newsletterReviewTeam(); setGroups(result.groups); setError(result.error ?? ""); }
      catch { setError("Could not load the groups."); } finally { setBusy(false); }
    }}><Mail size={14} />Send review request</button>
    {open && <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 gap-1">Reviewer group
        <select value={selected} disabled={busy || disabled} onChange={(event) => setSelected(event.target.value)} className="w-full rounded-md border border-line bg-card px-2 py-1.5">
          <option value="">Choose a group</option>
          {groups.map((g) => <option key={g.id} value={g.id} disabled={!g.available}>{g.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy || disabled || !recipients.length} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={async () => {
        setBusy(true); setError("");
        try { const result = await send(recipients); setSent((prev) => [...new Set([...prev, ...result.sent])]); setError(result.error ?? ""); }
        catch { setError("Could not confirm delivery. Check sent history before retrying."); } finally { setBusy(false); }
      }}><Send size={13} />{busy ? "Working..." : recipients.length ? `Send to ${recipients.length}` : "Send"}</button>
      {sent.length > 0 && <p role="status">Sent to {sent.length} colleagues.</p>}
    </div>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
  </div>;
}
