"use client";

/**
 * Above an unsubmitted public application: where the link is, and when
 * the draft goes.
 *
 * The link in the address bar is the only way back into this draft.
 * People did not know that, closed the tab, and started again — so this
 * says it, says the date, and offers to email the link.
 */
import { useState } from "react";
import { Clock, Loader2, Mail } from "lucide-react";

export function DraftLinkBar({
  token, email, expiresAt,
}: { token: string; email: string; expiresAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [until, setUntil] = useState(expiresAt);

  const by = until
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long" }).format(new Date(until))
    : null;

  async function send() {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fetch("/api/public/equip/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string; expiresAt?: string };
      setSaid(j.message ?? j.error ?? "Could not send it just now.");
      if (j.expiresAt) setUntil(j.expiresAt);
    } catch {
      setSaid("Could not reach the server. Bookmark this page instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-sky-500/35 bg-sky-500/[0.07] px-4 py-3 text-[13px] leading-relaxed text-sky-950">
      <p className="flex items-start gap-2">
        <Mail size={15} className="mt-0.5 shrink-0 text-sky-700" />
        <span>
          {until ? (
            <>We have emailed the link to this page to <strong>{email}</strong>. It is the only way back to your application — your answers save as you go.</>
          ) : (
            <>Keep the link to this page — it is the only way back to your application. Your answers save as you go.</>
          )}
        </span>
      </p>
      {by && (
        <p className="mt-1.5 flex items-start gap-2 font-semibold text-sky-900">
          <Clock size={15} className="mt-0.5 shrink-0 text-sky-700" />
          <span>Please submit by {by}. Unsubmitted applications are removed after that, along with anything uploaded.</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-white/70 px-3 py-1.5 text-[12.5px] font-semibold text-sky-900 hover:bg-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
          {until ? "Email me the link again" : `Email the link to ${email}`}
        </button>
        {said && <span role="status" className="text-[12.5px]">{said}</span>}
      </div>
    </div>
  );
}
