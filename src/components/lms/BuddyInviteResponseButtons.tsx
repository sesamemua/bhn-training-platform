"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export function BuddyInviteResponseButtons({ pairId }: { pairId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/buddy/${pairId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Action failed");
        return;
      }
      if (decision === "accept") router.push(`/buddy/${pairId}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <button
        onClick={() => decide("accept")}
        disabled={busy}
        className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60 transition-colors flex items-center gap-1.5"
      >
        <Check size={13} /> Accept
      </button>
      <button
        onClick={() => decide("decline")}
        disabled={busy}
        className="text-xs font-medium px-4 py-2 rounded-lg bg-card border border-line text-muted hover:border-line-strong hover:text-fg transition-colors flex items-center gap-1.5"
      >
        <X size={13} /> Decline
      </button>
      {error && <p role="alert" className="text-[11px] text-rose-700 max-w-[10rem]">{error}</p>}
    </div>
  );
}
