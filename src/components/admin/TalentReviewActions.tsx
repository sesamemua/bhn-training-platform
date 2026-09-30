"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, XCircle, FastForward, AlertCircle, Loader2,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useInputDialog } from "@/components/ui/InputDialog";

export type TalentReviewStatus =
  | "pending"
  | "approved"
  | "approved_skip_review"
  | "rejected";

export interface ReviewableSubmission {
  id: string;
  reviewStatus: TalentReviewStatus;
}

/**
 * Inline per-row review actions for talent-application submissions.
 *
 * Three actions:
 *   • Approve         — standard pass; submission joins talent pool
 *   • Skip approval   — admin fast-path; same effect as Approve but
 *                       flagged in audit ("approved_skip_review").
 *                       Confirmation required to discourage routine use.
 *   • Reject          — closes out; reviewer note prompted.
 *
 * After a successful review the row's chip updates optimistically
 * and we call router.refresh() so other surfaces (filters, counts)
 * pick up the change.
 */
export function TalentReviewActions({
  slug,
  submission,
}: {
  slug: string;
  submission: ReviewableSubmission;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [status, setStatus] = useState<TalentReviewStatus>(submission.reviewStatus);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const { inputDialog, node: inputNode } = useInputDialog();

  async function review(action: "approve" | "skip" | "reject") {
    let note: string | null = null;
    if (action === "skip") {
      const ok = await confirmDialog({
        title: "Skip approval and add this submission directly to the talent pool?",
        description:
          "Use this only when you're confident the submission qualifies " +
          "without queue review. The action is audit-logged separately " +
          "from standard approvals.",
        confirmLabel: "Skip approval",
        tone: "warning",
      });
      if (!ok) return;
    } else if (action === "reject") {
      note = await inputDialog({
        title: "Reason for rejection?",
        description: "Shown to the applicant. Leave blank to skip.",
        label: "Reason",
        confirmLabel: "Reject",
        allowEmpty: true,
      });
      // null on cancel — bail. Empty string = "no note" and proceeds.
      if (note === null) return;
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/forms/${slug}/submissions/${submission.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note: note || undefined }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        submission?: { reviewStatus: TalentReviewStatus };
      };
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      const newStatus = data.submission?.reviewStatus ?? "pending";
      setStatus(newStatus);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (status === "pending") {
    return (
      <div className="flex items-center gap-1 flex-nowrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => startTransition(() => { void review("approve"); })}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded disabled:opacity-50"
          title="Approve — adds to talent pool"
        >
          {busy ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => startTransition(() => { void review("skip"); })}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50 px-2 py-1 rounded disabled:opacity-50"
          title="Skip approval — fast-track, audit-logged"
        >
          <FastForward size={10} />
          Skip
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => startTransition(() => { void review("reject"); })}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded disabled:opacity-50"
          title="Reject — does not enter talent pool"
        >
          <XCircle size={10} />
          Reject
        </button>
        {error && (
          <span className="inline-flex items-center gap-1 text-[10px] text-rose-700">
            <AlertCircle size={9} /> {error}
          </span>
        )}
        {confirmNode}
        {inputNode}
      </div>
    );
  }

  return <ReviewStatusChip status={status} />;
}

export function ReviewStatusChip({ status }: { status: TalentReviewStatus }) {
  const meta: Record<TalentReviewStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    pending: {
      label: "Pending",
      cls: "bg-amber-100 text-amber-800 ring-amber-200",
      icon: <Loader2 size={9} />,
    },
    approved: {
      label: "Approved",
      cls: "bg-emerald-100 text-emerald-800 ring-emerald-200",
      icon: <CheckCircle2 size={9} />,
    },
    approved_skip_review: {
      label: "Skip-approved",
      cls: "bg-amber-100 text-amber-900 ring-amber-200",
      icon: <FastForward size={9} />,
    },
    rejected: {
      label: "Rejected",
      cls: "bg-rose-100 text-rose-800 ring-rose-200",
      icon: <XCircle size={9} />,
    },
  };
  const m = meta[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full ring-1 ring-inset ${m.cls}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}
