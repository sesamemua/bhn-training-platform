"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";

const ROLE_RANK: Record<string, number> = {
  trainee: 0, evaluating: 0, instructor: 1, admin: 2, superadmin: 3,
};

interface Props {
  id: string;
  status: string;
  toRole: string;
  reviewerRole: string;
}

export function RoleRequestRow({ id, status, toRole, reviewerRole }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending") {
    return <span className="text-xs text-subtle">—</span>;
  }

  const targetRank = ROLE_RANK[toRole] ?? 0;
  const reviewerRank = ROLE_RANK[reviewerRole] ?? 0;
  const canApprove = targetRank < ROLE_RANK.admin || reviewerRank >= ROLE_RANK.superadmin;

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/role-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Action failed");
        return;
      }
      setMode("none");
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => { setError(null); setMode("approve"); }}
          disabled={busy || !canApprove}
          title={canApprove ? "Approve" : "Superadmin approval required"}
          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 transition-colors"
        >
          <Check size={12} className="inline mr-1" />Approve
        </button>
        <button
          onClick={() => { setError(null); setMode("reject"); }}
          disabled={busy}
          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-card border border-line hover:border-rose-300 hover:text-rose-700 text-muted transition-colors"
        >
          <X size={12} className="inline mr-1" />Reject
        </button>
      </div>

      <Modal
        open={mode === "approve"}
        onClose={() => setMode("none")}
        size="sm"
        title={`Approve change to ${toRole}?`}
        description="The user's role will update immediately. They'll see the new tier on their next page load."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            <Button onClick={() => decide("approve")} loading={busy}>Approve</Button>
          </>
        }
      >
        <Field label="Note for the user" hint="Optional. Visible on their profile page.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
        {error && <p role="alert" className="text-sm text-rose-700 mt-2">{error}</p>}
      </Modal>

      <Modal
        open={mode === "reject"}
        onClose={() => setMode("none")}
        size="sm"
        title="Reject role-change request?"
        description="The user keeps their current role. Your note will be shown to them so they understand why."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            <Button variant="danger" onClick={() => decide("reject")} loading={busy} disabled={note.trim().length < 4}>Reject</Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
        </Field>
        {error && <p role="alert" className="text-sm text-rose-700 mt-2">{error}</p>}
      </Modal>
    </>
  );
}
