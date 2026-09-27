"use client";

/**
 * Tell the drafts that were never told. Asks first — it emails real
 * applicants — and says what the email does: gives them their link and
 * starts their two weeks.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";

export function NotifyDraftsButton({ untold }: { untold: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  if (untold === 0) return null;

  async function go() {
    const n = `${untold} applicant${untold === 1 ? "" : "s"}`;
    if (!confirm(`Email ${n} the link to their unsubmitted application?\n\nEach gets their own link and a date two weeks from today. Drafts still unsubmitted after that are removed.`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/equip/drafts/notify", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { sent?: number; failed?: number; error?: string };
      setSaid(j.error ?? `Sent ${j.sent ?? 0}${j.failed ? ` · ${j.failed} could not be sent` : ""}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[12px] font-semibold text-amber-800 hover:bg-amber-500/20 disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
        Email the link to {untold} draft{untold === 1 ? "" : "s"} never told
      </button>
      {said && <span role="status" className="text-[12px] text-fg">{said}</span>}
    </span>
  );
}
