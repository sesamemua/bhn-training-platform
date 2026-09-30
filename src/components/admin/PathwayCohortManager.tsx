"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers, Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, Users,
  Calendar, Clock, X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface CohortRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** ISO */
  startDate: string;
  /** ISO or null */
  endDate: string | null;
  capacity: number;
  allowWaitlist: boolean;
  waitlistCapacity: number | null;
  enrollmentOpensAt: string | null;
  enrollmentClosesAt: string | null;
  status: string;
  displayOrder: number;
  confirmedCount: number;
  waitlistCount: number;
  state: string;
}

/**
 * Admin section embedded in the pathway detail page (staff-only).
 * Shows every cohort with current capacity + state, plus actions to
 * add / edit / delete. Edits + creates use a single dialog form.
 *
 * Cohort-mode opt-in is implicit — the moment you create your first
 * cohort, the pathway switches to cohort-mode and the pathway-level
 * enrollment fields are ignored at runtime (still shown in the
 * legacy settings card so they can be restored by deleting all
 * cohorts).
 */
export function PathwayCohortManager({
  pathwayId,
  initialCohorts,
}: {
  pathwayId: string;
  initialCohorts: CohortRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CohortRow[]>(initialCohorts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function setFlashAuto(s: string) {
    setFlash(s);
    setTimeout(() => setFlash(null), 4000);
  }

  async function deleteCohort(c: CohortRow) {
    if (!(await confirmDialog({
      title: `Delete cohort "${c.name}"?`,
      description: "This is blocked if active enrollments exist (use Archive instead).",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/pathways/${pathwayId}/cohorts/${c.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      setFlashAuto(`Deleted cohort "${c.name}".`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="rounded-2xl bg-card border border-line p-5 surface-shadow space-y-4">
      {confirmNode}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-fg inline-flex items-center gap-2 tracking-tight">
          <Layers size={16} className="text-brand-600" />
          Cohorts
          <span className="text-xs font-mono tabular-nums text-subtle">{rows.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={12} /> Add cohort
        </button>
      </header>

      <p className="text-xs text-muted leading-snug">
        Each cohort has its own capacity, registration window, and waitlist
        policy. The pathway's overall enrollment settings (in the card
        above) are used as the fallback when no cohorts exist. Trainees
        pick a cohort when enrolling.
      </p>

      {error && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 flex items-start gap-2 text-xs text-rose-900">
          <AlertTriangle size={11} className="text-rose-700 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {flash && (
        <div className="rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-200 px-3 py-2 flex items-start gap-2 text-xs text-emerald-900">
          <CheckCircle2 size={11} className="text-emerald-700 shrink-0 mt-0.5" />
          {flash}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-background p-6 text-center">
          <p className="text-sm font-medium text-muted">No cohorts yet.</p>
          <p className="text-xs text-subtle mt-1.5 max-w-md mx-auto leading-relaxed">
            Without cohorts, the pathway uses the legacy single-track enrollment.
            Add a cohort to break the program into terms (Spring 2026, Fall 2026, …).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border border-line bg-background p-3 flex flex-wrap items-start gap-3 justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-fg text-sm">{c.name}</p>
                  <code className="font-mono text-[10px] text-subtle">/{c.slug}</code>
                  <CohortStateChip state={c.state} />
                </div>
                <dl className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-muted">
                  <Meta icon={Calendar}>
                    {new Date(c.startDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                    {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`}
                  </Meta>
                  <Meta icon={Users}>
                    {c.confirmedCount} / {c.capacity}
                    {c.waitlistCount > 0 && <span className="text-amber-700"> · {c.waitlistCount} on waitlist</span>}
                  </Meta>
                  {c.enrollmentClosesAt && (
                    <Meta icon={Clock}>
                      Closes {new Date(c.enrollmentClosesAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                    </Meta>
                  )}
                </dl>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingId(c.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg px-2 py-1 rounded disabled:opacity-50"
                >
                  <Pencil size={11} /> Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => startTransition(() => { void deleteCohort(c); })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded disabled:opacity-50"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(creating || editingId !== null) && (
        <CohortDialog
          pathwayId={pathwayId}
          cohort={editingId ? rows.find((r) => r.id === editingId) ?? null : null}
          onClose={() => { setCreating(false); setEditingId(null); }}
          onSaved={(c) => {
            if (editingId) {
              setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, ...c, confirmedCount: r.confirmedCount, waitlistCount: r.waitlistCount } : r)));
              setFlashAuto(`Updated cohort "${c.name}".`);
            } else {
              setRows((prev) => [...prev, { ...c, confirmedCount: 0, waitlistCount: 0, state: c.status === "draft" ? "draft" : c.status === "archived" ? "archived" : c.status === "closed" ? "closed" : "open" }]);
              setFlashAuto(`Added cohort "${c.name}".`);
            }
            setCreating(false); setEditingId(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function CohortStateChip({ state }: { state: string }) {
  const tints: Record<string, string> = {
    open:         "bg-emerald-100 text-emerald-800 ring-emerald-200",
    waitlisted:   "bg-amber-100 text-amber-800 ring-amber-200",
    full:         "bg-rose-100 text-rose-800 ring-rose-200",
    closed:       "bg-slate-100 text-slate-700 ring-slate-200",
    not_open_yet: "bg-sky-100 text-sky-800 ring-sky-200",
    draft:        "bg-elevated text-subtle ring-line",
    archived:     "bg-slate-100 text-slate-700 ring-slate-200",
  };
  const labels: Record<string, string> = {
    open: "Open", waitlisted: "Waitlist only", full: "Full",
    closed: "Closed", not_open_yet: "Opens soon",
    draft: "Draft", archived: "Past cohort",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${tints[state] ?? tints.draft}`}
    >
      {labels[state] ?? state}
    </span>
  );
}

function Meta({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon size={10} className="text-subtle" />
      {children}
    </span>
  );
}

interface CohortInput {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  capacity: number;
  allowWaitlist: boolean;
  waitlistCapacity: number | null;
  enrollmentOpensAt: string | null;
  enrollmentClosesAt: string | null;
  status: string;
  displayOrder: number;
}

function CohortDialog({
  pathwayId, cohort, onClose, onSaved,
}: {
  pathwayId: string;
  cohort: CohortRow | null;
  onClose: () => void;
  onSaved: (c: CohortInput) => void;
}) {
  const isEdit = cohort !== null;
  const [slug, setSlug] = useState(cohort?.slug ?? "");
  const [name, setName] = useState(cohort?.name ?? "");
  const [description, setDescription] = useState(cohort?.description ?? "");
  const [startDate, setStartDate] = useState(toLocalDate(cohort?.startDate ?? null));
  const [endDate, setEndDate] = useState(toLocalDate(cohort?.endDate ?? null));
  const [capacity, setCapacity] = useState(cohort?.capacity ?? 20);
  const [allowWaitlist, setAllowWaitlist] = useState(cohort?.allowWaitlist ?? true);
  const [waitlistCapacity, setWaitlistCapacity] = useState(cohort?.waitlistCapacity != null ? String(cohort.waitlistCapacity) : "");
  const [opensAt, setOpensAt] = useState(toLocalDateTime(cohort?.enrollmentOpensAt ?? null));
  const [closesAt, setClosesAt] = useState(toLocalDateTime(cohort?.enrollmentClosesAt ?? null));
  const [status, setStatus] = useState(cohort?.status ?? "draft");
  const [displayOrder, setDisplayOrder] = useState(cohort?.displayOrder ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const body = {
      slug: slug.trim(),
      name: name.trim(),
      description: description.trim() || null,
      startDate: startDate ? new Date(startDate).toISOString() : null,
      endDate: endDate ? new Date(endDate).toISOString() : null,
      capacity: Number(capacity) || 0,
      allowWaitlist,
      waitlistCapacity: waitlistCapacity === "" ? null : Number(waitlistCapacity),
      enrollmentOpensAt: opensAt ? new Date(opensAt).toISOString() : null,
      enrollmentClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
      status,
      displayOrder: Number(displayOrder) || 0,
    };
    try {
      const url = isEdit
        ? `/api/admin/pathways/${pathwayId}/cohorts/${cohort!.id}`
        : `/api/admin/pathways/${pathwayId}/cohorts`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; cohort?: CohortInput };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.cohort) onSaved(data.cohort);
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-backdrop flex items-start sm:items-center justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="bg-card border border-line rounded-2xl w-full max-w-2xl my-auto shadow-xl">
        <header className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="font-bold text-fg text-lg">{isEdit ? `Edit cohort` : "New cohort"}</h3>
          <button onClick={onClose} className="text-muted hover:text-fg p-1" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <form onSubmit={save} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" required>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm" placeholder="Spring 2026 cohort" />
            </Field>
            <Field label="Slug" required hint="URL-safe; kebab-case. Unique within the pathway.">
              <input value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="^[a-z0-9][a-z0-9-]{0,40}$" className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono" placeholder="spring-2026" />
            </Field>
          </div>
          <Field label="Description" hint="Markdown supported. Shown to applicants in the cohort picker.">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm" placeholder="Hybrid format · Weekly Wednesdays · In-person retreat in March" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Start date" required>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="End date">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Capacity" required>
              <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 0)} required className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label="Allow waitlist?">
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={allowWaitlist} onChange={(e) => setAllowWaitlist(e.target.checked)} className="accent-brand-600 w-4 h-4" />
                <span className="text-sm">{allowWaitlist ? "Yes" : "No"}</span>
              </label>
            </Field>
            <Field label="Waitlist cap" hint="Blank = unlimited.">
              <input type="number" min={0} value={waitlistCapacity} onChange={(e) => setWaitlistCapacity(e.target.value)} disabled={!allowWaitlist} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-50" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Enrollment opens" hint="Blank = open immediately.">
              <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Enrollment closes" hint="Blank = no auto-close.">
              <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Status" hint="Draft hides from applicants. Open accepts enrollments. Closed stops new ones. Archived = past cohort.">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm">
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Display order" hint="Lower = shown first.">
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)} className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono" />
            </Field>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 flex items-start gap-2 text-xs text-rose-900">
              <AlertTriangle size={11} className="text-rose-700 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 text-white px-5 py-2 text-sm font-bold hover:bg-brand-700 disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create cohort"}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-muted hover:text-fg px-3 py-2">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: React.ReactNode;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-fg">{label}{required && <span className="text-rose-700 ml-0.5">*</span>}</span>
      {hint && <span className="block text-[11px] text-subtle mt-0.5 leading-snug">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function toLocalDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toLocalDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
