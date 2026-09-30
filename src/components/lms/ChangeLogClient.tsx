"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Sparkles, Wrench, ArrowUp, MessageSquare, Pencil, Trash2, Eye, EyeOff,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ChangeLogEntry {
  id: string;
  title: string;
  body: string;
  kind: string;
  version: string | null;
  visibleTo: string[];
  publishedAt: string | Date;
  /// Build commit SHA the entry first shipped on. Surfaced only when
  /// canManage is true on the timeline (admin / superadmin).
  buildSha?: string | null;
}

const KIND_META: Record<string, { label: string; tone: "brand" | "amber" | "success" | "neutral"; icon: React.ElementType }> = {
  feature:     { label: "New",         tone: "brand",   icon: Sparkles },
  improvement: { label: "Improved",    tone: "success", icon: ArrowUp },
  fix:         { label: "Fix",         tone: "amber",   icon: Wrench },
  note:        { label: "Note",        tone: "neutral", icon: MessageSquare },
};

const ALL_ROLES: { id: string; label: string }[] = [
  { id: "trainee",    label: "Trainees" },
  { id: "evaluating", label: "Evaluating" },
  { id: "instructor", label: "Instructors" },
  { id: "admin",      label: "Admins" },
  { id: "superadmin", label: "Superadmins" },
];

interface Props {
  entries: ChangeLogEntry[];
  canManage: boolean;
}

