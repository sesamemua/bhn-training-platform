"use client";

/**
 * Per-row delete on the admin EQUIP queue (/admin/equip).
 *
 * The delete API and its rule (`canDelete` in src/lib/equip/delete.ts)
 * have existed since the applicant/admin-delete feature shipped — this
 * is the first UI that actually calls it from the admin side. Without
 * it, deleting a test or duplicate application meant knowing the DELETE
 * endpoint existed and calling it by hand.
 *
 * An admin may delete anything, but a DECIDED application with money
 * approved against it (approved/funded, approvedAmount > 0) needs a
 * second, explicit confirmation — deleting it hands that amount back to
 * the applicant's $5,000 cap, which is a decision, not a side effect.
 * The server enforces this (canDelete) regardless of what this button
 * does; the two-step dialog here exists so the consequence is explained
 * BEFORE the server has to say no once already.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteApplicationButton({
  applicationId,
  applicantName,
  status,
  approvedAmount,
}: {
  applicationId: string;
  applicantName: string;
  status: string;
  approvedAmount: number | null;
}) {
  const router = useRouter();
  const { confirmDialog, node } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decided = status === "approved" || status === "funded";
  const affectsCap = decided && (approvedAmount ?? 0) > 0;

  async function runDelete(confirmed: boolean) {
    const res = await fetch(
      `/api/admin/equip/applications/${applicationId}${confirmed ? "?confirm=1" : ""}`,
      { method: "DELETE" },
    );
    const j = (await res.json().catch(() => ({}))) as {
      error?: string; needsConfirm?: boolean;
    };
    return { ok: res.ok, status: res.status, ...j };
  }

  async function onDelete() {
    const ok = await confirmDialog({
      title: `Delete ${applicantName}'s application?`,
      description: affectsCap
        ? `This application is ${status} with $${(approvedAmount ?? 0).toLocaleString()} approved against it — deleting it returns that amount to their funding cap. You'll be asked to confirm that specifically next.`
        : "This permanently removes the application and any attached files. This can't be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
      tone: "destructive",
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      let result = await runDelete(false);

      // The server refuses a cap-affecting delete without an explicit
      // second confirm — surface ITS reason text (exact dollar amount,
      // exact consequence) rather than reusing the generic dialog above.
      if (!result.ok && result.needsConfirm) {
        const confirmedCap = await confirmDialog({
          title: "This changes their funding cap",
          description: result.error ?? "Confirm to proceed.",
          confirmLabel: "Delete anyway",
          cancelLabel: "Cancel",
          tone: "destructive",
        });
        if (!confirmedCap) { setBusy(false); return; }
        result = await runDelete(true);
      }

      if (!result.ok) {
        setError(result.error ?? `Delete failed (HTTP ${result.status}).`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        title={`Delete ${applicantName}'s application`}
        aria-label={`Delete ${applicantName}'s application`}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-rose-500/70 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
      {error && (
        <span className="ml-1 text-[10px] font-medium text-rose-600" role="alert">
          {error}
        </span>
      )}
      {node}
    </span>
  );
}
