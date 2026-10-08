"use client";

/** The one tap that checks somebody in to their session. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function SelfCheckInButton({ token, bookingId }: { token: string; bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/public/training-week/self-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, bookingId }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setError(j.error ?? "That did not go through. Please try again.");
      else router.refresh(); // the page says what happened
    } catch {
      setError("No connection. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {error && <p role="alert" className="mb-1 text-[13px] font-semibold text-rose-700">{error}</p>}
      <button type="button" onClick={send} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-[15px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
        {busy && <Loader2 size={16} className="animate-spin" />} Check me in
      </button>
    </div>
  );
}
