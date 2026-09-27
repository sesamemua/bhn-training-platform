"use client";

/**
 * "Already started? Email me my link."
 *
 * For somebody who began an application and no longer has the tab. The
 * reply is the same whether or not a draft exists — the link goes to
 * the inbox, and only the inbox's owner learns the answer.
 */
import { useState } from "react";
import { Loader2, Mail } from "lucide-react";

export function ResumeByEmail() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fetch("/api/public/equip/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
      setSaid(j.message ?? j.error ?? "Could not send it just now.");
    } catch {
      setSaid("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-card p-4">
      <p className="text-[13px] font-semibold text-fg">Already started an application?</p>
      <p className="mt-0.5 text-[12px] text-muted">
        Enter the address you started with and we will email you the link back to it — no need to start again.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) void send(); }}
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-[14rem] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !email.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-fg hover:bg-elevated disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Email me my link
        </button>
      </div>
      {said && <p role="status" className="mt-2 text-[12.5px] text-fg">{said}</p>}
    </div>
  );
}
