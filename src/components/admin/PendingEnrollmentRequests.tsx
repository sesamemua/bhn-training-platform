"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, XCircle, Clock, BookOpen, Layers, Ghost, AlertTriangle,
  Loader2,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface PendingRequest {
  id: string;
  kind: "course" | "pathway";
  targetId: string;
  targetTitle: string;
  /** ISO */
  requestedAt: string;
  requestReason: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    accountKind: string;
  };
}

type Resolved = "approved" | "rejected";

/**
 * Pool of users requesting enrolment, grouped by what they're
 * requesting.
 *
 * Behaviour
 *   • Rows stay visible after Approve / Reject — a status chip
 *     replaces the action buttons so the admin sees the outcome
 *     at a glance. (Used to filter them out; that turned out to
 *     be disorienting during batch demos.)
 *   • Row selection via per-row checkboxes + a select-all on each
 *     group header. A sticky bulk action bar appears when 1+ rows
 *     are selected.
 *   • Auto-syncs with server data: when the parent SSR refresh
 *     fires (spawn / clear / approve), the new initialRequests prop
 *     is merged into the local state so newly-spawned phantoms
 *     appear without a manual page refresh.
 */
export function PendingEnrollmentRequests({
  initialRequests,
}: {
  initialRequests: PendingRequest[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<PendingRequest[]>(initialRequests);
  const [resolved, setResolved] = useState<Map<string, Resolved>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [, startTransition] = useTransition();

  // ── Auto-sync local state with server props ───────────────────
  //
  // useState only takes the initial value once. Without this, a
  // router.refresh() from the demo tray (spawn / clear / approve)
  // re-runs the server component but the client list stays frozen
  // — that's why admins were having to hit reload manually.
  //
  // We merge instead of replace, preserving the local "resolved"
  // map: a row the admin just approved 100ms ago shouldn't blink
  // back to "Approve / Reject" because the server snapshot happened
  // to include it as still-pending in the race window.
  useEffect(() => {
    const seenIds = new Set(initialRequests.map((r) => r.id));
    setRequests((prev) => {
      // Keep any row we already showed AND still know about as
      // "resolved" — those are the rows the admin actioned that
      // haven't been re-queried yet. Replace the rest with fresh
      // server data so spawn / clear show up immediately.
      const carryover = prev.filter((r) => resolved.has(r.id) && !seenIds.has(r.id));
      return [...initialRequests, ...carryover];
    });
    // Clear any selection that no longer maps to a known row.
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (seenIds.has(id) || resolved.has(id)) next.add(id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequests]);

  function setFlashAuto(s: string) {
    setFlash(s);
    setTimeout(() => setFlash(null), 4000);
  }

  // ── Single-row decision ───────────────────────────────────────
  async function decide(r: PendingRequest, action: "approve" | "reject") {
    setBusyIds((s) => new Set(s).add(r.id));
    setError(null);
    try {
      const isCourse = r.kind === "course";
      const url = isCourse
        ? `/api/admin/enrollments/${r.id}/review`
        : `/api/admin/pathway-enrollments/${r.id}`;
      const method = isCourse ? "POST" : "PATCH";
      const body = isCourse
        ? { action }
        : { decision: action };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setResolved((m) => new Map(m).set(r.id, action === "approve" ? "approved" : "rejected"));
      setFlashAuto(
        action === "approve"
          ? `Approved ${r.user.name ?? r.user.email} → ${r.targetTitle}.`
          : `Rejected ${r.user.name ?? r.user.email} → ${r.targetTitle}.`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(r.id);
        return next;
      });
    }
  }

  // ── Bulk action ───────────────────────────────────────────────
  async function bulk(action: "approve" | "reject") {
    if (selected.size === 0) return;
    // Build the work list — skip already-resolved rows so a re-tap
    // doesn't waste calls.
    const work = requests.filter((r) => selected.has(r.id) && !resolved.has(r.id));
    if (work.length === 0) return;
    if (action === "reject" && !(await confirmDialog({
      title: `Reject ${work.length} request${work.length === 1 ? "" : "s"}?`,
      confirmLabel: "Reject",
      tone: "destructive",
    }))) return;

    setBulkBusy(true);
    setError(null);
    let ok = 0;
    let fail = 0;
    for (const r of work) {
      try {
        const isCourse = r.kind === "course";
        const res = await fetch(
          isCourse
            ? `/api/admin/enrollments/${r.id}/review`
            : `/api/admin/pathway-enrollments/${r.id}`,
          {
            method: isCourse ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(isCourse ? { action } : { decision: action }),
          },
        );
        if (res.ok) {
          setResolved((m) => new Map(m).set(r.id, action === "approve" ? "approved" : "rejected"));
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    setFlashAuto(
      fail === 0
        ? `${action === "approve" ? "Approved" : "Rejected"} ${ok} request${ok === 1 ? "" : "s"}.`
        : `${ok} succeeded, ${fail} failed.`,
    );
    startTransition(() => router.refresh());
  }

  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Grouping ──────────────────────────────────────────────────
  const courseRequests  = useMemo(() => requests.filter((r) => r.kind === "course"),  [requests]);
  const pathwayRequests = useMemo(() => requests.filter((r) => r.kind === "pathway"), [requests]);

  const groupByTarget = (rs: PendingRequest[]) => {
    const m = new Map<string, { targetId: string; targetTitle: string; rows: PendingRequest[] }>();
    for (const r of rs) {
      const entry = m.get(r.targetId) ?? { targetId: r.targetId, targetTitle: r.targetTitle, rows: [] };
      entry.rows.push(r);
      m.set(r.targetId, entry);
    }
    return Array.from(m.values()).sort((a, b) => b.rows.length - a.rows.length);
  };
  const courseGroups  = useMemo(() => groupByTarget(courseRequests),  [courseRequests]);
  const pathwayGroups = useMemo(() => groupByTarget(pathwayRequests), [pathwayRequests]);

  // Live count of still-pending (not yet resolved) requests.
  const stillPendingCount = requests.filter((r) => !resolved.has(r.id)).length;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-bold text-fg tracking-tight inline-flex items-center gap-2">
          <Clock size={18} className="text-brand-600" />
          Pending enrollment requests
          <span className="text-xs font-mono tabular-nums text-subtle">
            {stillPendingCount} pending · {requests.length} total
          </span>
        </h2>
        <p className="text-sm text-muted mt-1 leading-snug">
          Trainees who've requested enrollment in a course (if marked "requires
          approval") or any learning pathway. Grouped by what they're
          requesting. Tick rows for batch actions; decided rows stay visible
          with their outcome chip.
        </p>
      </header>

      {/* Sticky bulk action bar — appears when 1+ row selected */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 rounded-2xl bg-brand-600 text-white px-4 py-3 surface-shadow flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold">
            {selected.size} selected
          </p>
          <BulkButton
            onClick={() => startTransition(() => { void bulk("approve"); })}
            disabled={bulkBusy}
            icon={CheckCircle2}
          >
            Approve
          </BulkButton>
          <BulkButton
            onClick={() => startTransition(() => { void bulk("reject"); })}
            disabled={bulkBusy}
            icon={XCircle}
            tone="danger"
          >
            Reject
          </BulkButton>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            className="ml-auto text-xs font-semibold text-white/80 hover:text-white underline disabled:opacity-50"
          >
            Clear selection
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 flex items-start gap-2 text-xs text-rose-900">
          <AlertTriangle size={11} className="text-rose-700 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {flash && (
        <div className="rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-200 px-3 py-2 flex items-start gap-2 text-xs text-emerald-900">
          <CheckCircle2 size={11} className="text-emerald-700 shrink-0 mt-0.5" /> {flash}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
          <Clock size={24} className="mx-auto text-muted mb-2" />
          <p className="text-sm font-medium text-muted">No pending requests right now.</p>
          <p className="text-xs text-subtle mt-1.5 max-w-md mx-auto leading-relaxed">
            Spawn demo phantoms below to see this section in action, or wait for
            real trainees to request approval-required enrollments.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <GroupedColumn
            title="Course requests"
            icon={BookOpen}
            groups={courseGroups}
            resolved={resolved}
            selected={selected}
            busyIds={busyIds}
            onToggleOne={toggleOne}
            onToggleGroup={(rows) => {
              setSelected((s) => {
                const next = new Set(s);
                const pendingIds = rows.filter((r) => !resolved.has(r.id)).map((r) => r.id);
                const allSelected = pendingIds.every((id) => next.has(id));
                if (allSelected) for (const id of pendingIds) next.delete(id);
                else for (const id of pendingIds) next.add(id);
                return next;
              });
            }}
            onDecide={(r, a) => startTransition(() => { void decide(r, a); })}
            emptyText="No course-enrollment requests pending."
            targetHref={(id) => `/courses/${id}`}
          />
          <GroupedColumn
            title="Pathway requests"
            icon={Layers}
            groups={pathwayGroups}
            resolved={resolved}
            selected={selected}
            busyIds={busyIds}
            onToggleOne={toggleOne}
            onToggleGroup={(rows) => {
              setSelected((s) => {
                const next = new Set(s);
                const pendingIds = rows.filter((r) => !resolved.has(r.id)).map((r) => r.id);
                const allSelected = pendingIds.every((id) => next.has(id));
                if (allSelected) for (const id of pendingIds) next.delete(id);
                else for (const id of pendingIds) next.add(id);
                return next;
              });
            }}
            onDecide={(r, a) => startTransition(() => { void decide(r, a); })}
            emptyText="No pathway-enrollment requests pending."
            targetHref={(id) => `/pathways/${id}`}
          />
        </div>
      )}
      {confirmNode}
    </section>
  );
}

function BulkButton({
  onClick, disabled, icon: Icon, tone, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const base = "inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50";
  const variant = tone === "danger"
    ? "bg-white text-rose-700 hover:bg-rose-50"
    : "bg-white text-brand-800 hover:bg-brand-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${variant}`}>
      <Icon size={12} />
      {children}
    </button>
  );
}

function GroupedColumn({
  title, icon: Icon, groups, resolved, selected, busyIds,
  onToggleOne, onToggleGroup, onDecide, emptyText, targetHref,
}: {
  title: string;
  icon: React.ElementType;
  groups: { targetId: string; targetTitle: string; rows: PendingRequest[] }[];
  resolved: Map<string, Resolved>;
  selected: Set<string>;
  busyIds: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleGroup: (rows: PendingRequest[]) => void;
  onDecide: (r: PendingRequest, a: "approve" | "reject") => void;
  emptyText: string;
  targetHref: (id: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 surface-shadow space-y-3">
      <h3 className="text-sm font-bold text-fg inline-flex items-center gap-2">
        <Icon size={14} className="text-brand-600" />
        {title}
        <span className="text-xs font-mono tabular-nums text-subtle">
          {groups.reduce((s, g) => s + g.rows.length, 0)}
        </span>
      </h3>

      {groups.length === 0 ? (
        <p className="text-xs text-muted italic">{emptyText}</p>
      ) : (
        groups.map((g) => {
          const pendingRows = g.rows.filter((r) => !resolved.has(r.id));
          const allPendingSelected =
            pendingRows.length > 0 && pendingRows.every((r) => selected.has(r.id));
          const someSelected =
            pendingRows.some((r) => selected.has(r.id)) && !allPendingSelected;
          return (
            <div key={g.targetId} className="rounded-xl bg-background border border-line">
              <div className="px-3 py-2 border-b border-line bg-elevated/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {pendingRows.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={() => onToggleGroup(g.rows)}
                      className="accent-brand-600 w-4 h-4"
                      title={allPendingSelected ? "Deselect group" : "Select all in group"}
                    />
                  )}
                  <Link
                    href={targetHref(g.targetId)}
                    className="text-sm font-bold text-fg hover:text-brand-700 truncate"
                  >
                    {g.targetTitle}
                  </Link>
                </div>
                <span className="text-xs font-mono tabular-nums text-subtle">
                  {pendingRows.length} pending · {g.rows.length} total
                </span>
              </div>
              <ul className="divide-y divide-line">
                {g.rows.map((r) => {
                  const decided = resolved.get(r.id) ?? null;
                  const isBusy = busyIds.has(r.id);
                  return (
                    <li
                      key={r.id}
                      className={`px-3 py-2.5 flex items-start gap-2 ${decided ? "opacity-65" : ""}`}
                    >
                      {!decided ? (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => onToggleOne(r.id)}
                          className="mt-1 accent-brand-600 w-4 h-4"
                        />
                      ) : (
                        <span className="w-4 mt-1" aria-hidden />
                      )}
                      {r.user.accountKind === "phantom" && (
                        <span title="Demo phantom" className="shrink-0 mt-0.5 inline-flex">
                          <Ghost size={12} className="text-amber-600" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg truncate">
                          {r.user.name ?? <span className="italic text-muted">No name</span>}
                        </p>
                        <p className="text-[11px] text-muted font-mono truncate">{r.user.email}</p>
                        {r.requestReason && (
                          <p className="text-[11px] text-subtle italic mt-1 line-clamp-2">"{r.requestReason}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {decided ? (
                          <ResolvedChip status={decided} />
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onDecide(r, "approve")}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onDecide(r, "reject")}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded disabled:opacity-50"
                            >
                              <XCircle size={10} /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}

function ResolvedChip({ status }: { status: Resolved }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full ring-1 ring-inset bg-emerald-100 text-emerald-800 ring-emerald-200">
        <CheckCircle2 size={9} /> Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full ring-1 ring-inset bg-rose-100 text-rose-800 ring-rose-200">
      <XCircle size={9} /> Rejected
    </span>
  );
}
