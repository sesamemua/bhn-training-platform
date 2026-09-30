"use client";

/**
 * Admin table for employer-intake submissions with inline edit + delete.
 * Read-only data comes from the server page; mutations go through
 * /api/admin/experience/employer-intake/[id] and refresh the route.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Pencil, Trash2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface IntakeRow {
  id: string;
  email: string;
  createdAt: string; // ISO
  name: string;
  organization: string;
  title: string;
  website: string;
  address: string;
  timeline: string;
  needs: string;
  companyId: string;
  numberOfInterviews: string;
  latestInterviewScheduled: string;
}

const TIMELINES = [
  "",
  "Immediately",
  "Within 3 months",
  "Within 6 months",
  "Within 12 months",
  "No immediate plans",
];

const inputCls =
  "w-full rounded-md border border-line bg-elevated/40 px-3 py-2 text-sm text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30";

function siteHref(s: string) {
  return s.startsWith("http") ? s : `https://${s}`;
}

export function EmployerIntakeTable({ rows }: { rows: IntakeRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<IntakeRow | null>(null);
  const [form, setForm] = useState<IntakeRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function openEdit(r: IntakeRow) {
    setForm({ ...r });
    setEditing(r);
    setError(null);
  }
  function set<K extends keyof IntakeRow>(k: K, v: string) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/experience/employer-intake/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          organization: form.organization,
          title: form.title,
          website: form.website,
          address: form.address,
          hiring_timeline: form.timeline,
          needs: form.needs,
          companyId: form.companyId,
          numberOfInterviews: form.numberOfInterviews,
          latestInterviewScheduled: form.latestInterviewScheduled,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Could not save.");
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: IntakeRow) {
    if (!(await confirmDialog({
      title: `Delete the intake from ${r.organization || r.name || r.email}?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/admin/experience/employer-intake/${r.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-2.5 font-medium">Organization</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Timeline</th>
              <th className="px-3 py-2.5 font-medium">Looking for</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Received</th>
              <th className="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top hover:bg-elevated/40">
                <td className="px-5 py-3">
                  <div className="font-semibold text-fg">{r.organization || "—"}</div>
                  {r.website && (
                    <a href={siteHref(r.website)} target="_blank" rel="noopener"
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                      <Globe size={10} /> {r.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </td>
                <td className="px-3 py-3 text-fg">
                  {r.name || "—"}
                  {r.title && <div className="text-[11px] text-muted">{r.title}</div>}
                </td>
                <td className="px-3 py-3">
                  <a href={`mailto:${r.email}`} className="text-brand-600 hover:underline">{r.email || "—"}</a>
                </td>
                <td className="px-3 py-3 text-muted whitespace-nowrap">{r.timeline || "—"}</td>
                <td className="px-3 py-3 text-muted max-w-[20rem]">{r.needs || "—"}</td>
                <td className="px-3 py-3 text-muted whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleDateString("en-CA")}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => openEdit(r)} title="Edit"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => remove(r)} title="Delete" disabled={deletingId === r.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-rose-600 disabled:opacity-50">
                      {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit intake"
        description={editing?.organization || editing?.email}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-md border border-line bg-card-solid px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />} Save
            </button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <L label="Organization"><input className={inputCls} value={form.organization} onChange={(e) => set("organization", e.target.value)} /></L>
            <L label="Website"><input className={inputCls} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></L>
            <L label="Contact name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></L>
            <L label="Title"><input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} /></L>
            <L label="Email"><input className={inputCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></L>
            <L label="Hiring timeline">
              <select className={inputCls} value={form.timeline} onChange={(e) => set("timeline", e.target.value)}>
                {TIMELINES.map((t) => <option key={t} value={t}>{t || "—"}</option>)}
              </select>
            </L>
            <L label="Address" full><input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} /></L>
            <L label="Looking for" full>
              <textarea className={inputCls} rows={3} value={form.needs} onChange={(e) => set("needs", e.target.value)} />
            </L>
            <L label="Company ID"><input className={inputCls} value={form.companyId} onChange={(e) => set("companyId", e.target.value)} placeholder="BHTAC0001" /></L>
            <L label="# interviews"><input className={inputCls} value={form.numberOfInterviews} onChange={(e) => set("numberOfInterviews", e.target.value)} /></L>
            <L label="Latest interview" full><input className={inputCls} value={form.latestInterviewScheduled} onChange={(e) => set("latestInterviewScheduled", e.target.value)} /></L>
            {error && <p className="sm:col-span-2 text-xs font-medium text-rose-600">{error}</p>}
          </div>
        )}
      </Modal>
      {confirmNode}
    </>
  );
}

function L({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      {children}
    </label>
  );
}
