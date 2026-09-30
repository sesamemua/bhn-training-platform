"use client";

/**
 * Scripts inside one video project — create / open / rename / delete.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, FileText, Loader2, ArrowRight, Pencil, Check, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ScriptRow {
  id: string;
  title: string;
  format: string;
  sectionCount: number;
  updatedAt: string;
}

export function VideoProjectDetailClient({
  projectId,
  initialScripts,
}: {
  projectId: string;
  initialScripts: ScriptRow[];
}) {
  const router = useRouter();
  const [scripts, setScripts] = useState<ScriptRow[]>(initialScripts);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function create() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/video-projects/${projectId}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; script?: { id: string }; error?: string };
      if (res.ok && j.ok && j.script) {
        router.push(`/admin/workspace/marketing/video/${projectId}/scripts/${j.script.id}`);
      }
      setTitle("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const t = editTitle.trim();
    if (!t) { setEditingId(null); return; }
    setScripts((cur) => cur.map((s) => (s.id === id ? { ...s, title: t } : s)));
    setEditingId(null);
    await fetch(`/api/workspace/scripts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    }).catch(() => {});
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog({
      title: `Delete the script "${name}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setScripts((cur) => cur.filter((s) => s.id !== id));
    await fetch(`/api/workspace/scripts/${id}?force=true`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[16rem]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">New script</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. 60-second cut"
              className="mt-1 w-full rounded-md border border-line bg-card-solid px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={busy || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add script
          </button>
        </div>
      </Card>

      {scripts.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-muted">
          No scripts yet. Add one above to start writing.
        </Card>
      ) : (
        <div className="space-y-2">
          {scripts.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 px-4 py-3">
              <FileText size={16} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                {editingId === s.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={editTitle}
                      autoFocus
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") rename(s.id); if (e.key === "Escape") setEditingId(null); }}
                      className="flex-1 rounded-md border border-line bg-card-solid px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button type="button" onClick={() => rename(s.id)} className="text-emerald-700 hover:text-emerald-900"><Check size={15} /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-muted hover:text-fg"><X size={15} /></button>
                  </div>
                ) : (
                  <Link href={`/admin/workspace/marketing/video/${projectId}/scripts/${s.id}`} className="block min-w-0">
                    <p className="truncate text-sm font-semibold text-fg hover:text-brand-700">{s.title}</p>
                    <p className="text-[11px] text-muted">
                      {s.format === "richtext" ? "Rich text" : `${s.sectionCount} ${s.sectionCount === 1 ? "section" : "sections"}`}
                    </p>
                  </Link>
                )}
              </div>
              {editingId !== s.id && (
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" title="Rename" onClick={() => { setEditingId(s.id); setEditTitle(s.title); }} className="text-muted hover:text-fg"><Pencil size={14} /></button>
                  <button type="button" title="Delete" onClick={() => remove(s.id, s.title)} className="text-muted hover:text-rose-700"><Trash2 size={14} /></button>
                  <Link href={`/admin/workspace/marketing/video/${projectId}/scripts/${s.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                    Open <ArrowRight size={12} />
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {confirmNode}
    </div>
  );
}
