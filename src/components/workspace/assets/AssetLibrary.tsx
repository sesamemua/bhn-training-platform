"use client";
/* eslint-disable @next/next/no-img-element -- R2 thumbnails are already sized; next/image would re-optimise them */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, CloudUpload, Folder, FolderInput, Images, Layers, Lock, Plus, RotateCcw, Search, Share2, Sparkles, Tag, Trash2, X, Users, Clock, ShieldCheck,
  Film, Copy as CopyIcon, TrendingUp, Play, Bookmark, Wand2,
} from "lucide-react";
import type { AssetCard } from "@/lib/assets/store";
import { ASSET_FOLDERS, CONSENT, CONSENT_LABEL, MAX_VIDEO_BYTES, ORIGIN_LABEL, ORIGINS, SWATCHES, type Consent, type Origin, type Swatch } from "@/lib/assets/core";
import { fitPicture } from "@/components/workspace/PictureDrop";
import { cn } from "@/lib/utils";
import { AssetDetailPanel, clock } from "./AssetDetailPanel";
import { AskLibrary } from "./AskLibrary";

type View = "all" | "unused" | "brand" | "expiring" | "trash" | "duplicates" | "videos" | "top";
export interface Collection { id: string; name: string; count: number; assetIds: string[]; shareToken: string | null; shareExpiresAt: string | null; smart?: boolean; views?: number }
interface Upload { id: string; name: string; state: "waiting" | "uploading" | "added" | "duplicate" | "failed"; error?: string }

const VIEWS: [View, string, React.ElementType][] = [
  ["all", "All", Images], ["videos", "Videos", Film], ["top", "Most used", TrendingUp], ["unused", "Not used", Layers], ["duplicates", "Duplicates", CopyIcon],
  ["brand", "Brand kit", ShieldCheck], ["expiring", "Expiring", Clock], ["trash", "Trash", Trash2],
];
const ORIGIN_DOT: Record<string, string> = { ai_generated: "text-violet-600", ai_edited: "text-violet-500" };
const CONSENT_DOT: Record<string, string> = { given: "bg-emerald-500", not_needed: "bg-sky-500", unknown: "bg-amber-400", refused: "bg-rose-500" };
const MAX_UPLOAD = 4_300_000;

