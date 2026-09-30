"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function BuddyEndButton({ pairId }: { pairId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/buddy/${pairId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "end" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Action failed");
        return;
      }
      router.push("/buddy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-muted hover:text-rose-700 inline-flex items-center gap-1"
      >
        <LogOut size={12} /> End buddy
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        size="sm"
        title="End this buddy relationship?"
        description="Both of you will lose progress visibility. Past messages are preserved but archived. You can pair again later if you want."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={end} loading={busy}>End buddy</Button>
          </>
        }
      >
        <p className="text-sm text-muted">This action ends the pair for both sides.</p>
        {error && <p role="alert" className="text-sm text-rose-700 mt-2">{error}</p>}
      </Modal>
    </>
  );
}
