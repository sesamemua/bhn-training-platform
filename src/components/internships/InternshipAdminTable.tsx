"use client";

/**
 * Admin-only batch view of internship postings. Renders a compact
 * table (one row per posting) with per-row checkboxes and a sticky
 * action toolbar that appears once anything is selected.
 *
 * Replaces the card grid for admins on `/internships`. Trainees and
 * employers still see the rich card grid — the table is purely an
 * admin-ergonomics view for triaging many postings at once.
 *
 * Batch actions are sent to POST /api/admin/internships/batch with
 *   { ids: string[], action: "delete" | "activate" | "close" | "draft" }
 * After a successful action the page is refreshed via router.refresh()
 * so the new state shows up immediately.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trash2, CheckCircle2, XCircle, FileEdit, ChevronUp, AlertCircle, Loader2, ExternalLink, Pencil,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface AdminPostingRow {
  id: string;
  companyName: string;
  title: string;
  status: "active" | "closed" | "draft";
  location: string | null;
  type: string | null;
  deadline: string | null;          // ISO string
  createdAt: string;                // ISO string
  skillCount: number;
  applicantCount?: number;          // optional — reserved for future expansion
}

interface Props {
  postings: AdminPostingRow[];
}

type BatchAction = "activate" | "close" | "draft" | "delete";

export function InternshipAdminTable({ postings }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const allIds = useMemo(() => postings.map((p) => p.id), [postings]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((cur) => {
      if (cur.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  }
  function clear() {
    setSelected(new Set());
  }

  async function runBatch(action: BatchAction) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    if (action === "delete") {
      const ok = await confirmDialog({
        title: `Permanently delete ${ids.length} posting${ids.length === 1 ? "" : "s"}?`,
        description: "This cannot be undone.",
        confirmLabel: "Delete",
        tone: "destructive",
      });
      if (!ok) return;
    }

    setError(null);
    setToast(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/admin/internships/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; affected?: number; error?: string };
        if (!r.ok || !j.ok) {
          setError(j.error ?? "Batch action failed.");
          return;
        }
        const verb =
          action === "delete"  ? "deleted" :
          action === "activate" ? "activated" :
          action === "close"   ? "closed" : "moved to draft";
        setToast(`${j.affected ?? ids.length} posting${(j.affected ?? ids.length) === 1 ? "" : "s"} ${verb}.`);
        clear();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  // ── Group rows by status so admins can scan "what needs my read"
  //    quickly. Within each group, drafts sit on top, then active,
  //    then closed — matching the page's default ordering.
  const grouped = useMemo(() => {
    const order: ("draft" | "active" | "closed")[] = ["draft", "active", "closed"];
    return order
      .map((status) => ({ status, rows: postings.filter((p) => p.status === status) }))
      .filter((g) => g.rows.length > 0);
  }, [postings]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  };

  return (
    <div className="space-y-3">
      {confirmNode}
      {/* Sticky action toolbar — slides into view when at least one
          row is selected. Sticks below the page's top nav band. */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30">
          <div className="bg-fg text-background rounded-xl shadow-lg ring-1 ring-fg/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={clear}
                className="text-xs opacity-70 hover:opacity-100 underline underline-offset-2"
              >
                Clear
              </button>
              {toast && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300 opacity-90">
                  <CheckCircle2 size={12} /> {toast}
                </span>
              )}
              {error && (
                <span className="inline-flex items-center gap-1 text-xs text-rose-300">
                  <AlertCircle size={12} /> {error}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <BatchBtn icon={CheckCircle2} label="Activate" onClick={() => runBatch("activate")} pending={pending} tone="emerald" />
              <BatchBtn icon={FileEdit}     label="Draft"    onClick={() => runBatch("draft")}    pending={pending} tone="amber" />
              <BatchBtn icon={XCircle}      label="Close"    onClick={() => runBatch("close")}    pending={pending} tone="slate" />
              <BatchBtn icon={Trash2}       label="Delete"   onClick={() => runBatch("delete")}   pending={pending} tone="rose" danger />
            </div>
          </div>
        </div>
      )}

      <div className="bg-card-solid border border-line rounded-2xl overflow-hidden">
        {/* Table header (single row) — also serves as the "select all
            visible" toggle. Sticky-feel via a 1-px ring under it. */}
        <div className="px-4 py-3 border-b border-line bg-elevated/30 flex items-center justify-between gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              className="w-4 h-4 accent-brand-600 cursor-pointer"
            />
            <span className="text-xs font-mono uppercase tracking-[0.22em] font-bold text-fg-muted">
              {allSelected ? "All selected" : someSelected ? `${selected.size} of ${allIds.length}` : `Select all (${allIds.length})`}
            </span>
          </label>
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-fg-subtle">
            Admin view · batch edit
          </div>
        </div>

        {/* Body: grouped rows. Each group has a small status header. */}
        <div>
          {grouped.map((g) => (
            <section key={g.status}>
              <div className="px-4 py-2 border-t border-line bg-raised/40">
                <p className="text-[10px] font-mono uppercase tracking-[0.28em] font-bold text-fg-muted inline-flex items-center gap-2">
                  <StatusDot status={g.status} />
                  {g.status === "draft" ? "Drafts" : g.status === "active" ? "Active" : "Closed"}
                  <span className="text-fg-subtle font-normal">· {g.rows.length}</span>
                </p>
              </div>
              <ul className="divide-y divide-line">
                {g.rows.map((p) => (
                  <li key={p.id} className={"group px-4 py-3 flex items-center gap-3 hover:bg-elevated/30 " + (selected.has(p.id) ? "bg-brand-50/40" : "")}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="w-4 h-4 accent-brand-600 cursor-pointer shrink-0"
                      aria-label={`Select ${p.title}`}
                    />
                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-12 sm:col-span-5 min-w-0">
                        <Link
                          href={`/internships/${p.id}`}
                          className="block font-semibold text-sm text-fg hover:text-brand-700 truncate"
                        >
                          {p.title}
                        </Link>
                        <p className="text-xs text-fg-muted truncate">
                          {p.companyName}
                          {p.location && <> · <span className="text-fg-subtle">{p.location}</span></>}
                        </p>
                      </div>
                      <div className="hidden sm:block col-span-2 text-xs text-fg-muted truncate">
                        {p.type ?? "—"}
                      </div>
                      <div className="hidden sm:block col-span-2 text-xs font-mono text-fg-subtle tabular-nums">
                        {fmtDate(p.deadline)}{p.deadline ? "" : ""}
                        <span className="block text-[10px] opacity-70 mt-0.5">deadline</span>
                      </div>
                      <div className="hidden sm:block col-span-2 text-xs font-mono text-fg-subtle tabular-nums">
                        {fmtDate(p.createdAt)}
                        <span className="block text-[10px] opacity-70 mt-0.5">posted</span>
                      </div>
                      <div className="col-span-12 sm:col-span-1 flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/internships/${p.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-brand-700 px-2 py-1 rounded-md hover:bg-elevated transition-colors"
                          title="Edit this posting"
                        >
                          <Pencil size={11} /> Edit
                        </Link>
                        <Link
                          href={`/internships/${p.id}`}
                          className="inline-flex items-center text-fg-subtle hover:text-fg p-1 rounded-md hover:bg-elevated transition-colors"
                          title="Open the posting"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* Hint footer — explains the keyboard model and what batch
          actions do. Useful the first time, easy to ignore later. */}
      <div className="px-4 py-2 text-[11px] text-fg-subtle flex items-center justify-between flex-wrap gap-2">
        <span>
          <ChevronUp size={11} className="inline -mt-0.5" /> Toolbar appears once anything is selected.
          Delete is permanent — every other action is reversible (just batch-re-set the status).
        </span>
        <span className="font-mono uppercase tracking-[0.18em]">Admin · audit-logged</span>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function BatchBtn({
  icon: Icon, label, onClick, pending, tone, danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  pending: boolean;
  tone: "emerald" | "amber" | "slate" | "rose";
  danger?: boolean;
}) {
  const toneCls = {
    emerald: "hover:bg-emerald-500 hover:text-white",
    amber:   "hover:bg-amber-500 hover:text-white",
    slate:   "hover:bg-slate-500 hover:text-white",
    rose:    "hover:bg-rose-600 hover:text-white",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold " +
        "bg-background text-fg ring-1 ring-fg/15 transition-colors disabled:opacity-50 " +
        toneCls +
        (danger ? " hover:ring-rose-700" : "")
      }
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );
}

function StatusDot({ status }: { status: "active" | "closed" | "draft" }) {
  const cls =
    status === "active" ? "bg-emerald-500"
    : status === "draft" ? "bg-amber-500"
    : "bg-slate-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} aria-hidden />;
}
