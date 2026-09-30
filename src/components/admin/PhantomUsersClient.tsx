"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Ghost, Plus, Trash2, RotateCw, ExternalLink, AlertTriangle, CheckCircle2,
  Hourglass, Sparkles,
} from "lucide-react";

export interface PhantomRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  organization: string | null;
  jobTitle: string | null;
  magicToken: string | null;
  /** ISO */
  expiresAt: string;
  /** ISO */
  createdAt: string;
  createdByAdminName: string | null;
}

const ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "trainee",    label: "Trainee",    hint: "200 starter credits — can enroll in courses immediately" },
  { value: "evaluating", label: "Evaluating", hint: "Same as trainee — for testing the evaluating-role flow" },
  { value: "employer",   label: "Employer",   hint: "0 credits — for testing employer portal flows" },
  { value: "instructor", label: "Instructor", hint: "0 credits — for testing instructor flows" },
];

export function PhantomUsersClient({
  initialRows,
  defaultHours,
  maxHours,
  maxBatch,
}: {
  initialRows: PhantomRow[];
  defaultHours: number;
  maxHours: number;
  maxBatch: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PhantomRow[]>(initialRows);
  const [count, setCount] = useState(5);
  const [role, setRole] = useState("trainee");
  const [hours, setHours] = useState(defaultHours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [, startTransition] = useTransition();

  // Keep rows in sync if the server re-renders us with fresh data.
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  // Tick once a minute so the countdown labels update without
  // requiring the admin to refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  function setFlashAuto(s: string) {
    setFlash(s);
    setTimeout(() => setFlash(null), 4000);
  }

  async function spawn() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/phantom-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, role, hours }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string; phantoms?: PhantomRow[];
      };
      if (!res.ok) throw new Error(data.error ?? "Spawn failed");
      setFlashAuto(`Spawned ${data.phantoms?.length ?? count} phantom${count === 1 ? "" : "s"}.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function deleteOne(p: PhantomRow) {
    if (!(await confirmDialog({ title: `Delete phantom ${p.name ?? p.email} now?`, confirmLabel: "Delete", tone: "destructive" }))) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/phantom-users/${p.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== p.id));
      setFlashAuto(`Deleted ${p.name ?? p.email}.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function extend(p: PhantomRow) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/phantom-users/${p.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 24 }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; expiresAt?: string };
      if (!res.ok) throw new Error(data.error ?? "Extend failed");
      if (data.expiresAt) {
        setRows((prev) =>
          prev.map((r) => (r.id === p.id ? { ...r, expiresAt: data.expiresAt! } : r)),
        );
      }
      setFlashAuto(`Extended ${p.name ?? p.email} by 24h.`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function deleteAll() {
    if (rows.length === 0) return;
    // No confirm prompt — phantoms are throwaway test fixtures and
    // the action is reversible with a 5-second spawn. The button was
    // demanding a confirm for the bulk case which slowed admins down
    // mid-demo for no real safety win.
    setBusy(true); setError(null);
    let failed = 0;
    for (const r of rows) {
      try {
        const res = await fetch(`/api/admin/phantom-users/${r.id}`, { method: "DELETE" });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    setFlashAuto(
      failed === 0
        ? `Deleted ${rows.length} phantoms.`
        : `Deleted ${rows.length - failed} / ${rows.length} (${failed} failed).`,
    );
    setRows([]);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function runSweep() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/phantom-users/sweep", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string; deleted?: number; failed?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Sweep failed");
      setFlashAuto(`Sweep: ${data.deleted ?? 0} expired phantoms deleted${data.failed ? `, ${data.failed} failed` : ""}.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {confirmNode}
      {/* Spawn form */}
      <section className="rounded-2xl border border-line bg-card p-5 surface-shadow space-y-4">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold text-fg inline-flex items-center gap-2">
            <Sparkles size={14} className="text-brand-600" /> Spawn phantoms
          </h2>
          <button
            type="button"
            onClick={() => startTransition(() => { void runSweep(); })}
            disabled={busy}
            className="text-xs font-semibold text-muted hover:text-fg inline-flex items-center gap-1 disabled:opacity-50"
            title="Run the expired-phantom sweep now (cron does this hourly anyway)"
          >
            <RotateCw size={11} /> Run sweep now
          </button>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="block text-xs font-bold text-fg mb-1">How many</span>
            <input
              type="number"
              min={1}
              max={maxBatch}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
              disabled={busy}
              className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono"
            />
            <span className="text-[11px] text-subtle">1 – {maxBatch} per batch</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs font-bold text-fg mb-1">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={busy}
              className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-subtle">
              {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-fg mb-1">TTL (hours)</span>
            <input
              type="number"
              min={1}
              max={maxHours}
              value={hours}
              onChange={(e) => setHours(Math.max(1, Math.min(maxHours, Number(e.target.value) || 1)))}
              disabled={busy}
              className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm font-mono"
            />
            <span className="text-[11px] text-subtle">1 – {maxHours}h</span>
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => startTransition(() => { void spawn(); })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 text-white px-5 py-2.5 text-sm font-bold hover:bg-brand-700 disabled:opacity-50 surface-shadow"
          >
            <Plus size={14} />
            Spawn {count} phantom{count === 1 ? "" : "s"}
          </button>
          <p className="text-xs text-muted leading-snug">
            Each gets a random name, a <code className="font-mono text-fg bg-elevated px-1 rounded">phantom-xxxx@bhn.test</code>{" "}
            email, and a magic-token sign-in link. Trainees + evaluating roles
            start with 200 credits so they can enroll in courses immediately.
          </p>
        </div>
      </section>

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

      {/* Active phantoms */}
      <section>
        <header className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-base font-bold text-fg inline-flex items-center gap-2">
            <Ghost size={14} className="text-brand-600" /> Currently alive
            <span className="text-xs font-mono tabular-nums text-subtle">{rows.length}</span>
          </h2>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => startTransition(() => { void deleteAll(); })}
              disabled={busy}
              className="admin-glow text-xs font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1 disabled:opacity-50 px-2 py-1 rounded-md ring-1 ring-inset ring-rose-200"
            >
              <Trash2 size={11} /> Delete all
            </button>
          )}
        </header>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
            <div className="w-10 h-10 mx-auto rounded-xl bg-elevated text-muted flex items-center justify-center mb-3">
              <Ghost size={16} />
            </div>
            <p className="text-sm font-medium text-muted">No phantoms alive right now.</p>
            <p className="text-xs text-subtle mt-1.5 max-w-md mx-auto leading-relaxed">
              Spawn a batch above. Use them anywhere a real user would
              work — Manage Enrollments, registrations, etc.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated text-[10px] uppercase tracking-[0.16em] font-bold text-subtle">
                <tr>
                  <th className="text-left px-3 py-2.5">Identity</th>
                  <th className="text-left px-3 py-2.5">Role</th>
                  <th className="text-left px-3 py-2.5">Credits</th>
                  <th className="text-left px-3 py-2.5">Expires</th>
                  <th className="text-left px-3 py-2.5">Minter</th>
                  <th className="text-right px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => {
                  const ttl = formatRemaining(p.expiresAt);
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-semibold text-fg">{p.name ?? <span className="text-subtle italic">No name</span>}</div>
                        <div className="text-xs text-muted font-mono">{p.email}</div>
                        {p.organization && (
                          <div className="text-[11px] text-subtle mt-0.5">{p.jobTitle} · {p.organization}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="text-xs font-mono text-fg">{p.role}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top font-mono tabular-nums text-fg text-xs">
                        {p.credits}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className={`inline-flex items-center gap-1 text-xs ${ttl.urgent ? "text-amber-700 font-bold" : "text-fg"}`}>
                          <Hourglass size={10} />
                          {ttl.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs text-muted">
                        {p.createdByAdminName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-1 justify-end">
                          {p.magicToken && (
                            <a
                              href={`/sandbox/${p.magicToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline px-2 py-1"
                              title="Sign in as this phantom (opens in new tab)"
                            >
                              Sign in <ExternalLink size={10} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => startTransition(() => { void extend(p); })}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-fg px-2 py-1 disabled:opacity-50"
                            title="Extend TTL by 24h"
                          >
                            <RotateCw size={11} /> +24h
                          </button>
                          <button
                            type="button"
                            onClick={() => startTransition(() => { void deleteOne(p); })}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded disabled:opacity-50"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatRemaining(iso: string): { label: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "expiring…", urgent: true };
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return { label: `${minutes}m`, urgent: minutes < 60 };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h ${minutes % 60}m`, urgent: hours < 2 };
  const days = Math.floor(hours / 24);
  return { label: `${days}d ${hours % 24}h`, urgent: false };
}
