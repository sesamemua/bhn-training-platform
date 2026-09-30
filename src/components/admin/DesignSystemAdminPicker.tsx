"use client";
/**
 * Admin-only design-system selector. Lives on /admin/design-system.
 *
 * Pick a design system and click "Apply platform-wide" — the
 * PlatformSetting is updated; on next request every user of the
 * platform sees the new shell. There is no preview-without-commit
 * mode (intentional: the change is platform-wide; admins preview
 * by visiting any page after applying).
 *
 * Confirms before applying, since the change is global.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle, Layers } from "lucide-react";
import {
  DESIGN_SYSTEMS,
  type DesignSystemId,
} from "@/lib/design-system/registry";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DesignSystemAdminPicker({ initial }: { initial: DesignSystemId }) {
  const router = useRouter();
  const [active, setActive] = useState<DesignSystemId>(initial);
  const [pending, setPending] = useState<DesignSystemId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function apply(id: DesignSystemId) {
    if (id === active) return;
    const target = DESIGN_SYSTEMS.find((d) => d.id === id);
    if (!target) return;
    if (!(await confirmDialog({
      title: `Apply "${target.name}" to every user of the platform?`,
      description: "Their next page load will pick it up.",
      confirmLabel: "Apply",
      tone: "warning",
    }))) {
      setPending(null);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/design-system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designSystem: id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Update failed");
      }
      setActive(id);
      setSuccessMessage(`"${target.name}" is now active platform-wide. Refresh any page to see it.`);
      // Refresh the route so the new value flows through the root
      // layout (the <html data-design-system="..."> attribute updates).
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DESIGN_SYSTEMS.map((d) => {
          const isActive = d.id === active;
          const isPending = d.id === pending && busy;
          return (
            <article
              key={d.id}
              className={
                "rounded-2xl border p-4 transition-colors " +
                (isActive
                  ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/30"
                  : "border-line bg-card-solid hover:bg-elevated")
              }
            >
              <header className="flex items-start gap-3">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-line"
                  style={d.id === "cinematic" ? {
                    backgroundImage:
                      "linear-gradient(135deg, var(--brand-200), var(--brand-500) 60%, var(--brand-700))",
                  } : { backgroundColor: "var(--card)" }}
                >
                  <Layers size={14} className={d.id === "cinematic" ? "text-white" : "text-fg"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg inline-flex items-center gap-2">
                    {d.name}
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 px-1.5 py-0.5 rounded">
                        <Check size={10} /> Active
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted leading-snug mt-1">{d.description}</p>
                </div>
              </header>
              <div className="flex items-center justify-end mt-3">
                <button
                  type="button"
                  onClick={() => { setPending(d.id); apply(d.id); }}
                  disabled={isActive || busy}
                  className={
                    "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors " +
                    (isActive
                      ? "bg-elevated text-muted cursor-default"
                      : "bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/25")
                  }
                >
                  {isPending ? <Loader2 size={11} className="animate-spin" /> : null}
                  {isActive ? "Currently active" : "Apply platform-wide"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {error && (
        <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </p>
      )}
      {successMessage && (
        <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1.5">
          <Check size={11} /> {successMessage}
        </p>
      )}
      {confirmNode}
    </div>
  );
}
