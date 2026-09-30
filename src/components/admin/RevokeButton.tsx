"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export function RevokeButton({ certId, revoked }: { certId: string; revoked: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function toggle() {
    if (
      !(await confirmDialog(
        revoked
          ? { title: "Reinstate this certificate?", confirmLabel: "Reinstate" }
          : { title: "Revoke this certificate?", confirmLabel: "Revoke", tone: "destructive" },
      ))
    )
      return;
    setLoading(true);
    await fetch(`/api/admin/certificates/${certId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoke: !revoked }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <>
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-xs px-2 py-1 rounded border ${
        revoked
          ? "border-green-200 text-green-700 hover:bg-green-50"
          : "border-red-200 text-red-600 hover:bg-red-50"
      }`}
    >
      {revoked ? "Reinstate" : "Revoke"}
    </button>
    {confirmNode}
    </>
  );
}
