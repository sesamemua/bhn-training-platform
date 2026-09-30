"use client";

/**
 * Reach-out history for one outreach contact: a timeline of every logged
 * touch (when · what · who initiated · which list it was for) plus a quick
 * "log a reach-out" form. Opened from the chip on any Outreach row.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, Loader2, Trash2, Mail, Phone, Users, AtSign, CalendarDays,
  MessageCircle, Plus, UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Touch {
  id: string;
  kind: string;
  note: string;
  happenedAt: string;
  byName: string;
  listName: string | null;
}

const KIND_META: Record<string, { label: string; Icon: typeof Mail }> = {
  email: { label: "Email", Icon: Mail },
  call: { label: "Call", Icon: Phone },
  meeting: { label: "Meeting", Icon: Users },
  linkedin: { label: "LinkedIn", Icon: AtSign },
  event: { label: "Event", Icon: CalendarDays },
  other: { label: "Other", Icon: MessageCircle },
};

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};

export function TouchLogModal({
  personId,
  personName,
  listId,
  onClose,
}: {
  personId: string;
  personName: string;
  /** List context the modal was opened from — stamped on new touches. */
  listId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [touches, setTouches] = useState<Touch[] | null>(null);
  const [kind, setKind] = useState("email");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspace/outreach/people/${personId}/touches`).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; touches?: Touch[] }) : {};
    setTouches(j.ok && Array.isArray(j.touches) ? j.touches : []);
  }, [personId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function add() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/outreach/people/${personId}/touches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          note: note.trim(),
          happenedAt: new Date(`${date}T12:00:00`).toISOString(),
          listId: listId ?? undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; touch?: Touch; error?: string };
      if (!res.ok || !j.ok || !j.touch) {
        setError(j.error ?? "Couldn't log it — try again.");
        return;
      }
      setTouches((cur) => [j.touch!, ...(cur ?? [])]);
      setNote("");
      router.refresh(); // updates the row chips behind the modal
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: Touch) {
    if (!(await confirmDialog({ title: "Delete this logged reach-out?", confirmLabel: "Delete", tone: "destructive" }))) return;
    setTouches((cur) => (cur ?? []).filter((x) => x.id !== t.id));
    await fetch(`/api/workspace/outreach/touches/${t.id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {confirmNode}
      <div className="flex max-h-[82vh] w-full max-w-xl flex-col rounded-2xl border border-line bg-card-solid shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-subtle">Reach-out history</p>
            <h2 className="truncate text-base font-bold text-fg">{personName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg">
            <X size={16} />
          </button>
        </div>

        {/* Log form */}
        <div className="border-b border-line px-5 py-3.5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">What</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 block rounded-md border border-line bg-card-solid px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400">
                {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">When</span>
              <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-md border border-line bg-card-solid px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">About</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !saving && add()}
                placeholder="e.g. Sent the symposium cross-promo kit"
                className="mt-1 block w-full rounded-md border border-line bg-card-solid px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <button type="button" onClick={add} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Log it
            </button>
          </div>
          {error && <p className="mt-1.5 text-[11px] text-rose-700">{error}</p>}
        </div>

        {/* Timeline */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {touches === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>
          ) : touches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No reach-outs logged yet — this is the first.</p>
          ) : (
            <ul className="space-y-2.5">
              {touches.map((t) => {
                const meta = KIND_META[t.kind] ?? KIND_META.other;
                return (
                  <li key={t.id} className="group flex items-start gap-3 rounded-lg border border-line bg-elevated/30 px-3 py-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                      <meta.Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
                        <span className="font-semibold text-fg">{meta.label}</span>
                        <span className="text-muted">{fmtDate(t.happenedAt)}</span>
                        <span className="inline-flex items-center gap-1 text-muted"><UserRound size={10} /> {t.byName}</span>
                        {t.listName && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{t.listName}</span>}
                      </p>
                      {t.note && <p className="mt-0.5 text-[12px] leading-relaxed text-fg">{t.note}</p>}
                    </div>
                    <button
                      type="button"
                      title="Delete this entry"
                      onClick={() => remove(t)}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-elevated hover:text-rose-700 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className={cn("border-t border-line px-5 py-2.5 text-[10.5px] text-muted")}>
          Who initiated is recorded automatically from your account. Entries log against the person, so the history follows them across lists.
        </p>
      </div>
    </div>
  );
}
