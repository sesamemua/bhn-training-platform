"use client";

/**
 * The reason, and the button. Asks once more before releasing — a
 * released place can go to somebody else and is not simply undone.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { WITHDRAW_MIN_CHARS, withdrawProblem } from "@/lib/training-week/check-in";

export function CantAttendForm({ token, bookingId }: { token: string; bookingId: string }) {
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problem = withdrawProblem(reason);
  const left = Math.max(0, WITHDRAW_MIN_CHARS - reason.trim().length);

  async function send() {
    if (problem) { setError(problem); return; }
    if (!sure) { setSure(true); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/public/training-week/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, bookingId, reason }),
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
        Thank you — your place has been released and the team has your reason. We have emailed you a confirmation.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <label htmlFor="reason" className="text-[13px] font-semibold">Why can&apos;t you make it?</label>
      <textarea
        id="reason"
        rows={5}
        value={reason}
        onChange={(e) => { setReason(e.target.value); setError(null); setSure(false); }}
        placeholder="For example: my supervisor has scheduled a lab meeting that morning that I have to attend."
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-slate-500"
      />
      <p className="text-[12px] text-slate-500">{left > 0 ? `${left} more characters, please.` : "Thank you."}</p>
      {error && <p role="alert" className="mt-1 text-[13px] font-semibold text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold text-white disabled:opacity-60 ${
          sure ? "bg-rose-700 hover:bg-rose-800" : "bg-slate-900 hover:bg-slate-800"
        }`}
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {sure ? "Yes, release my place" : "Tell BioHubNet I can't make it"}
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
