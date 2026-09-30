"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useInputDialog } from "@/components/ui/InputDialog";

const ROLES = ["trainee", "evaluating", "employer", "hr", "industrial_mentor", "instructor", "admin", "superadmin"];

interface UserData {
  id: string;
  name: string | null;
  role: string;
  isActive: boolean;
  credits: number;
}

export function UserRowClient({ user }: { user: UserData }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const { inputDialog, node: inputNode } = useInputDialog();

  async function patch(data: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
    setLoading(false);
  }

  async function deleteUser() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Couldn't delete.");
        setConfirming(false);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function grantCredits() {
    const amtStr = await inputDialog({ title: "Grant credits", label: "Amount", placeholder: "e.g. 10", confirmLabel: "Grant" });
    const amt = parseFloat(amtStr ?? "");
    if (isNaN(amt) || amt <= 0) return;
    setLoading(true);
    await fetch("/api/admin/credits/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, amount: amt }),
    });
    router.refresh();
    setLoading(false);
  }

  async function resetPassword() {
    const pw = await inputDialog({ title: "Reset password", label: "New password", confirmLabel: "Update" });
    if (pw === null) return;
    if (pw.length < 6) return setError("Password must be at least 6 characters.");
    await patch({ password: pw });
    await confirmDialog({ title: "Password updated.", acknowledgeOnly: true });
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {confirmNode}
      {inputNode}
      <select
        value={user.role}
        disabled={loading}
        onChange={(e) => patch({ role: e.target.value })}
        className="text-xs border border-line rounded px-1.5 py-1 bg-card"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <button
        onClick={() => patch({ isActive: !user.isActive })}
        disabled={loading}
        className="text-xs px-2 py-1 rounded border border-line hover:bg-elevated"
      >
        {user.isActive ? "Deactivate" : "Activate"}
      </button>
      <button
        onClick={grantCredits}
        disabled={loading}
        className="text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-50"
      >
        +Credits
      </button>
      <button
        onClick={resetPassword}
        disabled={loading}
        className="text-xs px-2 py-1 rounded border border-line hover:bg-elevated"
      >
        Reset PW
      </button>

      {/* Delete — two-click confirm so an accidental tap can't drop a
          row. First click flips to "Are you sure?"; second commits.
          Wrapping containers (e.g. the user list page) can refresh on
          success via router.refresh which we already trigger. */}
      {confirming ? (
        <span className="inline-flex items-center gap-1 rounded ring-1 ring-rose-300 bg-rose-50 px-1.5 py-0.5">
          <span className="text-[11px] font-bold text-rose-900">Delete?</span>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="text-[10px] text-rose-800 hover:text-rose-950"
          >
            cancel
          </button>
          <button
            onClick={deleteUser}
            disabled={loading}
            className="text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded px-1.5 py-0.5"
          >
            {loading ? "…" : "Yes"}
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
          title="Permanently delete this user + every owned row (cascades)"
        >
          Delete
        </button>
      )}

      {error && (
        <span className="inline-block text-[11px] text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded px-2 py-0.5">
          {error}
        </span>
      )}
    </div>
  );
}
