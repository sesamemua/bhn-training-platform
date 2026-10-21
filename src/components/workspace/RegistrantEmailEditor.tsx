"use client";

import { useState } from "react";
import { Loader2, Mail, Save, X } from "lucide-react";
import { addRegistrantEmail } from "@/app/(dashboard)/admin/workspace/training-admin/email-actions";

export function RegistrantEmailEditor({ id, name, onSaved }: { id: string; name: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
    {!open ? <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-brand-600 hover:bg-brand-500/10" aria-label={`Add email for ${name}`}><Mail size={13} /> Add email</button> : <form className="flex max-w-full flex-wrap items-center gap-1.5" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { const result = await addRegistrantEmail(id, email); if (!result.ok) setError(result.problem ?? "Couldn't save."); else { setOpen(false); onSaved(); } }
      catch { setError("Couldn't save. Please retry."); }
      finally { setBusy(false); }
    }}>
      <input type="email" required maxLength={254} autoFocus aria-label={`Email address for ${name}`} value={email} disabled={busy} onChange={e => setEmail(e.target.value)} className="w-56 max-w-full rounded-md border border-line bg-card-solid px-2 py-1 text-sm text-fg" />
      <button type="submit" disabled={busy} aria-label={`Save email for ${name}`} title="Save email" className="rounded p-1 text-brand-600 disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}</button>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); }} aria-label="Cancel email entry" title="Cancel" className="rounded p-1 text-muted"><X size={15} /></button>
      {error && <span role="alert" className="basis-full text-xs text-rose-700 dark:text-rose-300">{error}</span>}
    </form>}
  </span>;
}
