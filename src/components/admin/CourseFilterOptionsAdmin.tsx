"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Trash2, EyeOff, Eye, Check, X, Loader2 } from "lucide-react";

export interface FilterOption {
  id: string;
  type: "topic" | "delivery" | "provider";
  value: string;
  sortOrder: number;
  active: boolean;
}

const TYPE_LABEL: Record<FilterOption["type"], string> = {
  topic: "On-demand course topics",
  delivery: "Delivery types",
  provider: "Providers",
};

const TYPE_ORDER: FilterOption["type"][] = ["topic", "delivery", "provider"];

export function CourseFilterOptionsAdmin({ initial }: { initial: FilterOption[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FilterOption[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<FilterOption["type"], string>>({
    topic: "", delivery: "", provider: "",
  });
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function addOption(type: FilterOption["type"]) {
    const value = drafts[type].trim();
    if (!value) return;
    setBusyId(`new-${type}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/courses/filter-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; option?: FilterOption; error?: string;
      };
      if (!res.ok || !j.option) {
        setError(j.error ?? "Couldn't add.");
        return;
      }
      setRows((cur) => [...cur, j.option!]);
      setDrafts((cur) => ({ ...cur, [type]: "" }));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function patch(id: string, body: Partial<FilterOption>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/filter-options/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; option?: FilterOption; error?: string;
      };
      if (!res.ok || !j.option) {
        setError(j.error ?? "Couldn't update.");
        return;
      }
      setRows((cur) => cur.map((r) => (r.id === id ? j.option! : r)));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow(id: string, label: string) {
    if (!(await confirmDialog({
      title: `Delete "${label}"?`,
      description: "Courses already tagged with it keep the value, but it won't show in the picker.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/filter-options/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Delete failed.");
        return;
      }
      setRows((cur) => cur.filter((r) => r.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {confirmNode}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-2.5">
          {error}
        </div>
      )}
      {TYPE_ORDER.map((type) => {
        const list = rows.filter((r) => r.type === type);
        return (
          <section key={type} className="bg-card border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-fg">{TYPE_LABEL[type]}</h2>
              <span className="text-xs text-subtle">{list.length} {list.length === 1 ? "option" : "options"}</span>
            </div>
            <div className="space-y-1.5">
              {list.length === 0 ? (
                <p className="text-sm text-subtle">No options. Add one below.</p>
              ) : (
                list.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    busy={busyId === row.id}
                    onPatch={(b) => patch(row.id, b)}
                    onDelete={() => removeRow(row.id, row.value)}
                  />
                ))
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={drafts[type]}
                onChange={(e) => setDrafts((cur) => ({ ...cur, [type]: e.target.value }))}
                placeholder={`Add ${type}…`}
                className="flex-1 bg-card-solid border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                onKeyDown={(e) => e.key === "Enter" && addOption(type)}
              />
              <button
                type="button"
                onClick={() => addOption(type)}
                disabled={busyId === `new-${type}` || !drafts[type].trim()}
                className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
              >
                {busyId === `new-${type}` ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Add
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  row, busy, onPatch, onDelete,
}: {
  row: FilterOption;
  busy: boolean;
  onPatch: (body: Partial<FilterOption>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.value);
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-line ${row.active ? "bg-card-solid" : "bg-elevated/50 opacity-60"}`}>
      {editing ? (
        <>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 bg-card-solid border border-line rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") { onPatch({ value: draft }); setEditing(false); }
              if (e.key === "Escape") { setDraft(row.value); setEditing(false); }
            }}
          />
          <button type="button" onClick={() => { onPatch({ value: draft }); setEditing(false); }} className="text-emerald-700 p-1.5 rounded hover:bg-emerald-50">
            <Check size={14} />
          </button>
          <button type="button" onClick={() => { setDraft(row.value); setEditing(false); }} className="text-subtle p-1.5 rounded hover:bg-elevated">
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span
            className="flex-1 text-sm text-fg truncate cursor-text"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {row.value}
          </span>
          <button
            type="button"
            onClick={() => onPatch({ active: !row.active })}
            disabled={busy}
            className="text-subtle hover:text-fg p-1.5 rounded hover:bg-elevated"
            title={row.active ? "Hide from picker" : "Show in picker"}
          >
            {row.active ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-subtle hover:text-rose-600 p-1.5 rounded hover:bg-rose-50"
            title="Delete option"
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}
