"use client";

import { useState } from "react";
import { History } from "lucide-react";
import type { ReviewSend } from "@/lib/page-review/staff-history";

export function ReviewSentHistory({ load }: { load: () => Promise<ReviewSend[]> }) {
  const [sent, setSent] = useState<ReviewSend[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <details className="min-w-0 text-sm" onToggle={async (event) => {
    if (!event.currentTarget.open) return;
    setBusy(true); setError(false);
    try { setSent(await load()); } catch { setError(true); } finally { setBusy(false); }
  }}>
    <summary className="cursor-pointer font-semibold"><History size={14} className="mr-1.5 inline" aria-hidden />Sent history</summary>
    {busy ? <p role="status">Loading...</p> : error ? <p role="alert">Could not load sent history. Close and reopen to retry.</p>
      : sent.length ? <ul className="mt-2 max-h-64 space-y-2 overflow-auto">
        {sent.map((item) => <li key={item.id} className="break-words"><strong>{item.to}</strong>{item.round ? ` · Round ${item.round}` : ""}<br />
          <span className="text-muted">{new Date(item.at).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })} · {item.by}</span></li>)}
      </ul> : <p className="mt-2 text-muted">No recorded review emails.</p>}
  </details>;
}
