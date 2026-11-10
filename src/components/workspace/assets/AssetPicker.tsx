"use client";

import { useEffect, useState } from "react";
import { Images, Search } from "lucide-react";
import type { AssetCard } from "@/lib/assets/store";
import { publishBlock } from "@/lib/assets/core";

/** "Choose from library": search the asset library inline and pick one picture. */
export function AssetPicker({ label, onPick }: { label: string; onPick: (asset: AssetCard) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<AssetCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      void fetch(`/api/workspace/assets?view=all${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`, { signal: c.signal })
        .then(async (r) => {
          if (r.status === 403) throw new Error("The asset library is open to the team’s superadmin accounts.");
          const j = await r.json() as { assets?: AssetCard[]; error?: string };
          if (!r.ok) throw new Error(j.error ?? "Couldn't load the library.");
          setAssets((j.assets ?? []).slice(0, 24)); setError(null);
        }).catch((e) => { if (!c.signal.aborted) setError((e as Error).message); });
    }, q ? 280 : 0);
    return () => { clearTimeout(t); c.abort(); };
  }, [open, q]);

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline">
      <Images size={14} aria-hidden /> Choose from library
    </button>
  );
  return (
    <div className="space-y-2 rounded-[10px] border border-line bg-card p-3">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search the library for {label}</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pictures" className="w-full rounded-[8px] border border-line bg-card-solid py-1.5 pl-8 pr-2 text-[13px]" />
        </label>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-muted hover:text-fg">Close</button>
      </div>
      {error && <p role="alert" className="text-[12px] text-rose-700">{error}</p>}
      {assets && assets.length === 0 && <p className="text-[12px] text-muted">No pictures found.</p>}
      <div className="grid grid-cols-4 gap-1.5">
        {assets?.map((a) => {
          const blocked = publishBlock(a);
          return (
            <button key={a.id} type="button" onClick={() => { onPick(a); setOpen(false); }} title={blocked ? `${a.title}: ${blocked}` : a.title}
              className="group relative overflow-hidden rounded-[6px] border border-line hover:border-brand-500" style={{ backgroundColor: a.color ?? undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.thumbUrl} alt={a.altText ?? a.title} loading="lazy" className="block aspect-square w-full object-cover" />
              {blocked && <span className="block bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">Needs consent</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
