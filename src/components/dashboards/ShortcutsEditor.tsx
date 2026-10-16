"use client";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { ArrowRight, Check, ChevronDown, Pencil, Pin, PinOff, Plus, X, Zap } from "lucide-react";
import { saveShortcuts } from "@/app/(dashboard)/dashboard/shortcut-actions";
import {
  ShortcutPrefsSchema, buildShortcuts, pageLabel, toShortcutPath,
  type Shortcut, type ShortcutCandidate, type ShortcutPrefs,
} from "@/lib/page-usage";

type Draft = { from: string | null; label: string; path: string };

/**
 * Personal shortcut row under the dashboard hero. Pinned shortcuts always
 * show; the user's most-used pages fill the row to five. Edit mode lets them
 * keep, rename / retarget, remove or add shortcuts — saved per user.
 */
export function ShortcutsEditor({ candidates, initialPrefs }: { candidates: ShortcutCandidate[]; initialPrefs: ShortcutPrefs }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const { shown, more } = buildShortcuts(candidates, prefs);

  function save(next: ShortcutPrefs) {
    const parsed = ShortcutPrefsSchema.safeParse(next);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "That shortcut can’t be saved.");
    const before = prefs;
    setPrefs(parsed.data);
    setError(null);
    startTransition(async () => {
      const result = await saveShortcuts(parsed.data).catch(() => ({ ok: false as const, error: "Couldn’t save. Check your connection and try again." }));
      if (!result.ok) { setPrefs(before); setError(result.error); }
    });
  }
  const without = (path: string) => prefs.pinned.filter((p) => p.path !== path);
  const keep = (s: Shortcut) => save({ pinned: [...prefs.pinned, { path: s.path, label: s.label }], hidden: prefs.hidden.filter((h) => h !== s.path) });
  const unkeep = (s: Shortcut) => save({ ...prefs, pinned: without(s.path) });
  const remove = (s: Shortcut) => save({ pinned: without(s.path), hidden: [...prefs.hidden.filter((h) => h !== s.path), s.path].slice(-200) });

  function submitDraft() {
    if (!draft) return;
    const path = toShortcutPath(draft.path, window.location.origin);
    if (!path) return setError("Use a page on this platform, e.g. /events or a link copied from the address bar.");
    const entry = { path, label: draft.label.trim() || pageLabel(path) };
    const index = draft.from === null ? -1 : prefs.pinned.findIndex((p) => p.path === draft.from);
    const pinned = index >= 0 ? prefs.pinned.map((p, i) => (i === index ? entry : p)) : [...prefs.pinned, entry];
    save({ pinned, hidden: prefs.hidden.filter((h) => h !== path) });
    setDraft(null);
  }

  const chip = (s: Shortcut) =>
    draft?.from === s.path ? null : editing ? (
      <span key={s.path} className="inline-flex items-center gap-1 rounded-full border border-line bg-card pl-3 pr-1 py-1 text-xs font-semibold text-fg">
        {s.label}
        <IconButton label={s.pinned ? `Stop keeping ${s.label}` : `Keep ${s.label} on the list`} onClick={() => (s.pinned ? unkeep(s) : keep(s))}>
          {s.pinned ? <PinOff size={12} /> : <Pin size={12} />}
        </IconButton>
        <IconButton label={`Rename or change ${s.label}`} onClick={() => setDraft({ from: s.path, label: s.label, path: s.path })}>
          <Pencil size={12} />
        </IconButton>
        <IconButton label={`Remove ${s.label}`} onClick={() => remove(s)}><X size={12} /></IconButton>
      </span>
    ) : (
      <Link key={s.path} href={s.path} title={s.visits ? `${s.visits} visits in the last 30 days` : s.path}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg hover:border-brand-400 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
        {s.pinned && <Pin size={11} className="text-brand-600" aria-label="Kept" />}
        {s.label} <ArrowRight size={11} className="text-fg-subtle" />
      </Link>
    );

  return (
    <nav aria-label="Your shortcuts" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-black text-brand-700">
          <Zap size={12} className="text-brand-600" /> Your shortcuts
        </span>
        {shown.map(chip)}
        {shown.length === 0 && !draft && <span className="text-xs text-fg-muted">Pages you open often show up here. Add your own any time.</span>}
        {showMore && more.map(chip)}
        {more.length > 0 && (
          <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            {showMore ? "See less" : `See ${more.length} more`} <ChevronDown size={12} className={showMore ? "rotate-180" : ""} />
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-3">
          {pending && <span className="text-[11px] text-fg-subtle">Saving…</span>}
          <button type="button" onClick={() => setDraft({ from: null, label: "", path: "" })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            <Plus size={12} /> Add
          </button>
          <button type="button" onClick={() => { setEditing((v) => !v); setDraft(null); setError(null); }} aria-pressed={editing}
            className="inline-flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
            {editing ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit</>}
          </button>
        </span>
      </div>

      {draft && (
        <form onSubmit={(e) => { e.preventDefault(); submitDraft(); }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-3">
          <label className="text-[11px] font-semibold text-fg-muted">
            Name
            <input id="shortcut-label" value={draft.label} maxLength={40} placeholder="e.g. Social"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              className="mt-1 block w-40 rounded-md border border-line bg-card px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="text-[11px] font-semibold text-fg-muted min-w-0 flex-1">
            Page (path or link)
            <input id="shortcut-path" value={draft.path} required list={listId} placeholder="/admin/workspace/marketing/social" autoFocus
              onChange={(e) => setDraft({ ...draft, path: e.target.value })}
              className="mt-1 block w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm font-mono text-fg" />
          </label>
          <datalist id={listId}>
            {candidates.map((c) => <option key={c.path} value={c.path}>{c.label}</option>)}
          </datalist>
          <button type="submit" className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
            {draft.from === null ? "Add shortcut" : "Save"}
          </button>
          <button type="button" onClick={() => setDraft(null)} className="px-2 py-1.5 text-xs font-semibold text-fg-muted hover:text-fg">Cancel</button>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </nav>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-full text-fg-subtle hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
      {children}
    </button>
  );
}
