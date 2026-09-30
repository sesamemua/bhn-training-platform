"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Clock, ArrowUp, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

type Decision = "approve" | "reject" | "waitlist" | "promote" | "reopen" | "withdraw";

interface Props {
  id: string;
  status: string;
}

export function PathwayEnrollmentDecideButtons({ id, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function decide(d: Decision, withModal = false) {
    if (withModal && !note.trim()) {
      // For modal-bound decisions, require a note
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pathway-enrollments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: d, note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        await confirmDialog({ title: j.error ?? "Action failed", acknowledgeOnly: true });
        return;
      }
      setModal(null);
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Per-status action set
  const actions: Array<{
    decision: Decision;
    label: string;
    icon: React.ElementType;
    tone: "primary" | "ghost" | "danger";
    needsNote?: boolean;
  }> = [];
  if (status === "pending") {
    actions.push(
      { decision: "approve", label: "Approve", icon: Check, tone: "primary" },
      { decision: "waitlist", label: "Move to waitlist", icon: Clock, tone: "ghost" },
      { decision: "reject", label: "Reject", icon: X, tone: "danger", needsNote: true },
    );
  } else if (status === "waitlisted") {
    actions.push(
      { decision: "promote", label: "Promote to approved", icon: ArrowUp, tone: "primary" },
      { decision: "reject", label: "Remove from waitlist", icon: X, tone: "danger", needsNote: true },
    );
  } else if (status === "rejected") {
    actions.push(
      { decision: "reopen", label: "Reopen", icon: RotateCcw, tone: "ghost" },
      { decision: "approve", label: "Approve anyway", icon: Check, tone: "primary" },
    );
  } else if (status === "approved") {
    actions.push(
      { decision: "withdraw", label: "Withdraw", icon: X, tone: "danger", needsNote: true },
    );
  } else {
    return <span className="text-xs text-subtle">—</span>;
  }

  return (
    <>
      {confirmNode}
      <div className="flex items-center gap-1.5 flex-wrap">
        {actions.map((a) => {
          const Icon = a.icon;
          const cls =
            a.tone === "primary" ? "bg-brand-600 hover:bg-brand-700 text-white" :
            a.tone === "danger"  ? "bg-card border border-line hover:border-rose-300 hover:text-rose-700 text-muted" :
                                   "bg-card border border-line hover:border-line-strong text-muted hover:text-fg";
          return (
            <button
              key={a.decision}
              onClick={() => a.needsNote ? setModal(a.decision) : decide(a.decision)}
              disabled={busy}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${cls}`}
            >
              <Icon size={12} className="inline mr-1" />
              {a.label}
            </button>
          );
        })}
      </div>

      <Modal
        open={modal !== null}
        onClose={() => !busy && setModal(null)}
        size="sm"
        title={modal === "reject" ? "Reject this request?" : modal === "withdraw" ? "Withdraw this enrollment?" : "Add a note"}
        description={
          modal === "reject"
            ? "Trainees see your note on their pathway page so they understand why."
            : modal === "withdraw"
              ? "The trainee will lose access to this pathway. They can re-apply later if eligible."
              : ""
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              variant={modal === "reject" || modal === "withdraw" ? "danger" : "primary"}
              onClick={() => modal && decide(modal, true)}
              loading={busy}
              disabled={note.trim().length < 4}
            >
              Confirm
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
        </Field>
      </Modal>
    </>
  );
}
