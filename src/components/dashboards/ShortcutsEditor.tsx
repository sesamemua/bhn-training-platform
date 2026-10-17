"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  BookOpen, Bookmark, Briefcase, Calendar, Check, ChevronDown, ClipboardList, Coins, FileText, Gift, GraduationCap,
  Images, Mail, Megaphone, MessageSquareText, Mic, Palette, Pencil, Pin, PinOff, Plus, Printer, Settings, Speaker,
  Users, Video, X, Zap, type LucideIcon,
} from "lucide-react";
import { saveShortcuts } from "@/app/(dashboard)/dashboard/shortcut-actions";
import {
  ShortcutPrefsSchema, buildShortcuts, pageLabel, toShortcutPath,
  type Shortcut, type ShortcutCandidate, type ShortcutPrefs,
} from "@/lib/page-usage";

type Draft = { from: string | null; label: string; path: string };

const TILE_MIN = 168; // px — narrowest a tile gets before the row drops one
const TILE_GAP = 8;
// Fixed radii: the theme's rounded-* scale turns these into pills.
const TILE = "group flex min-w-0 items-center gap-2.5 rounded-[10px] border border-line bg-card px-2.5 py-2 text-left shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors";

// First match wins; anything else gets a bookmark.
const ICONS: [RegExp, LucideIcon][] = [
  [/social/, Megaphone], [/video/, Video], [/design-review|logo|brand/, Palette],
  [/website-review/, MessageSquareText], [/speakers/, Mic], [/print/, Printer], [/\/av\b/, Speaker],
  [/newsletter|mail|templates/, Mail], [/merch|rewards/, Gift], [/registration|forms|registrants|applications?\b/, ClipboardList],
  [/training|courses|my-courses|pathways|gradebook/, GraduationCap], [/events|calendar|interviews/, Calendar],
  [/users|team|buddy|talent/, Users], [/credits|equip|funding/, Coins], [/internships|postings|jobs?\b/, Briefcase],
  [/images|gallery|photos/, Images], [/catalog|library|stories/, BookOpen], [/settings|preferences|profile/, Settings],
  [/docs|changelog|resume|bullet/, FileText], [/marketing|ads/, Megaphone],
];
const iconFor = (path: string) => ICONS.find(([re]) => re.test(path))?.[1] ?? Bookmark;

/**
 * Personal shortcut tiles under the dashboard hero. Pinned shortcuts always
 * show; the user's most-used pages fill one row — as many tiles as fit the
 * screen. Edit mode lets them keep, rename / retarget, remove or add
 * shortcuts — saved per user.
 */
export function ShortcutsEditor({ candidates, initialPrefs }: { candidates: ShortcutCandidate[]; initialPrefs: ShortcutPrefs }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const grid = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(6);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setCols(Math.max(2, Math.floor((el.clientWidth + TILE_GAP) / (TILE_MIN + TILE_GAP))));
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  // Narrow screens get two rows; the last slot is always the Add tile.
  const { shown, more } = buildShortcuts(candidates, prefs, cols * (cols < 4 ? 2 : 1) - 1);

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

  const tile = (s: Shortcut) => {
    if (draft?.from === s.path) return null;
    const Icon = iconFor(s.path);
    const badge = (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white" aria-hidden>
        <Icon size={18} strokeWidth={1.75} />
      </span>
    );
    return editing ? (
      <div key={s.path} className={TILE}>
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{s.label}</span>
          <span className="mt-0.5 flex items-center gap-0.5">
            <IconButton label={s.pinned ? `Stop keeping ${s.label}` : `Keep ${s.label} on the list`} onClick={() => (s.pinned ? unkeep(s) : keep(s))}>
              {s.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </IconButton>
            <IconButton label={`Rename or change ${s.label}`} onClick={() => setDraft({ from: s.path, label: s.label, path: s.path })}>
              <Pencil size={12} />
            </IconButton>
            <IconButton label={`Remove ${s.label}`} onClick={() => remove(s)}><X size={12} /></IconButton>
          </span>
        </span>
      </div>
    ) : (
      <Link key={s.path} href={s.path} title={`${s.label} — ${s.path}`}
        className={`${TILE} hover:border-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500`}>
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg group-hover:text-brand-700">{s.label}</span>
          <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
            {s.pinned && <Pin size={10} className="text-brand-600" aria-hidden />}
            {s.pinned ? "Kept" : `${s.visits} visits`}
          </span>
        </span>
      </Link>
    );
  };

  return (
    <nav aria-label="Your shortcuts" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-black text-brand-700">
          <Zap size={12} className="text-brand-600" /> Your shortcuts
        </span>
        {shown.length === 0 && !draft && <span className="text-xs text-fg-muted">Pages you open often show up here.</span>}
        <span className="ml-auto inline-flex items-center gap-3">
          {pending && <span className="text-[11px] text-fg-subtle">Saving…</span>}
          {more.length > 0 && (
            <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              {showMore ? "See less" : `See ${more.length} more`} <ChevronDown size={12} className={showMore ? "rotate-180" : ""} />
            </button>
          )}
          <button type="button" onClick={() => { setEditing((v) => !v); setDraft(null); setError(null); }} aria-pressed={editing}
            className="inline-flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
            {editing ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit</>}
          </button>
        </span>
      </div>

      <div ref={grid} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {shown.map(tile)}
        {showMore && more.map(tile)}
        <button type="button" onClick={() => setDraft({ from: null, label: "", path: "" })}
          className={`${TILE} border-dashed text-fg-muted hover:border-brand-400 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-dashed border-line" aria-hidden><Plus size={16} /></span>
          <span className="truncate text-sm font-semibold">Add shortcut</span>
        </button>
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
