"use client";

/**
 * The packing list for a shoot day. Tick an item as it goes in the bag;
 * add what is missing under any heading; take off what is not needed.
 * Suggestions (not on the list the team asked for) are marked. Saves on
 * its own a moment after each change.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Printer, RotateCcw, X } from "lucide-react";
import { KIT_GROUPS, type KitItem } from "@/lib/video/kit";
import { saveKit } from "@/lib/video/printout-actions";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function KitList({ projectId, initial }: { projectId: string; initial: KitItem[] }) {
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState(false);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      saveKit(projectId, items).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 600);
    return () => clearTimeout(t);
  }, [items, projectId]);

  const set = (id: string, patch: Partial<KitItem>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (i: KitItem) => (i.custom ? setItems((all) => all.filter((x) => x.id !== i.id)) : set(i.id, { removed: true }));
  const add = (group: string) => {
    const label = (adding[group] ?? "").trim();
    if (!label) return;
    setItems((all) => [...all, { id: `c-${Date.now().toString(36)}`, group, label, checked: false, custom: true, removed: false, suggested: false }]);
    setAdding((a) => ({ ...a, [group]: "" }));
  };

  const live = items.filter((i) => !i.removed);
  const packed = live.filter((i) => i.checked).length;
  const takenOff = items.filter((i) => i.removed).length;
  const groups = [...KIT_GROUPS, ...new Set(items.map((i) => i.group).filter((g) => !(KIT_GROUPS as readonly string[]).includes(g)))];

  function print() {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    const body = groups.map((g) => {
      const list = live.filter((i) => i.group === g);
      if (!list.length) return "";
      return `<h2>${esc(g)}</h2><ul>${list.map((i) => `<li><span class="box">${i.checked ? "✓" : ""}</span>${esc(i.label)}</li>`).join("")}</ul>`;
    }).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>What to bring</title><style>
@page { size: letter portrait; margin: .6in }
body { font: 11pt/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; columns: 2; column-gap: .4in }
h1 { column-span: all; font-size: 18pt; margin: 0 0 .15in } h2 { font-size: 11pt; margin: .18in 0 .05in; break-after: avoid; color: #1f4b5b }
ul { list-style: none; padding: 0; margin: 0 } li { display: flex; gap: .1in; padding: .03in 0; break-inside: avoid }
.box { display: inline-grid; place-items: center; width: .16in; height: .16in; border: 1.3px solid #111; font-size: 9pt; flex-shrink: 0; margin-top: .02in }
</style></head><body><h1>What to bring — ${packed} of ${live.length} packed</h1>${body}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 200); });</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fg">What to bring</p>
          <p className="text-[12.5px] text-muted">
            <strong className="text-fg">{packed}</strong> of {live.length} packed
            {takenOff > 0 && <> · {takenOff} taken off</>}
          </p>
          <div className="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${live.length ? (packed / live.length) * 100 : 0}%` }} />
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle" role="status">
          {status === "saving" ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
            : status === "error" ? <span className="text-rose-600">Not saved — try again</span>
            : <><Check size={11} className="text-emerald-500" /> Saved</>}
        </span>
        <button type="button" onClick={print} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated">
          <Printer size={13} /> Print the list
        </button>
        {takenOff > 0 && (
          <button type="button" onClick={() => setItems((all) => all.map((i) => ({ ...i, removed: false })))} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-fg">
            <RotateCcw size={13} /> Put back what was taken off
          </button>
        )}
        {blocked && <p role="alert" className="basis-full text-[12px] font-semibold text-amber-600">Your browser blocked the print window. Allow pop-ups for this site, then try again.</p>}
      </div>

      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {groups.map((g) => {
          const list = live.filter((i) => i.group === g);
          return (
            <section key={g} className="mb-4 break-inside-avoid rounded-xl border border-line bg-card p-3">
              <p className="flex items-baseline justify-between text-[13px] font-bold text-fg">
                {g}
                <span className="text-[11px] font-normal text-subtle">{list.filter((i) => i.checked).length}/{list.length}</span>
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {list.map((i) => (
                  <li key={i.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-elevated/50">
                    <input
                      id={`kit-${i.id}`}
                      type="checkbox"
                      checked={i.checked}
                      onChange={(e) => set(i.id, { checked: e.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <label htmlFor={`kit-${i.id}`} className={`min-w-0 flex-1 cursor-pointer text-[12.5px] leading-snug ${i.checked ? "text-subtle line-through" : "text-fg"}`}>
                      {i.label}
                      {i.suggested && <span className="ml-1.5 rounded bg-sky-500/12 px-1 text-[9.5px] font-semibold uppercase tracking-wide text-sky-700 no-underline">suggested</span>}
                    </label>
                    <button type="button" onClick={() => remove(i)} aria-label={`Take “${i.label}” off the list`} className="shrink-0 rounded p-0.5 text-subtle opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100">
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); add(g); }}>
                <input
                  id={`kit-add-${g}`}
                  value={adding[g] ?? ""}
                  onChange={(e) => setAdding((a) => ({ ...a, [g]: e.target.value }))}
                  placeholder="Add something…"
                  maxLength={120}
                  className="min-w-0 flex-1 rounded-md border border-line bg-card-solid px-2 py-1 text-[12px] text-fg focus:border-brand-400 focus:outline-none"
                />
                <button type="submit" aria-label={`Add to ${g}`} disabled={!(adding[g] ?? "").trim()} className="rounded-md border border-line px-2 text-muted hover:text-fg disabled:opacity-40">
                  <Plus size={13} />
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
