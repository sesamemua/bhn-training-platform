"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail, Send, X } from "lucide-react";
import { printRequestDetails, requestPrint, type PrintRequestRecord } from "@/lib/events/print-requests";

const INPUT = "mt-1 w-full min-w-0 rounded-md border border-line bg-card-solid px-2.5 py-2 text-sm text-fg";
const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-elevated disabled:opacity-40";
const when = (at: string) => new Date(at).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PrintRequest({ jobId, ready, initialNote }: { jobId: string; ready: boolean; initialNote: string }) {
  const [open, setOpen] = useState(false), [pending, startTransition] = useTransition();
  const [colleagues, setColleagues] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [requests, setRequests] = useState<PrintRequestRecord[]>([]);
  const [recipientId, setRecipientId] = useState(""), [note, setNote] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try {
        const result = await printRequestDetails(jobId);
        if (active) { setColleagues(result.colleagues); setRequests(result.requests); setError(result.error ?? ""); }
      } catch { if (active) setError("Could not load print colleagues and request history. Refresh to retry."); }
    });
    return () => { active = false; };
  }, [jobId]);

  return <section aria-label="Colleague print requests" className="space-y-2">
    {ready && <button type="button" className={BUTTON} aria-expanded={open} onClick={() => { setOpen(!open); setNotice(""); }}><Mail size={14} /> Ask colleague to print</button>}
    {open && ready && <form className="space-y-3 border-y border-line py-3" onSubmit={event => {
      event.preventDefault();
      if (pending) return;
      const requestId = crypto.randomUUID();
      startTransition(async () => {
        setError(""); setNotice("");
        try {
          const result = await requestPrint({ jobId, recipientId, note, requestId });
          if (result.sent) {
            setRequests(previous => [result.sent!, ...previous]);
            setNotice(result.warning ?? `Print request emailed to ${result.sent.name}.`);
            setOpen(false); setNote("");
          } else setError(result.error ?? "Could not send the print request.");
        } catch { setError("Delivery could not be confirmed. Check the request history and with your colleague before resending."); }
      });
    }}>
      <label className="block text-xs">Colleague<select className={INPUT} value={recipientId} onChange={event => setRecipientId(event.target.value)} required disabled={pending}>
        <option value="">Choose a colleague</option>
        {colleagues.map(who => <option key={who.id} value={who.id}>{who.name || who.email} ({who.email})</option>)}
      </select></label>
      <label className="block text-xs">Your note<textarea className={INPUT} rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Where to leave the copies, deadline, or other instructions" disabled={pending} /></label>
      {initialNote && <p className="whitespace-pre-wrap text-xs text-muted">Batch notes also included: {initialNote}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BUTTON + " bg-brand text-white"} disabled={pending || !recipientId}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send print request</button>
        <button type="button" className={BUTTON} disabled={pending} onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
      </div>
    </form>}
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-200">{notice}</p>}
    {!!requests.length && <details className="text-xs"><summary className="cursor-pointer text-muted">Print requests ({requests.length}) · Latest: {requests[0].name} · {when(requests[0].at)}</summary>
      <ol className="divide-y divide-line">{requests.map(request => <li key={request.id} className="py-2">
        <p><strong>{request.name}</strong> · {request.status === "sent" ? "Email sent" : "Delivery unconfirmed"}</p>
        <p className="text-muted">{request.by} · {when(request.at)} · {request.to}</p>
        {request.note && <p className="mt-1 whitespace-pre-wrap break-words">{request.note}</p>}
      </li>)}</ol>
    </details>}
  </section>;
}
