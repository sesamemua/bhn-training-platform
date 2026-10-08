"use client";

/**
 * The cancel button. No reason is asked for. It asks once more before
 * releasing — a released place can go to somebody else and is not simply
 * undone.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function CantAttendForm({ token, bookingId }: { token: string; bookingId: string }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/public/training-week/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, bookingId }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setError(j.error ?? "That did not go through. Please try again."); setSure(false); return; }
      setDone(true);
    } catch {
      setError("No connection. Please try again in a moment.");
      setSure(false);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-[14px] leading-relaxed text-emerald-900">
        Your place has been cancelled and released. We have emailed you a confirmation.
      </p>
    );
  }

  return (
    <div className="mt-3">
      {error && <p role="alert" className="mb-1 text-[13px] font-semibold text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold text-white disabled:opacity-60 ${
          sure ? "bg-rose-700 hover:bg-rose-800" : "bg-slate-900 hover:bg-slate-800"
        }`}
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {sure ? "Yes, cancel my place" : "Cancel my place"}
      </button>
      {sure && !busy && (
        <p className="mt-2 text-center text-[12.5px] text-slate-600">
          Your place will go to somebody else. Press again to confirm, or{" "}
          <button type="button" className="underline" onClick={() => setSure(false)}>keep my place</button>.
        </p>
      )}
    </div>
  );
}
