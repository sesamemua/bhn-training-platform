"use client";

/** Call sheet list: new, open, duplicate, delete. */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, Loader2, Plus, Trash2, Users } from "lucide-react";
import {
  createCallSheet, deleteCallSheet, duplicateCallSheet,
} from "@/app/(dashboard)/admin/workspace/marketing/video/call-sheets/actions";

const BASE = "/admin/workspace/marketing/video/call-sheets";

export interface CallSheetRow {
  id: string;
  title: string;
  shootDate: string;
  location: string;
  generalCall: string;
  people: number;
  updatedAt: string;
}

export function fmtShootDate(d: string): string {
  if (!d) return "Date not set";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function CallSheetList({ sheets }: { sheets: CallSheetRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (id: string) => router.push(`${BASE}/${id}`);

  function create() {
    setError(null);
    start(async () => {
      const r = await createCallSheet();
      if (r.ok) go(r.id); else setError(r.error);
    });
  }
  function duplicate(id: string) {
    setError(null);
    setBusyId(id);
    start(async () => {
      const r = await duplicateCallSheet(id);
      setBusyId(null);
      if (r.ok) go(r.id); else setError(r.error);
    });
  }
  function remove(id: string, title: string) {
    if (!confirm(`Delete “${title}”? This can't be undone.`)) return;
    setBusyId(id);
    start(async () => {
      await deleteCallSheet(id);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending && !busyId ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New call sheet
        </button>
        {error && <span className="text-[12.5px] text-rose-600">{error}</span>}
      </div>

      {sheets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          No call sheets yet. Start one with <strong>New call sheet</strong>.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card-solid">
          {sheets.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Link href={`${BASE}/${s.id}`} className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
                <div className="truncate text-[14px] font-semibold text-fg hover:underline">{s.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden /> {fmtShootDate(s.shootDate)}</span>
                  {s.generalCall && <span>Call {s.generalCall}</span>}
                  <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden /> {s.people}</span>
                  {s.location && <span className="truncate">{s.location}</span>}
                </div>
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => duplicate(s.id)}
                  disabled={pending}
                  title="Duplicate"
                  aria-label={`Duplicate ${s.title}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
                >
                  {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id, s.title)}
                  disabled={pending}
                  title="Delete"
                  aria-label={`Delete ${s.title}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
