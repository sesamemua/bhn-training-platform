"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, History, Lock, LockOpen, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import type { AssetCard } from "@/lib/assets/store";
import { ASSET_FOLDERS, CONSENT, CONSENT_LABEL, RENDITIONS, publishBlock, type RenditionKey } from "@/lib/assets/core";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { PictureDrop } from "@/components/workspace/PictureDrop";
import type { Collection } from "./AssetLibrary";

interface Detail extends AssetCard {
  usages: { id: string; label: string; href: string | null; targetType: string; at: string }[];
  versions: { version: number; url: string; thumbUrl: string | null; sizeBytes: number; width: number | null; height: number | null; at: string }[];
}

const kb = (n: number) => n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
const field = "mt-1 w-full rounded-[8px] border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg disabled:opacity-60";
const label = "block text-[12px] font-semibold text-muted";

/** The right-hand panel: preview, details, rights, sizes, usage and versions for one asset. */
export function AssetDetailPanel({ card, collections, onClose, onNote, onChanged, onCollection, onReload }: {
  card: AssetCard;
  collections: Collection[];
  onClose: () => void;
  onNote: (m: string) => void;
  onChanged: (next: AssetCard | null) => void;
  onCollection: (id: string, add: boolean) => void;
  onReload: () => void;
}) {
  const [a, setA] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [tagText, setTagText] = useState(card.tags.join(", "));

  useEffect(() => {
    const c = new AbortController();
    void fetch(`/api/workspace/assets/${card.id}`, { signal: c.signal }).then((r) => r.json()).then((j: { asset?: Detail }) => { if (j.asset) setA(j.asset); }).catch(() => {});
    return () => c.abort();
  }, [card.id]);

  const view = a ?? { ...card, usages: [], versions: [] };
  const locked = view.locked;
  const trashed = !!view.deletedAt;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/assets/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await res.json().catch(() => ({})) as { asset?: Detail; error?: string };
      if (!res.ok || !j.asset) return onNote(j.error ?? "Couldn't save.");
      setA(j.asset);
      onChanged("trashed" in patch ? null : j.asset);
      if ("trashed" in patch) onNote(patch.trashed ? "Moved to trash. It's deleted for good after 30 days." : "Restored.");
    } finally { setBusy(false); }
  }
  const saveText = (key: keyof AssetCard, value: string) => {
    const v = value.trim();
    if ((view[key] ?? "") !== v) void save({ [key]: key === "title" ? v || view.title : v || null });
  };

  async function regenerate() {
    setBusy(true);
    try {
      const j = await fetch(`/api/workspace/assets/${card.id}/enrich`, { method: "POST" }).then((r) => r.json()) as { caption?: string | null; altText?: string | null; tags?: string[] };
      if (!j.caption) onNote("The AI couldn't describe this picture. Add a caption by hand.");
      const next = { ...view, caption: j.caption ?? null, altText: j.altText ?? null, tags: j.tags ?? view.tags, aiTagged: true };
      setA(next); setTagText(next.tags.join(", ")); onChanged(next);
    } finally { setBusy(false); }
  }

  async function replace(file: File) {
    setBusy(true);
    try {
      const form = new FormData(); form.set("file", file);
      const res = await fetch(`/api/workspace/assets/${card.id}/file`, { method: "POST", body: form });
      const j = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) return onNote(j.error ?? "Couldn't replace the file.");
      onNote("New version saved. The previous file is kept under Versions."); onReload();
    } finally { setBusy(false); }
  }

  const blocked = publishBlock(view);
  const inCollections = collections.filter((c) => c.assetIds.includes(card.id));

  return (
    <aside aria-label={`Details for ${view.title}`} className="sticky top-4 max-h-[calc(100vh-2rem)] space-y-4 overflow-y-auto rounded-[14px] border border-line bg-card p-4">
      <div className="flex items-start gap-2">
        <input aria-label="Title" defaultValue={view.title} key={`t-${view.title}`} disabled={locked || busy} onBlur={(e) => saveText("title", e.target.value)}
          className="min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1 py-0.5 text-[16px] font-bold text-fg hover:border-line focus:border-line" />
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded-full p-1 text-subtle hover:bg-elevated hover:text-fg"><X size={16} /></button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-line" style={{ backgroundColor: view.color ?? undefined }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.thumbUrl} alt={view.altText ?? view.title} className="block max-h-72 w-full object-contain" />
      </div>
      <p className="text-[12px] text-muted">
        {view.width && view.height ? `${view.width}×${view.height} · ` : ""}{kb(view.sizeBytes)} · {view.mimeType.replace("image/", "").toUpperCase()} · v{view.version}
        {view.uploadedByName ? ` · added by ${view.uploadedByName}` : ""} · {new Date(view.createdAt).toLocaleDateString("en-CA")}
      </p>

      <div className="flex flex-wrap gap-2">
        <a href={view.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated"><ExternalLink size={13} /> Original</a>
        <button type="button" onClick={() => void navigator.clipboard.writeText(view.url).then(() => onNote("Link copied."))} className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated"><Copy size={13} /> Copy link</button>
        <button type="button" disabled={busy} onClick={() => void save({ locked: !locked })} className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated">
          {locked ? <><LockOpen size={13} /> Unlock</> : <><Lock size={13} /> Lock as brand asset</>}
        </button>
      </div>

      {blocked && !trashed && <p className="rounded-[8px] bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">Can’t be published yet: {blocked}</p>}

      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Description
          <button type="button" disabled={busy || locked} onClick={() => void regenerate()} className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-[12px] font-semibold text-brand-700 disabled:opacity-50"><Sparkles size={12} /> {busy ? "Working…" : "Regenerate with AI"}</button>
        </h4>
        <label className={label}>Caption<textarea key={`c-${view.caption}`} rows={2} defaultValue={view.caption ?? ""} disabled={locked || busy} onBlur={(e) => saveText("caption", e.target.value)} className={field} /></label>
        <label className={label}>Alt text <span className="font-normal">(read aloud by screen readers)</span><input key={`a-${view.altText}`} defaultValue={view.altText ?? ""} maxLength={300} disabled={locked || busy} onBlur={(e) => saveText("altText", e.target.value)} className={field} /></label>
        <label className={label}>Tags <span className="font-normal">(comma separated)</span><input value={tagText} disabled={locked || busy} onChange={(e) => setTagText(e.target.value)}
          onBlur={() => { const next = tagText.split(",").map((t) => t.trim()).filter(Boolean); if (next.join(",") !== view.tags.join(",")) void save({ tags: next }); }} className={field} /></label>
        <label className={label}>Folder<select value={view.folder} disabled={locked || busy} onChange={(e) => void save({ folder: e.target.value })} className={field}>{ASSET_FOLDERS.map((f) => <option key={f}>{f}</option>)}</select></label>
      </section>

      <section className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Rights & consent</h4>
        <label className={label}>People pictured<input key={`p-${view.people}`} defaultValue={view.people ?? ""} placeholder="Names, or leave empty" disabled={locked || busy} onBlur={(e) => saveText("people", e.target.value)} className={field} /></label>
        <label className={label}>Consent<select value={view.consent} disabled={locked || busy} onChange={(e) => void save({ consent: e.target.value })} className={field}>{CONSENT.map((c) => <option key={c} value={c}>{CONSENT_LABEL[c]}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>Credit<input key={`cr-${view.credit}`} defaultValue={view.credit ?? ""} placeholder="Photographer" disabled={locked || busy} onBlur={(e) => saveText("credit", e.target.value)} className={field} /></label>
          <label className={label}>Licence<input key={`l-${view.license}`} defaultValue={view.license ?? ""} placeholder="Owned, CC BY, stock…" disabled={locked || busy} onBlur={(e) => saveText("license", e.target.value)} className={field} /></label>
        </div>
        <label className={label}>Source<input key={`s-${view.source}`} defaultValue={view.source ?? ""} placeholder="Where it came from" disabled={locked || busy} onBlur={(e) => saveText("source", e.target.value)} className={field} /></label>
        <label className={label}>Licence expires<input type="date" key={`e-${view.expiresAt}`} defaultValue={view.expiresAt?.slice(0, 10) ?? ""} disabled={locked || busy}
          onChange={(e) => void save({ expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : null })} className={field} /></label>
      </section>

      <section>
        <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Ready-made sizes</h4>
        <ul className="grid gap-1">
          {(Object.keys(RENDITIONS) as RenditionKey[]).map((k) => (
            <li key={k}><a href={`/api/workspace/assets/${card.id}/rendition?size=${k}&download=1`} className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] text-fg hover:bg-elevated"><Download size={13} className="text-brand-600" aria-hidden /> {RENDITIONS[k].label}</a></li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-subtle">Cropped around the subject automatically.</p>
      </section>

      <section>
        <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Used in {view.usages.length ? `(${view.usages.length})` : ""}</h4>
        {view.usages.length === 0 ? <p className="text-[12px] text-muted">Not used anywhere yet.</p> : (
          <ul className="space-y-1 text-[13px]">
            {view.usages.map((u) => <li key={u.id}>{u.href ? <a href={u.href} className="font-semibold text-brand-700 hover:underline">{u.label}</a> : <span className="text-fg">{u.label}</span>}</li>)}
          </ul>
        )}
      </section>

      {collections.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Collections</h4>
          <div className="flex flex-wrap gap-1">
            {collections.map((c) => {
              const on = inCollections.includes(c);
              return <button key={c.id} type="button" aria-pressed={on} onClick={() => onCollection(c.id, !on)}
                className={on ? "rounded-full border border-brand-500 bg-brand-50 px-2 py-0.5 text-[12px] text-brand-800" : "rounded-full border border-line px-2 py-0.5 text-[12px] text-fg hover:bg-elevated"}>{c.name}</button>;
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle"><History size={12} aria-hidden /> Versions</h4>
        {!locked && !trashed && <PictureDrop label={`Replace ${view.title}`} busy={busy} hasPicture onFile={(f) => void replace(f)} onError={onNote} />}
        {view.versions.length > 0 && (
          <ul className="space-y-1 text-[12px]">
            {view.versions.map((v) => <li key={v.version}><a href={v.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Version {v.version}</a> <span className="text-muted">· {kb(v.sizeBytes)} · replaced {new Date(v.at).toLocaleDateString("en-CA")}</span></li>)}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {trashed ? (<>
          <button type="button" disabled={busy} onClick={() => void save({ trashed: false })} className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated"><RotateCcw size={13} /> Restore</button>
          <ConfirmPopover message="Delete this picture for good?" detail="The file and its versions are removed now. This can’t be undone." confirmLabel="Delete for good" tone="danger"
            onConfirm={() => void fetch(`/api/workspace/assets/${card.id}`, { method: "DELETE" }).then(async (r) => { const j = await r.json().catch(() => ({})) as { error?: string }; if (!r.ok) onNote(j.error ?? "Couldn't delete."); else { onNote("Deleted for good."); onChanged(null); onClose(); } })}>
            {(open) => <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-500/10"><Trash2 size={13} /> Delete for good</button>}
          </ConfirmPopover>
        </>) : (
          <button type="button" disabled={busy || locked || view.usages.length > 0} title={view.usages.length ? "In use — remove it from those places first" : locked ? "Unlock it first" : undefined}
            onClick={() => void save({ trashed: true })} className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 size={13} /> Move to trash</button>
        )}
      </div>
    </aside>
  );
}