export function AssetLibrary() {
  const [assets, setAssets] = useState<AssetCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<{ tag: string; n: number }[]>([]);
  const [folders, setFolders] = useState<{ name: string; n: number }[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("all");
  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [color, setColor] = useState<Swatch | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bulkTag, setBulkTag] = useState("");
  const [importLeft, setImportLeft] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastClicked = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setCols(Math.max(2, Math.floor(el.clientWidth / 230)));
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el); window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams({ view });
    if (q.trim()) p.set("q", q.trim());
    if (folder) p.set("folder", folder);
    if (tag) p.set("tag", tag);
    if (color) p.set("color", color);
    if (consent) p.set("consent", consent);
    if (origin) p.set("origin", origin);
    if (collection) p.set("collection", collection);
    return p.toString();
  }, [q, view, folder, tag, color, consent, origin, collection]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/assets?${params}`, { signal });
      const j = await res.json() as { assets?: AssetCard[]; tags?: { tag: string; n: number }[]; folders?: { name: string; n: number }[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load the library.");
      setAssets(j.assets ?? []); setTags(j.tags ?? []); setFolders(j.folders ?? []);
    } catch (e) { if (!signal?.aborted) setNote((e as Error).message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [params]);

  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(() => void load(c.signal), q ? 280 : 0);
    return () => { clearTimeout(t); c.abort(); };
  }, [load, q]);

  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/workspace/assets/collections", { signal: c.signal }).then((r) => r.json())
      .then((j: { collections?: Collection[] }) => setCollections(j.collections ?? [])).catch(() => {});
    void fetch("/api/workspace/assets/import", { signal: c.signal }).then((r) => r.json())
      .then((j: { remaining?: number }) => setImportLeft(j.remaining ?? 0)).catch(() => {});
    return () => c.abort();
  }, []);

  // ── Upload: anywhere on the page, one request per file so each shows its own state ──
  const uploadVideo = useCallback(async (file: File, mark: (patch: Partial<Upload>) => void) => {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Over 500 MB.");
    const start = await fetch("/api/workspace/assets/video/start", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, type: file.type, size: file.size }) });
    const s = await start.json() as { key?: string; url?: string; error?: string };
    if (!start.ok || !s.url || !s.key) throw new Error(s.error ?? "Couldn't start the upload.");
    // Poster frame, length and size come from the browser while the file uploads.
    const meta = posterFrame(file);
    const put = await fetch(s.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null);
    if (!put?.ok) throw new Error("Storage refused the upload. Video uploads need the R2 bucket to allow uploads from this site (CORS).");
    mark({ state: "uploading", error: "processing" });
    const m = await meta;
    const form = new FormData();
    form.set("key", s.key); form.set("type", file.type); form.set("fileName", file.name); form.set("size", String(file.size)); form.set("folder", folder ?? "General");
    if (m.duration) form.set("duration", String(m.duration));
    if (m.width) { form.set("width", String(m.width)); form.set("height", String(m.height)); }
    if (m.poster) form.set("poster", m.poster, "poster.jpg");
    const fin = await fetch("/api/workspace/assets/video/finish", { method: "POST", body: form });
    const f = await fin.json() as { asset?: AssetCard; error?: string };
    if (!fin.ok || !f.asset) throw new Error(f.error ?? "Couldn't save the video.");
    return f.asset;
  }, [folder]);

  const upload = useCallback(async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, 50);
    if (!list.length) return setNote("Drop pictures (PNG, JPEG, WebP, GIF) or videos (MP4, MOV, WebM).");
    const batch = list.map((f) => ({ id: crypto.randomUUID(), name: f.name, state: "waiting" as const }));
    setUploads((u) => [...batch, ...u].slice(0, 60));
    const added: AssetCard[] = [];
    for (let i = 0; i < list.length; i++) {
      const mark = (patch: Partial<Upload>) => setUploads((u) => u.map((x) => x.id === batch[i].id ? { ...x, ...patch } : x));
      mark({ state: "uploading" });
      try {
        if (list[i].type.startsWith("video/")) { added.push(await uploadVideo(list[i], mark)); mark({ state: "added", error: undefined }); continue; }
        const file = await fitPicture(list[i], MAX_UPLOAD, 3600).catch(() => list[i]);
        if (file.size > MAX_UPLOAD) throw new Error("Over 4 MB even after shrinking.");
        const form = new FormData();
        form.append("files", file, list[i].name);
        form.set("folder", folder ?? "General");
        const res = await fetch("/api/workspace/assets", { method: "POST", body: form });
        const j = await res.json() as { results?: { duplicate?: boolean; error?: string }[]; assets?: AssetCard[]; error?: string };
        const r = j.results?.[0];
        if (!res.ok || !r || r.error) throw new Error(r?.error ?? j.error ?? "Upload failed.");
        mark({ state: r.duplicate ? "duplicate" : "added" });
        added.push(...(j.assets ?? []));
      } catch (e) { mark({ state: "failed", error: (e as Error).message }); }
    }
    if (added.length && view === "all") setAssets((a) => [...added.filter((n) => !a.some((x) => x.id === n.id)), ...a]);
    // AI captions arrive a few seconds after upload; refresh once to pick them up.
    setTimeout(() => void load(), 8000);
  }, [folder, load, view, uploadVideo]);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current++; setDragging(true); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      void upload(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, [upload]);

  // Paste a screenshot straight in.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
      if (files.length && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) void upload(files);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [upload]);

  // ── Keyboard: / search · arrows move · x select · Delete trash · Esc clear · ⌘A all ──
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !typing) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (typing) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return; }
      if (e.key === "Escape") { setSelected([]); setActive(null); }
      if ((e.key === "a") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSelected(assets.map((a) => a.id)); }
      const i = assets.findIndex((a) => a.id === active);
      if (["ArrowRight", "ArrowDown"].includes(e.key) && assets.length) { e.preventDefault(); setActive(assets[Math.min(assets.length - 1, i + 1)].id); }
      if (["ArrowLeft", "ArrowUp"].includes(e.key) && assets.length) { e.preventDefault(); setActive(assets[Math.max(0, i - 1)].id); }
      if (e.key === "x" && active) setSelected((s) => s.includes(active) ? s.filter((x) => x !== active) : [...s, active]);
      if ((e.key === "Delete" || e.key === "Backspace") && (selected.length || active) && view !== "trash") void bulk("trash", selected.length ? selected : [active!]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function click(e: React.MouseEvent, id: string) {
    if (e.shiftKey && lastClicked.current) {
      const ids = assets.map((a) => a.id);
      const [from, to] = [ids.indexOf(lastClicked.current), ids.indexOf(id)].sort((a, b) => a - b);
      setSelected((s) => [...new Set([...s, ...ids.slice(from, to + 1)])]);
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
    } else setActive(id);
    lastClicked.current = id;
  }

  async function bulk(action: "tag" | "folder" | "consent" | "trash" | "restore", ids = selected, value?: string) {
    if (!ids.length) return;
    const body = action === "tag" ? { action, ids, tags: (value ?? "").split(",").map((t) => t.trim()).filter(Boolean) }
      : action === "folder" ? { action, ids, folder: value } : action === "consent" ? { action, ids, consent: value } : { action, ids };
    if (action === "tag" && !(body as { tags: string[] }).tags.length) return setNote("Type a tag first.");
    const res = await fetch("/api/workspace/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({})) as { count?: number; skipped?: number; error?: string };
    if (!res.ok) return setNote(j.error ?? "That didn't work. Try again.");
    const verb = { tag: "Tagged", folder: "Moved", consent: "Updated", trash: "Moved to trash:", restore: "Restored" }[action];
    setNote(`${verb} ${j.count} ${j.count === 1 ? "picture" : "pictures"}.${j.skipped ? ` ${j.skipped} skipped (locked${action === "trash" ? " or in use" : ""}).` : ""}`);
    if (action === "trash" || action === "restore") { setSelected([]); if (ids.includes(active ?? "")) setActive(null); }
    setBulkTag("");
    void load();
  }

  async function newCollection(withSelected: boolean) {
    const res = await fetch("/api/workspace/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Collection ${collections.length + 1}`, assetIds: withSelected ? selected : [] }) });
    const j = await res.json() as { collection?: Collection };
    if (j.collection) { setCollections((c) => [j.collection!, ...c]); setCollection(j.collection.id); setNote(`Created “${j.collection.name}”. Rename it in the left column.`); }
  }

  async function saveSmart() {
    const query = Object.fromEntries(Object.entries({ q: q.trim() || undefined, folder, tag, consent, color, origin }).filter(([, v]) => v));
    const name = [q.trim() && `“${q.trim()}”`, folder, tag && `#${tag}`, consent && CONSENT_LABEL[consent], color, origin && ORIGIN_LABEL[origin]].filter(Boolean).join(" · ").slice(0, 80) || "Smart collection";
    const res = await fetch("/api/workspace/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, query }) });
    const j = await res.json() as { collection?: Collection; error?: string };
    if (!j.collection) return setNote(j.error ?? "Couldn't save the search.");
    setCollections((c) => [j.collection!, ...c]);
    setNote(`Saved “${name}” as a smart collection. It updates itself as pictures are added.`);
  }

  async function patchCollection(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/workspace/assets/collections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({})) as { collection?: Collection; error?: string };
    if (!res.ok || !j.collection) return setNote(j.error ?? "Couldn't update the collection.");
    setCollections((c) => c.map((x) => x.id === id ? j.collection! : x));
    return j.collection;
  }

  async function runImport() {
    setImporting(true);
    try {
      let left = importLeft ?? 1, total = 0;
      while (left > 0) {
        const j = await fetch("/api/workspace/assets/import", { method: "POST" }).then((r) => r.json()) as { imported: number; failed: number; remaining: number };
        total += j.imported; left = j.remaining; setImportLeft(left);
        setNote(`Imported ${total} existing pictures${left ? ` · ${left} to go…` : "."}`);
        if (!j.imported && !j.failed) break;
      }
      void load();
    } catch { setNote("Import stopped. Run it again to continue."); }
    finally { setImporting(false); }
  }

  function openCard(c: AssetCard) {
    setAssets((all) => all.some((x) => x.id === c.id) ? all : [c, ...all]);
    setActive(c.id);
  }
  const activeAsset = assets.find((a) => a.id === active) ?? null;
  const filtersOn = !!(folder || tag || color || consent || origin || collection || q);
  const shown = assets;

  return (
    <div className="space-y-4">
      <AskLibrary onOpen={(c) => openCard(c)} />
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search the library</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by meaning: “panel speakers on stage”, a name, a tag…"
            className="w-full rounded-[10px] border border-line bg-card-solid py-2.5 pl-9 pr-16 text-sm text-fg" />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-subtle">/</kbd>
        </label>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          <CloudUpload size={16} /> Upload
        </button>
        <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm" className="sr-only" aria-label="Upload pictures or videos"
          onChange={(e) => { void upload(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ""; }} />
        {!!importLeft && (
          <button type="button" disabled={importing} onClick={() => void runImport()} className="inline-flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
            <FolderInput size={16} /> {importing ? "Importing…" : `Import ${importLeft} existing pictures`}
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Library views" className="flex flex-wrap gap-1 border-b border-line">
        {VIEWS.map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => { setView(key); setSelected([]); }}
            className={cn("inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", view === key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-fg")}>
            <Icon size={14} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {dragging && (
        <div className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-brand-500 bg-brand-50 px-4 py-8 text-sm font-semibold text-brand-800" role="status">
          <CloudUpload size={20} aria-hidden /> Drop to add to {folder ?? "General"}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="rounded-[12px] border border-line bg-card p-3">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-semibold text-fg">Uploads · {uploads.filter((u) => u.state === "added").length} added{uploads.some((u) => u.state === "duplicate") ? ` · ${uploads.filter((u) => u.state === "duplicate").length} already in the library` : ""}</span>
            <button type="button" onClick={() => setUploads((u) => u.filter((x) => x.state === "uploading" || x.state === "waiting"))} className="text-[12px] font-semibold text-muted hover:text-fg">Clear</button>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {uploads.slice(0, 12).map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-[12px]">
                <span className={cn("size-2 shrink-0 rounded-full", u.state === "added" ? "bg-emerald-500" : u.state === "duplicate" ? "bg-sky-500" : u.state === "failed" ? "bg-rose-500" : "animate-pulse bg-amber-400")} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-fg">{u.name}</span>
                <span className="shrink-0 text-muted">{u.state === "duplicate" ? "already here" : u.state === "failed" ? u.error : u.state}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note && <p role="status" className="flex items-center gap-2 text-[13px] text-fg">{note}<button type="button" aria-label="Dismiss" onClick={() => setNote(null)} className="text-subtle hover:text-fg"><X size={14} /></button></p>}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        {/* Filters rail */}
        <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
          className="inline-flex items-center gap-1.5 justify-self-start rounded-[8px] border border-line px-3 py-1.5 text-[13px] font-semibold text-fg lg:hidden">
          <Folder size={14} aria-hidden /> {showFilters ? "Hide filters" : `Filters${filtersOn ? " · on" : ""}`}
        </button>
        <aside className={cn("space-y-5 text-[13px] lg:block", showFilters ? "block" : "hidden")}>
          <section>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Folders</h3>
            <ul className="space-y-0.5">
              {[{ name: null as string | null, n: folders.reduce((s, f) => s + f.n, 0) }, ...folders].map((f) => (
                <li key={f.name ?? "all"}>
                  <button type="button" onClick={() => setFolder(f.name)} className={cn("flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left", folder === f.name ? "bg-brand-50 font-semibold text-brand-800" : "text-fg hover:bg-elevated")}>
                    <Folder size={14} className="text-brand-600" aria-hidden /> <span className="flex-1">{f.name ?? "All folders"}</span> <span className="text-subtle">{f.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Collections</h3>
              <button type="button" onClick={() => void newCollection(false)} aria-label="New collection" className="text-brand-700 hover:text-brand-800"><Plus size={14} /></button>
            </div>
            {collections.length === 0 && <p className="text-subtle">Group pictures to share them.</p>}
            <ul className="space-y-1">
              {collections.map((c) => (
                <li key={c.id} className={cn("rounded-[8px] px-2 py-1.5", collection === c.id ? "bg-brand-50" : "hover:bg-elevated")}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCollection(collection === c.id ? null : c.id)} className="min-w-0 flex-1 truncate text-left font-semibold text-fg">{c.smart && <Bookmark size={11} className="mr-1 inline text-brand-600" aria-label="Smart collection" />}{c.name}</button>
                    <span className="text-subtle">{c.smart ? "auto" : c.count}</span>
                  </div>
                  {collection === c.id && (
                    <div className="mt-1.5 space-y-1.5">
                      <input aria-label="Collection name" defaultValue={c.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) void patchCollection(c.id, { name: e.target.value.trim() }); }}
                        className="w-full rounded-[6px] border border-line bg-card-solid px-2 py-1 text-[12px]" />
                      {c.shareToken && c.shareExpiresAt && new Date(c.shareExpiresAt) > new Date() ? (
                        <div className="space-y-1">
                          <button type="button" onClick={() => void navigator.clipboard.writeText(`${location.origin}/share/assets/${c.shareToken}`).then(() => setNote("Share link copied. Anyone with it can view and download until it expires."))}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700"><Share2 size={12} /> Copy view-only link</button>
                          <p className="text-[11px] text-subtle">{c.views ? `Opened ${c.views}× · ` : ""}Expires {new Date(c.shareExpiresAt).toLocaleDateString("en-CA")} · <button type="button" className="underline" onClick={() => void patchCollection(c.id, { shareDays: 0 })}>stop sharing</button></p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1 text-[12px]"><Share2 size={12} className="text-brand-600" aria-hidden /> Share for
                          {([7, 30, 90] as const).map((d) => <button key={d} type="button" onClick={() => void patchCollection(c.id, { shareDays: d })} className="rounded border border-line px-1.5 font-semibold text-brand-700 hover:bg-brand-50">{d}d</button>)}
                        </div>
                      )}
                      <button type="button" onClick={() => void fetch(`/api/workspace/assets/collections/${c.id}`, { method: "DELETE" }).then(() => { setCollections((x) => x.filter((y) => y.id !== c.id)); setCollection(null); })}
                        className="text-[11px] font-semibold text-rose-700">Delete collection</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Colour</h3>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SWATCHES) as Swatch[]).map((s) => (
                <button key={s} type="button" aria-label={`${s} pictures`} aria-pressed={color === s} title={s} onClick={() => setColor(color === s ? null : s)}
                  className={cn("size-6 rounded-full border border-line", color === s && "ring-2 ring-brand-600 ring-offset-2")} style={{ background: SWATCHES[s] }} />
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Consent</h3>
            <div className="flex flex-wrap gap-1">
              {CONSENT.map((c) => (
                <button key={c} type="button" aria-pressed={consent === c} onClick={() => setConsent(consent === c ? null : c)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px]", consent === c ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-fg hover:bg-elevated")}>
                  <span className={cn("size-2 rounded-full", CONSENT_DOT[c])} aria-hidden /> {CONSENT_LABEL[c].replace("Consent ", "")}
                </button>
              ))}
            </div>
          </section>
          {tags.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <button key={t.tag} type="button" aria-pressed={tag === t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)}
                    className={cn("rounded-full border px-2 py-0.5 text-[12px]", tag === t.tag ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-fg hover:bg-elevated")}>
                    {t.tag} <span className="text-subtle">{t.n}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Origin</h3>
            <div className="flex flex-wrap gap-1">
              {ORIGINS.map((o) => (
                <button key={o} type="button" aria-pressed={origin === o} onClick={() => setOrigin(origin === o ? null : o)}
                  className={cn("rounded-full border px-2 py-0.5 text-[12px]", origin === o ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-fg hover:bg-elevated")}>
                  {ORIGIN_LABEL[o].replace("Origin unknown", "Unknown")}
                </button>
              ))}
            </div>
          </section>
          {filtersOn && !collection && <button type="button" onClick={() => void saveSmart()} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700"><Bookmark size={12} /> Save this search as a smart collection</button>}
          {filtersOn && <button type="button" onClick={() => { setFolder(null); setTag(null); setColor(null); setConsent(null); setOrigin(null); setCollection(null); setQ(""); }} className="block text-[12px] font-semibold text-brand-700">Clear all filters</button>}
        </aside>

        {/* Grid */}
        <section aria-label="Pictures" className="min-w-0">
          {/* Bulk actions, in the flow above the grid so they never cover a picture or the details */}
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-brand-200 bg-brand-50/60 px-3 py-2.5" role="region" aria-label="Selected pictures">
              <span className="text-sm font-semibold text-fg">{selected.length} selected</span>
              {view === "trash" ? (
                <button type="button" onClick={() => void bulk("restore")} className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[13px] font-semibold text-fg hover:bg-elevated"><RotateCcw size={14} /> Restore</button>
              ) : (<>
                <form onSubmit={(e) => { e.preventDefault(); void bulk("tag", selected, bulkTag); }} className="flex items-center gap-1">
                  <Tag size={14} className="text-subtle" aria-hidden />
                  <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Add tags" aria-label="Tags to add" className="w-28 rounded-[8px] border border-line bg-card-solid px-2 py-1 text-[13px]" />
                </form>
                <select aria-label="Move to folder" value="" onChange={(e) => e.target.value && void bulk("folder", selected, e.target.value)} className="rounded-[8px] border border-line bg-card-solid px-2 py-1.5 text-[13px]">
                  <option value="">Move to…</option>{ASSET_FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select aria-label="Set consent" value="" onChange={(e) => e.target.value && void bulk("consent", selected, e.target.value)} className="rounded-[8px] border border-line bg-card-solid px-2 py-1.5 text-[13px]">
                  <option value="">Consent…</option>{CONSENT.map((c) => <option key={c} value={c}>{CONSENT_LABEL[c]}</option>)}
                </select>
                <select aria-label="Add to collection" value="" onChange={(e) => { if (e.target.value === "new") void newCollection(true); else if (e.target.value) void patchCollection(e.target.value, { add: selected }).then((c) => c && setNote(`Added to “${c.name}”.`)); }} className="rounded-[8px] border border-line bg-card-solid px-2 py-1.5 text-[13px]">
                  <option value="">Add to collection…</option><option value="new">New collection</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => void bulk("trash")} className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[13px] font-semibold text-rose-700 hover:bg-rose-500/10"><Trash2 size={14} /> Trash</button>
              </>)}
              <button type="button" onClick={() => setSelected([])} className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg"><Check size={14} /> Done</button>
            </div>
          )}
          <p className="mb-2 text-[12px] text-muted">{loading ? "Loading…" : `${shown.length} ${shown.length === 1 ? "picture" : "pictures"}`} · click to open · ⌘/Ctrl-click or Shift-click to select · drop or paste pictures anywhere</p>
          {!loading && shown.length === 0 && (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-[14px] border-2 border-dashed border-line px-6 py-14 text-center text-muted hover:border-brand-400 hover:bg-brand-50/40">
              <CloudUpload size={28} className="text-brand-600" aria-hidden />
              <span className="text-sm font-semibold text-fg">{view === "trash" ? "Trash is empty" : view === "duplicates" ? "No near-duplicates. Nice and tidy." : view === "videos" ? "No videos yet. Drop an MP4, MOV or WebM here." : filtersOn ? "Nothing matches these filters" : "Drop pictures or videos here to start the library"}</span>
              <span className="text-[12px]">Pictures are tagged and captioned automatically, so you can find them by what’s in them.</span>
            </button>
          )}
          {/* Masonry, dealt row by row (left to right), so Shift-click ranges match what you see. */}
          <div ref={gridRef} className="flex items-start gap-3">
            {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="min-w-0 flex-1">
            {shown.filter((_, i) => i % cols === c).map((a) => {
              const isSel = selected.includes(a.id);
              return (
                <figure key={a.id} className={cn("mb-3 overflow-hidden rounded-[12px] border bg-card-solid transition-shadow",
                  a.id === active ? "border-brand-500 ring-2 ring-brand-500/40" : isSel ? "border-brand-400" : "border-line hover:shadow-md")}>
                  <button type="button" onClick={(e) => click(e, a.id)} aria-label={`Open ${a.title}`} className="block w-full"
                    style={{ backgroundColor: a.color ?? undefined, backgroundImage: a.blur ? `url(${a.blur})` : undefined, backgroundSize: "cover" }}>
                    {a.thumbUrl ? (
                      <img src={a.thumbUrl} alt={a.altText ?? a.title} loading="lazy" decoding="async" width={a.width ?? undefined} height={a.height ?? undefined}
                        className="block h-auto w-full" style={{ aspectRatio: a.width && a.height ? `${a.width} / ${a.height}` : undefined }} />
                    ) : <span className="grid aspect-video w-full place-items-center bg-elevated text-subtle"><Film size={28} aria-hidden /></span>}
                  </button>
                  <figcaption className="flex items-center gap-2 px-2.5 py-2">
                    <input type="checkbox" checked={isSel} aria-label={`Select ${a.title}`} onChange={() => setSelected((s) => isSel ? s.filter((x) => x !== a.id) : [...s, a.id])} className="size-3.5 shrink-0 accent-brand-600" />
                    {a.kind === "video" && <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-muted"><Play size={11} aria-label="Video" />{clock(a.durationSec)}</span>}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg" title={a.title}>{a.title}</span>
                    {a.origin.startsWith("ai") && <Wand2 size={12} className={cn("shrink-0", ORIGIN_DOT[a.origin])} aria-label={ORIGIN_LABEL[a.origin as Origin]} />}
                    {a.locked && <Lock size={12} className="shrink-0 text-subtle" aria-label="Locked brand asset" />}
                    {a.people && <Users size={12} className="shrink-0 text-subtle" aria-label="People pictured" />}
                    {a.usageCount > 0 && <span className="shrink-0 rounded-full bg-elevated px-1.5 text-[10px] font-semibold text-muted" title={`Used in ${a.usageCount} place(s)`}>{a.usageCount}</span>}
                    <span className={cn("size-2 shrink-0 rounded-full", CONSENT_DOT[a.consent])} title={CONSENT_LABEL[a.consent as Consent]} aria-label={CONSENT_LABEL[a.consent as Consent]} />
                    {!a.aiTagged && <Sparkles size={12} className="shrink-0 animate-pulse text-brand-500" aria-label="AI tagging in progress" />}
                  </figcaption>
                </figure>
              );
            })}
            </div>
            ))}
          </div>
        </section>

        {/* Detail */}
        <div className="lg:col-span-2 xl:col-span-1">
          {activeAsset ? (
            <AssetDetailPanel key={activeAsset.id} card={activeAsset} collections={collections}
              onClose={() => setActive(null)} onNote={setNote}
              onChanged={(next) => setAssets((all) => next ? all.map((x) => x.id === next.id ? { ...x, ...next } : x) : all.filter((x) => x.id !== activeAsset.id))}
              onCollection={(id, add) => void patchCollection(id, add ? { add: [activeAsset.id] } : { remove: [activeAsset.id] })}
              onReload={() => void load()} onOpen={openCard}
              onAdded={(c) => { setAssets((all) => [c, ...all.filter((x) => x.id !== c.id)]); setActive(c.id); }} />
          ) : (
            <div className="hidden rounded-[12px] border border-dashed border-line p-6 text-center text-[13px] text-muted xl:block">
              Pick a picture to see its details, rights, sizes and where it’s used. Arrow keys move between pictures.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/** Poster frame (JPEG at 1s or 10%), length and size of a video, read in the browser. */
function posterFrame(file: File): Promise<{ poster: Blob | null; duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (poster: Blob | null) => { URL.revokeObjectURL(url); resolve({ poster, duration: Number.isFinite(v.duration) ? v.duration : null, width: v.videoWidth || null, height: v.videoHeight || null }); };
    const timer = setTimeout(() => done(null), 15000);
    v.muted = true; v.preload = "metadata"; v.src = url;
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 10) * 0.1); };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      const k = Math.min(1, 1280 / Math.max(v.videoWidth, 1));
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => { clearTimeout(timer); done(b); }, "image/jpeg", 0.85);
    };
    v.onerror = () => { clearTimeout(timer); done(null); };
  });
}
