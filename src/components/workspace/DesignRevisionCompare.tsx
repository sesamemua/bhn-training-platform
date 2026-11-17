"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, X } from "lucide-react";
import type { DesignVersion } from "@/lib/design-review/versions";

export function DesignRevisionCompare({ id, versions }: { id: string; versions: DesignVersion[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissKey = `design-review-comparison:${id}:${versions.at(-1)?.round}`;
  const [selection, setSelection] = useState(versions.slice(-2).map(({ round }) => round));
  const [shown, setShown] = useState(selection);
  const compare = versions.filter(({ round }) => shown.includes(round));
  useEffect(() => {
    if (versions.length < 2) return;
    try { if (!sessionStorage.getItem(dismissKey)) dialog.current?.showModal(); }
    catch { dialog.current?.showModal(); }
  }, [dismissKey, versions.length]);
  const maxPages = Math.max(0, ...compare.map(({ pages }) => pages.length));
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold"><Columns2 size={15} />Before / after comparison</button>
    <dialog ref={dialog} aria-label="Artwork comparison" onClose={() => {
      try { sessionStorage.setItem(dismissKey, "1"); } catch { /* optional storage */ }
    }} className="fixed inset-0 m-auto h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-screen-2xl rounded-lg bg-card p-0 text-fg backdrop:bg-black/60">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <h2 className="text-base font-bold">Before / after</h2>
          <button type="button" aria-label="Close comparison" onClick={() => dialog.current?.close()} className="rounded-md border border-line p-2"><X size={18} /></button>
          <form className="flex w-full flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setShown(selection); }}>
            <fieldset className="flex min-w-0 flex-wrap gap-3"><legend className="text-sm font-semibold">Select 2–4 saved rounds</legend>
              {versions.map(({ round }) => <label key={round} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={selection.includes(round)} disabled={selection.length >= 4 && !selection.includes(round)}
                  onChange={(event) => setSelection(event.target.checked ? [...selection, round] : selection.filter((r) => r !== round))} /> Round {round}
              </label>)}
            </fieldset>
            <button type="submit" disabled={selection.length < 2} className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Compare selected rounds</button>
          </form>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3" tabIndex={0} role="region" aria-label="Compared designs. One shared scroll area.">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${compare.length}, minmax(250px, 1fr))` }}>
            {compare.map(({ round }, index) => <h3 key={round} className="sticky top-0 z-10 bg-card p-2 text-sm font-bold">{index === 0 ? "Before · " : ""}Round {round}</h3>)}
            {Array.from({ length: maxPages }, (_, index) => compare.map(({ round, pages }, column) => {
              const page = pages[index], before = compare[0].pages[index];
              const changed = column > 0 && page?.key !== before?.key;
              return <div key={`${round}:${index}`} className="min-w-0 self-start rounded-md bg-elevated p-2">
                <p className="mb-2 text-xs font-semibold">Page {index + 1}{changed ? page ? before ? " · Changed" : " · Added" : " · Removed" : ""}</p>
                {page ? <img src={page.url} alt={`Round ${round}, page ${index + 1}`} loading="lazy"
                  className={`block h-auto w-full bg-white ${changed ? "outline-2 outline-teal-700" : ""}`} width={page.w} height={page.h} /> : <p className="text-sm text-muted">No artwork on this page.</p>}
              </div>;
            }))}
          </div>
        </div>
      </div>
    </dialog>
  </>;
}
