"use client";
/**
 * Operator panel at the bottom of /admin/equip. Seeds and clears
 * the demo applicants used by the dashboard cuts above. Pattern
 * mirrors AssistAdminTools so admins who use both surfaces feel
 * at home on either.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Beaker, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export function EquipDemoTools() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function run(label: string, method: "POST" | "DELETE") {
    if (method === "DELETE" && !(await confirmDialog({
      title: "Delete every demo applicant (equip-demo-*@bhn.test) and the applications they own?",
      description: "Real users are untouched.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setBusy(label);
    setResult(null);
    try {
      const res = await fetch("/api/admin/equip/demo/seed", { method });
      const j = await res.json().catch(() => ({}));
      setResult(JSON.stringify(j, null, 2));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-dashed border-line bg-elevated/30 p-4 space-y-3">
      {confirmNode}
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle inline-flex items-center gap-1.5">
        <Beaker size={11} className="text-amber-600" />
        Demo data — only for this page
      </p>
      <p className="text-[11px] text-muted leading-snug">
        Spins up six demo applicants spanning every status (draft, submitted,
        under review, approved, rejected, funded) so /admin/equip renders
        meaningfully even on a fresh deploy. Clear at any time.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy === "seed"}
          onClick={() => run("seed", "POST")}
          className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-amber-600/25 transition-colors"
        >
          {busy === "seed" ? <Loader2 size={11} className="animate-spin" /> : <Beaker size={11} />}
          Seed demo applications
        </button>
        <button
          type="button"
          disabled={busy === "clear"}
          onClick={() => run("clear", "DELETE")}
          className="inline-flex items-center gap-1.5 bg-card-solid hover:bg-elevated border border-line text-fg text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          {busy === "clear" ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          Clear demo data
        </button>
      </div>
      {result && (
        <pre className="text-[10px] font-mono bg-fg text-background p-3 rounded-lg overflow-x-auto max-h-40">
{result}
        </pre>
      )}
    </section>
  );
}
