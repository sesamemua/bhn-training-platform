"use client";

import { useMemo, useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, CheckCircle2, Circle, UserX, AlertTriangle, MoreHorizontal,
  XCircle, RotateCcw, Mail, ExternalLink, StickyNote, Trash2,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface RegistrationRow {
  id: string;
  name: string | null;
  email: string;
  attendeeType: string;
  registrationStatus: string;
  paymentStatus: string;
  includesSymposiumDay: boolean;
  dietaryRestrictions: string | null;
  accessibilityNeeds: string | null;
  adminNote: string | null;
  /** ISO string or null */
  checkedInAt: string | null;
  /** ISO string */
  createdAt: string;
}

type StatusFilter =
  | "all" | "pending" | "confirmed" | "cancelled" | "checked-in" | "not-checked-in" | "vip";

type BulkAction = "check-in" | "uncheck-in" | "cancel" | "reinstate";

/**
 * Client-side registrations table — the day-of operations cockpit.
 *
 * Capabilities
 *   • Search by name + email
 *   • Filter chips for status and check-in state, plus a "VIP"
 *     filter (= has any admin note)
 *   • Row selection with a header "select all visible" affordance
 *   • Bulk action bar (appears when 1+ row selected): check in,
 *     uncheck, cancel, reinstate
 *   • Per-row inline check-in toggle (one-tap for the door)
 *   • Per-row actions menu (•••): open detail, cancel/reinstate,
 *     resend email — for quick correction without leaving the table
 *   • Admin-note pill rendered next to the name when set; hover
 *     shows the full text
 */
export function RegistrationsTable({
  slug,
  rows: initialRows,
}: {
  slug: string;
  rows: RegistrationRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RegistrationRow[]>(initialRows);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Keep rows in sync with server data after a router.refresh()
  // (e.g. when bulk ops cause many rows to change).
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Close any open row-action menu on outside click.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.name ?? ""} ${r.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (status) {
        case "pending":
        case "confirmed":
        case "cancelled":
          return r.registrationStatus === status;
        case "checked-in":
          return r.checkedInAt !== null;
        case "not-checked-in":
          return r.checkedInAt === null && r.registrationStatus === "confirmed";
        case "vip":
          return (r.adminNote ?? "").trim().length > 0;
        default:
          return true;
      }
    });
  }, [rows, query, status]);

  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setFlashAuto(s: string) {
    setFlash(s);
    setTimeout(() => setFlash(null), 4000);
  }

  // ── Single-row check-in toggle (optimistic) ────────────────────
  async function toggleCheckIn(row: RegistrationRow) {
    const desired = row.checkedInAt === null;
    setBusyIds((s) => new Set(s).add(row.id));
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, checkedInAt: desired ? new Date().toISOString() : null }
          : r,
      ),
    );
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${row.id}/check-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkedIn: desired }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Toggle failed (${res.status})`);
      }
      const data = (await res.json()) as {
        registration: { id: string; checkedInAt: string | null };
      };
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, checkedInAt: data.registration.checkedInAt } : r,
        ),
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, checkedInAt: row.checkedInAt } : r)),
      );
      setError((err as Error).message);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

  // ── Per-row hard delete ────────────────────────────────────────
  async function deleteRow(row: RegistrationRow) {
    if (!(await confirmDialog({
      title: `Permanently delete ${row.name ?? row.email}'s registration?`,
      description:
        `This can't be undone from the UI. Workshop bookings will be ` +
        `released and waitlisters promoted. For a soft-cancel that ` +
        `keeps the row recoverable, use Cancel instead.`,
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${row.id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        cancelMeta?: { cancelledBookings: number; promoted: number } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      // Drop from selection if it was ticked.
      setSelected((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
      const meta = data.cancelMeta;
      const detail = meta && meta.cancelledBookings > 0
        ? ` — ${meta.cancelledBookings} booking${meta.cancelledBookings === 1 ? "" : "s"} released${meta.promoted > 0 ? `, ${meta.promoted} waitlister${meta.promoted === 1 ? "" : "s"} promoted` : ""}`
        : "";
      setFlashAuto(`Deleted${detail}.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

  // ── Per-row "Cancel" / "Reinstate" via PATCH ───────────────────
  async function setRowStatus(row: RegistrationRow, newStatus: "cancelled" | "confirmed") {
    if (newStatus === "cancelled") {
      const ok = await confirmDialog({
        title: `Cancel registration for ${row.name ?? row.email}?`,
        description:
          `This releases their workshop bookings (waitlisters get promoted). ` +
          `Reversible, but workshop bookings won't auto-restore.`,
        confirmLabel: "Cancel registration",
        cancelLabel: "Keep",
        tone: "warning",
      });
      if (!ok) return;
    }
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationStatus: newStatus }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        cancelMeta?: { cancelledBookings: number; promoted: number } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, registrationStatus: newStatus } : r,
        ),
      );
      const meta = data.cancelMeta;
      setFlashAuto(
        newStatus === "cancelled"
          ? (meta && meta.cancelledBookings > 0
              ? `Cancelled — ${meta.cancelledBookings} booking${meta.cancelledBookings === 1 ? "" : "s"} released${meta.promoted > 0 ? `, ${meta.promoted} waitlister${meta.promoted === 1 ? "" : "s"} promoted` : ""}.`
              : "Registration cancelled.")
          : "Reinstated. Workshop bookings were not restored.",
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

  // ── Per-row resend email ───────────────────────────────────────
  async function resendEmail(row: RegistrationRow) {
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/${row.id}/resend-email`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Email send failed");
      setFlashAuto(`Email re-sent to ${row.email}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

  // ── Bulk operation ─────────────────────────────────────────────
  async function bulkRun(action: BulkAction) {
    if (selected.size === 0) return;
    const friendly = {
      "check-in": "check in",
      "uncheck-in": "clear check-in for",
      "cancel": "cancel",
      "reinstate": "reinstate",
    }[action];
    if (action === "cancel") {
      const ok = await confirmDialog({
        title: `Cancel ${selected.size} registration${selected.size === 1 ? "" : "s"}?`,
        description: `Each one will release their workshop bookings. Waitlisters get promoted.`,
        confirmLabel: "Cancel registrations",
        cancelLabel: "Keep",
        tone: "warning",
      });
      if (!ok) return;
    }
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/events/${slug}/registrations/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationIds: Array.from(selected),
            action,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        results?: { id: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) throw new Error(data.error ?? "Bulk operation failed");
      const results = data.results ?? [];
      const fails = results.filter((r) => !r.ok);
      setFlashAuto(
        fails.length === 0
          ? `Bulk ${friendly}: ${results.length} succeeded.`
          : `Bulk ${friendly}: ${results.length - fails.length} succeeded, ${fails.length} failed.`,
      );
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {confirmNode}
      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full bg-card border border-line rounded-xl pl-8 pr-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["confirmed", "Confirmed"],
              ["pending", "Pending"],
              ["cancelled", "Cancelled"],
              ["checked-in", "Checked in"],
              ["not-checked-in", "Not checked in"],
              ["vip", "Has note"],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => {
            const active = status === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`text-xs font-semibold rounded-full px-3 py-1 ring-1 ring-inset transition-colors ${
                  active
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-card text-muted ring-line hover:text-fg"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="ml-auto text-xs text-subtle tabular-nums font-mono">
          {filtered.length} / {rows.length}
        </p>
      </div>

      {/* Bulk action bar — only when something is selected */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 rounded-2xl bg-brand-600 text-white px-4 py-3 surface-shadow flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold">
            {selected.size} selected
          </p>
          <BulkButton onClick={() => bulkRun("check-in")} disabled={bulkBusy} icon={CheckCircle2}>Check in</BulkButton>
          <BulkButton onClick={() => bulkRun("uncheck-in")} disabled={bulkBusy} icon={Circle}>Clear check-in</BulkButton>
          <BulkButton onClick={() => bulkRun("cancel")} disabled={bulkBusy} icon={XCircle} tone="danger">Cancel</BulkButton>
          <BulkButton onClick={() => bulkRun("reinstate")} disabled={bulkBusy} icon={RotateCcw}>Reinstate</BulkButton>
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
        <div className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-rose-700 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-900 leading-snug">{error}</p>
        </div>
      )}
      {flash && (
        <div className="rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-200 px-4 py-3 flex items-start gap-2">
          <CheckCircle2 size={14} className="text-emerald-700 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-900 leading-snug">{flash}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-10 text-center">
          <div className="w-10 h-10 mx-auto rounded-xl bg-elevated text-muted flex items-center justify-center mb-3">
            <UserX size={16} />
          </div>
          <p className="text-sm font-medium text-muted">No registrations match your filter.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated text-[10px] uppercase tracking-[0.16em] font-bold text-subtle">
              <tr>
                <th className="text-left px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    className="accent-brand-600 w-4 h-4 align-middle"
                    title={allVisibleSelected ? "Deselect all visible" : "Select all visible"}
                  />
                </th>
                <th className="text-left px-3 py-2.5">Attendee</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Payment</th>
                <th className="text-left px-3 py-2.5">Needs</th>
                <th className="text-left px-3 py-2.5">Check-in</th>
                <th className="text-right px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => {
                const isCheckedIn = r.checkedInAt !== null;
                const cancelled = r.registrationStatus === "cancelled";
                const isSelected = selected.has(r.id);
                const hasNote = (r.adminNote ?? "").trim().length > 0;
                return (
                  <tr
                    key={r.id}
                    className={
                      cancelled
                        ? "opacity-60"
                        : isSelected
                          ? "bg-brand-50/40"
                          : ""
                    }
                  >
                    <td className="px-3 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(r.id)}
                        className="accent-brand-600 w-4 h-4 align-middle"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/admin/events/${slug}/registrations/${r.id}`}
                          className="font-semibold text-fg hover:text-brand-700 hover:underline"
                        >
                          {r.name ?? <span className="text-subtle italic">No name</span>}
                        </Link>
                        {hasNote && (
                          <span
                            title={r.adminNote ?? ""}
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-200 cursor-help"
                          >
                            <StickyNote size={9} /> Note
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        <a href={`mailto:${r.email}`} className="hover:text-fg">{r.email}</a>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className="text-xs font-mono text-fg">{r.attendeeType}</span>
                      {!r.includesSymposiumDay && (
                        <span className="block text-[10px] text-amber-700 font-bold uppercase tracking-wider mt-0.5">
                          Workshops only
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <RegStatusChip status={r.registrationStatus} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className="text-xs text-fg font-mono">{r.paymentStatus}</span>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {r.dietaryRestrictions && (
                          <NeedChip label="Diet" detail={r.dietaryRestrictions} />
                        )}
                        {r.accessibilityNeeds && (
                          <NeedChip label="Access" detail={r.accessibilityNeeds} />
                        )}
                        {!r.dietaryRestrictions && !r.accessibilityNeeds && (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <button
                        type="button"
                        disabled={cancelled || busyIds.has(r.id)}
                        onClick={() => startTransition(() => { void toggleCheckIn(r); })}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1 ring-1 ring-inset transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          isCheckedIn
                            ? "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200"
                            : "bg-card text-muted ring-line hover:text-fg hover:border-brand-300"
                        }`}
                        title={
                          cancelled
                            ? "Reinstate registration before checking in"
                            : isCheckedIn
                              ? `Checked in ${new Date(r.checkedInAt!).toLocaleString()}`
                              : "Click to check in"
                        }
                      >
                        {isCheckedIn ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                        {isCheckedIn ? "In" : "Check in"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right relative">
                      <button
                        type="button"
                        disabled={busyIds.has(r.id)}
                        onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                        className="inline-flex items-center text-muted hover:text-fg p-1 rounded hover:bg-elevated disabled:opacity-50"
                        title="More actions"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {openMenu === r.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-3 top-full mt-1 w-56 rounded-xl bg-card border border-line shadow-lg z-20 py-1"
                        >
                          <MenuItem
                            icon={ExternalLink}
                            onClick={() => {
                              setOpenMenu(null);
                              router.push(`/admin/events/${slug}/registrations/${r.id}`);
                            }}
                          >
                            Open detail page
                          </MenuItem>
                          <MenuItem
                            icon={Mail}
                            onClick={() => {
                              setOpenMenu(null);
                              startTransition(() => { void resendEmail(r); });
                            }}
                          >
                            Resend confirmation email
                          </MenuItem>
                          <div className="border-t border-line my-1" />
                          {cancelled ? (
                            <MenuItem
                              icon={RotateCcw}
                              onClick={() => {
                                setOpenMenu(null);
                                startTransition(() => { void setRowStatus(r, "confirmed"); });
                              }}
                            >
                              Reinstate registration
                            </MenuItem>
                          ) : (
                            <MenuItem
                              icon={XCircle}
                              danger
                              onClick={() => {
                                setOpenMenu(null);
                                startTransition(() => { void setRowStatus(r, "cancelled"); });
                              }}
                            >
                              Cancel registration
                            </MenuItem>
                          )}
                          <MenuItem
                            icon={Trash2}
                            danger
                            onClick={() => {
                              setOpenMenu(null);
                              startTransition(() => { void deleteRow(r); });
                            }}
                          >
                            Delete permanently
                          </MenuItem>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const variant =
    tone === "danger"
      ? "bg-white text-rose-700 hover:bg-rose-50"
      : "bg-white text-brand-800 hover:bg-brand-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${variant}`}>
      <Icon size={12} />
      {children}
    </button>
  );
}

function MenuItem({
  icon: Icon, onClick, danger, children,
}: {
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-elevated ${
        danger ? "text-rose-700" : "text-fg"
      }`}
    >
      <Icon size={12} className={danger ? "text-rose-600" : "text-subtle"} />
      {children}
    </button>
  );
}

function RegStatusChip({ status }: { status: string }) {
  const tints: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 ring-amber-200",
    confirmed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${tints[status] ?? tints.pending}`}
    >
      {status}
    </span>
  );
}

function NeedChip({ label, detail }: { label: string; detail: string }) {
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-200 cursor-help"
      title={detail}
    >
      {label}
    </span>
  );
}
