"use client";
import { useState } from "react";
import { RotateCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * One-click "reset form schema to default" for admins. Overwrites the
 * live EventForm.fields with whatever the source seed currently
 * defines. Use after extending the schema in code so the live form
 * picks up new options without manual edits.
 */
export function FormReseedButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"ok" | "err" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function go() {
    if (!(await confirmDialog({
      title: "Reset this form's schema to the source default?",
      description: "This overwrites any custom field edits you've made via the inline form editor.",
      confirmLabel: "Reset",
      tone: "warning",
    }))) return;
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await fetch(`/api/admin/forms/${slug}/reseed`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? "Reseed failed");
        setDone("err");
        return;
      }
      setDone("ok");
      router.refresh();
    } finally {
      setBusy(false);
      setTimeout(() => setDone(null), 3000);
    }
  }

  return (
    <>
    {confirmNode}
    <button
      onClick={go}
      disabled={busy}
      className="text-xs font-medium px-3 py-2 rounded-lg border border-line text-muted hover:bg-elevated hover:text-fg inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors"
      title="Overwrite the live form schema with the latest source seed (use after extending options in code)"
    >
      {done === "ok" ? (
        <CheckCircle2 size={12} className="text-emerald-600" />
      ) : done === "err" ? (
        <AlertCircle size={12} className="text-rose-600" />
      ) : (
        <RotateCw size={12} className={busy ? "animate-spin" : ""} />
      )}
      {done === "ok" ? "Schema reset" : err ? err : "Reset schema"}
    </button>
    </>
  );
}