export function ChangeLogClient({ entries, canManage }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<ChangeLogEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("feature");
  const [version, setVersion] = useState("");
  const [visibleTo, setVisibleTo] = useState<string[]>(ALL_ROLES.map((r) => r.id));

  function openNew() {
    setEditing(null);
    setTitle(""); setBody(""); setKind("feature"); setVersion("");
    setVisibleTo(ALL_ROLES.map((r) => r.id));
    setCreating(true);
  }
  function openEdit(e: ChangeLogEntry) {
    setEditing(e);
    setTitle(e.title); setBody(e.body); setKind(e.kind); setVersion(e.version ?? "");
    setVisibleTo(e.visibleTo);
    setCreating(true);
  }
  function close() {
    setCreating(false);
    setEditing(null);
  }
  function toggleRole(id: string) {
    setVisibleTo((cur) => (cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id]));
  }

  async function save() {
    if (!title.trim()) {
      await confirmDialog({ title: "Title required", acknowledgeOnly: true });
      return;
    }
    if (visibleTo.length === 0) {
      await confirmDialog({
        title: "Pick at least one role to share with",
        description: "Otherwise nobody will see this entry.",
        acknowledgeOnly: true,
      });
      return;
    }
    setBusy(true);
    try {
      const payload = { title, body, kind, version: version.trim() || null, visibleTo };
      const url = editing ? `/api/changelog/${editing.id}` : "/api/changelog";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        await confirmDialog({ title: j.error ?? "Save failed", acknowledgeOnly: true });
        return;
      }
      close();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirmDialog({
      title: "Delete this changelog entry?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/changelog/${id}`, { method: "DELETE" });
      if (!res.ok) {
        await confirmDialog({ title: "Delete failed", acknowledgeOnly: true });
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex items-center justify-end">
          <Button onClick={openNew} variant="primary"><Plus size={14} /> New entry</Button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-card rounded-2xl border border-line p-16 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
            <Sparkles size={20} />
          </div>
          <p className="font-medium text-fg">Nothing here yet</p>
          <p className="text-sm text-muted mt-1">Updates will appear as the platform evolves.</p>
        </div>
      ) : (
        // Vertical timeline grouped by month. Entries are already
        // newest-first server-side; preserve that order.
        <Timeline
          entries={entries}
          canManage={canManage}
          onEdit={openEdit}
          onDelete={remove}
        />
      )}

      <Modal
        open={creating}
        onClose={close}
        size="lg"
        title={editing ? "Edit changelog entry" : "New changelog entry"}
        description="Pick the kind, write a short title, expand if helpful, and choose who should see it."
        footer={
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={save} loading={busy}>{editing ? "Save changes" : "Publish entry"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kind" className="col-span-1">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="feature">New feature</option>
                <option value="improvement">Improvement</option>
                <option value="fix">Fix</option>
                <option value="note">Note</option>
              </Select>
            </Field>
            <Field label="Version" hint="Optional, e.g. 0.4.2" className="col-span-2">
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="" />
            </Field>
          </div>
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What changed?" />
          </Field>
          <Field label="Details" hint="Optional. Plain text. Line breaks are kept.">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Expand on what users will notice or care about." />
          </Field>
          <Field label="Visible to" hint="Pick which roles can see this entry. Trainees view this page as 'What's new'.">
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((r) => {
                const checked = visibleTo.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors",
                      checked ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-card border-line text-muted hover:border-line-strong"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(r.id)}
                      className="accent-brand-600"
                    />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      </Modal>
      {confirmNode}
    </div>
  );
}

/** Vertical timeline: month sub-headings with a rail and per-entry dots. */
function Timeline({
  entries, canManage, onEdit, onDelete,
}: {
  entries: ChangeLogEntry[];
  canManage: boolean;
  onEdit: (e: ChangeLogEntry) => void;
  onDelete: (id: string) => void;
}) {
  type Group = { ym: string; label: string; items: ChangeLogEntry[] };
  const groups: Group[] = [];
  for (const e of entries) {
    const d = new Date(e.publishedAt);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last && last.ym === ym) last.items.push(e);
    else groups.push({ ym, label, items: [e] });
  }

  return (
    <div className="relative">
      {/* Continuous rail running the height of the timeline */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-line" aria-hidden />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.ym}>
            <div className="pl-12 pb-2 pt-1">
              <h2 className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
                {g.label}
              </h2>
            </div>
            <ol className="space-y-3">
              {g.items.map((e) => {
                const meta = KIND_META[e.kind] ?? KIND_META.feature;
                const Icon = meta.icon;
                const isEveryone = e.visibleTo.length === ALL_ROLES.length;
                return (
                  <li key={e.id} className="relative pl-12 group">
                    <div
                      className={cn(
                        "absolute left-0 top-1.5 w-10 h-10 rounded-full flex items-center justify-center shadow-sm border z-10 bg-card-solid",
                        meta.tone === "brand"   && "text-brand-600 border-brand-200",
                        meta.tone === "success" && "text-emerald-600 border-emerald-200",
                        meta.tone === "amber"   && "text-amber-600 border-amber-200",
                        meta.tone === "neutral" && "text-muted border-line",
                      )}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="bg-card border border-line rounded-2xl p-5 hover:border-brand-200 transition-colors">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {e.version && <Badge tone="neutral">v{e.version}</Badge>}
                        <span className="text-xs text-subtle">
                          {new Date(e.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        {/* Build SHA chip — admins/superadmins only.
                            Lets staff correlate "what shipped" with
                            "in which build" without a separate
                            release log. */}
                        {canManage && e.buildSha && (
                          <code
                            title={`Build ${e.buildSha} — when this entry first shipped`}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated border border-line text-subtle select-all"
                          >
                            {e.buildSha.slice(0, 7)}
                          </code>
                        )}
                        {canManage && (
                          <span className="ml-auto flex items-center gap-1 text-[11px] text-subtle">
                            {isEveryone ? (
                              <span className="inline-flex items-center gap-1"><Eye size={11} /> everyone</span>
                            ) : (
                              <span className="inline-flex items-center gap-1"><EyeOff size={11} /> {e.visibleTo.length} role{e.visibleTo.length === 1 ? "" : "s"}</span>
                            )}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-fg leading-snug">{e.title}</h3>
                      {e.body && (
                        <p className="text-sm text-muted mt-1.5 leading-relaxed whitespace-pre-line">{e.body}</p>
                      )}
                      {canManage && (
                        <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEdit(e)}
                            className="text-xs text-muted hover:text-brand-600 inline-flex items-center gap-1"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            onClick={() => onDelete(e.id)}
                            className="text-xs text-muted hover:text-rose-600 inline-flex items-center gap-1"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                          <span className="text-xs text-subtle ml-2">
                            Visible to: {e.visibleTo.map((r) => r === "trainee" ? "trainees" : r + "s").join(" · ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
