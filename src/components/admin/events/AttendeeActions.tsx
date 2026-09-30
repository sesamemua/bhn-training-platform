"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Circle, XCircle, RotateCcw, Mail, Loader2, AlertCircle, Trash2, Check,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Top-of-page action buttons for /admin/events/[slug]/registrations/[rid].
 *
 *   • Check-in toggle — POST .../check-in
 *   • Cancel / Reinstate — PATCH ...{registrationStatus}
 *   • Resend confirmation email — POST .../resend-email
 *
 * Each action shows a small inline flash on success and an inline
 * error chip on failure. router.refresh() pulls the latest data
 * after any mutation so the rest of the page (status chip,
 * workshop list) stays in sync.
 */
export function AttendeeActions({
  slug,
  registrationId,
  attendeeName,
  initialCheckedInAt,
  initialStatus,
}: {
  slug: string;
  registrationId: string;
  attendeeName: string;
  initialCheckedInAt: string | null;
  initialStatus: "pending" | "confirmed" | "cancelled";
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [checkedIn, setCheckedIn] = useState<boolean>(initialCheckedInAt !== null);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const cancelled = status === "cancelled";

  function setFlashAuto(s: string) {
    setFlash(s);
    setTimeout(() => setFlash(null), 3500);
  }

  async function toggleCheckIn() {
    const desired = !checkedIn;
    setError(null);
    setCheckedIn(desired); // optimistic
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${registrationId}/check-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkedIn: desired }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Toggle failed");
      setFlashAuto(desired ? "Checked in." : "Check-in cleared.");
      router.refresh();
    } catch (e) {
      setCheckedIn(!desired); // roll back
      setError((e as Error).message);
    }
  }

  async function approveRegistration() {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${registrationId}/approve`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadyConfirmed?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      setStatus("confirmed");
      setFlashAuto(
        data.alreadyConfirmed
          ? "Already confirmed."
          : "Approved — registration confirmed.",
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelRegistration() {
    if (!(await confirmDialog({
      title: `Cancel ${attendeeName}'s registration?`,
      description: "This will release every workshop booking they hold for the event and promote waitlisters into the freed spots. This action is reversible (you can reinstate them later) but their workshop bookings will NOT auto-restore.",
      confirmLabel: "Cancel registration",
      cancelLabel: "Keep",
      tone: "warning",
    }))) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${registrationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationStatus: "cancelled" }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        cancelMeta?: { cancelledBookings: number; promoted: number } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      setStatus("cancelled");
      const meta = data.cancelMeta;
      setFlashAuto(
        meta && meta.cancelledBookings > 0
          ? `Cancelled — ${meta.cancelledBookings} booking${meta.cancelledBookings === 1 ? "" : "s"} released${meta.promoted > 0 ? `, ${meta.promoted} waitlister${meta.promoted === 1 ? "" : "s"} promoted` : ""}.`
          : "Registration cancelled.",
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reinstateRegistration() {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${registrationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationStatus: "confirmed" }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reinstate failed");
      setStatus("confirmed");
      setFlashAuto("Reinstated as confirmed. Workshop bookings were not restored.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /**
   * Hard-delete the registration. Distinct from Cancel:
   *   • Cancel keeps the row as soft-cancelled so it can be
   *     reinstated and the audit trail survives.
   *   • Delete wipes the row entirely. Used for duplicates,
   *     fraudulent records, or PIPEDA right-to-deletion requests.
   * Confirmation is deliberately stronger than the cancel one —
   * this is the destructive path with no in-app undo (admin would
   * have to recreate the registration from scratch).
   */
  async function deleteRegistration() {
    if (!(await confirmDialog({
      title: `PERMANENTLY DELETE ${attendeeName}'s registration?`,
      description: "This can't be undone from the UI. The attendee's workshop bookings and breakout picks will be released and any waitlisters promoted. For a soft-cancel that keeps the row recoverable, use Cancel instead.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${registrationId}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        cancelMeta?: { cancelledBookings: number; promoted: number } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      const meta = data.cancelMeta;
      const detail = meta && meta.cancelledBookings > 0
        ? ` — ${meta.cancelledBookings} booking${meta.cancelledBookings === 1 ? "" : "s"} released${meta.promoted > 0 ? `, ${meta.promoted} waitlister${meta.promoted === 1 ? "" : "s"} promoted` : ""}`
        : "";
      setFlashAuto(`Registration deleted${detail}. Redirecting…`);
      // The page we're on is keyed on the registration id we just
      // deleted — pop back to the queue so the admin doesn't sit on
      // a 404.
      setTimeout(() => router.push(`/admin/events/${slug}/registrations`), 800);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resendEmail() {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${registrationId}/resend-email`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sentTo?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Email send failed");
      setFlashAuto(`Email sent to ${data.sentTo ?? "attendee"}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pending = status === "pending";

  return (
    <div className="flex flex-wrap gap-2 items-start">
      {confirmNode}
      {pending && (
        <button
          type="button"
          disabled={busy}
          onClick={() => startTransition(() => { void approveRegistration(); })}
          title="Approve this pending registration — confirms the symposium-day spot"
          className="admin-glow inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 ring-1 ring-inset bg-emerald-600 text-white ring-emerald-500 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check size={12} /> Approve registration
        </button>
      )}

      <button
        type="button"
        disabled={busy || cancelled || pending}
        onClick={() => startTransition(() => { void toggleCheckIn(); })}
        title={pending ? "Approve registration before checking in." : cancelled ? "Reinstate registration before checking in." : ""}
        className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 ring-1 ring-inset transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          checkedIn
            ? "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200"
            : "bg-card text-fg ring-line hover:bg-elevated"
        }`}
      >
        {checkedIn ? <CheckCircle2 size={12} /> : <Circle size={12} />}
        {checkedIn ? "Checked in" : "Check in"}
      </button>

      {cancelled ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => startTransition(() => { void reinstateRegistration(); })}
          className="inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 ring-1 ring-inset bg-card text-emerald-700 ring-line hover:bg-emerald-50 hover:ring-emerald-200 disabled:opacity-50"
        >
          <RotateCcw size={12} /> Reinstate
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => startTransition(() => { void cancelRegistration(); })}
          className="inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 ring-1 ring-inset bg-card text-rose-700 ring-line hover:bg-rose-50 hover:ring-rose-200 disabled:opacity-50"
        >
          <XCircle size={12} /> Cancel registration
        </button>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => startTransition(() => { void resendEmail(); })}
        className="inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 ring-1 ring-inset bg-card text-fg ring-line hover:bg-elevated disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
        Resend email
      </button>

      {/* Destructive: outright deletion. Distinct from cancel; tuned
          stronger (deeper rose, explicit "permanently" label) so the
          admin reads it as the no-undo path. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => startTransition(() => { void deleteRegistration(); })}
        className="admin-glow inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 ring-1 ring-inset bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100 hover:ring-rose-300 disabled:opacity-50"
      >
        <Trash2 size={12} /> Delete permanently
      </button>

      <div className="basis-full" />

      {error && (
        <div className="inline-flex items-start gap-2 text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2 max-w-md">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {flash && (
        <div className="inline-flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 ring-1 ring-inset ring-emerald-200 rounded-lg px-3 py-2 max-w-md">
          <CheckCircle2 size={11} className="mt-0.5 shrink-0" />
          {flash}
        </div>
      )}
    </div>
  );
}
