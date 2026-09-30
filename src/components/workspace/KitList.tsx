"use client";

/**
 * The packing list for a shoot day, as a board: one column per person
 * bringing things, and one for what nobody has taken yet. Inside each,
 * the things are grouped as cards — hair & make-up, paper & printing…
 * Drag a whole group card onto a person to hand them all of it, or a
 * single item to hand them just that; drag a person's name onto another
 * to reorder the columns. Tick an item as it goes in the bag,
 * add what is missing, take off what is not needed — suggestions
 * included. Saves on its own a moment after each change.
 */
import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, Loader2, Plus, Printer, RotateCcw, UserPlus, X } from "lucide-react";
import { KIT_GROUPS, KIT_VERSION, type KitItem, type KitState } from "@/lib/video/kit";
import { saveKit } from "@/lib/video/printout-actions";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

const ITEM = "application/x-kit-item";
const GROUP = "application/x-kit-group";
const OWNER = "application/x-kit-owner";
const NOBODY = "";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function KitList({ projectId, initial }: { projectId: string; initial: KitState }) {
  const [items, setItems] = useState(initial.items);
  const [owners, setOwners] = useState(initial.owners);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [over, setOver] = useState<string | null>(null);
  const [newOwner, setNewOwner] = useState("");
  const [blocked, setBlocked] = useState(false);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      saveKit(projectId, { items, owners, v: KIT_VERSION }).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 600);
    return () => clearTimeout(t);
  }, [items, owners, projectId]);

  const set = (id: string, patch: Partial<KitItem>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (i: KitItem) => (i.custom ? setItems((all) => all.filter((x) => x.id !== i.id)) : set(i.id, { removed: true }));
  const live = items.filter((i) => !i.removed && (i.owner === NOBODY || owners.includes(i.owner)));
  const orphaned = items.filter((i) => !i.removed && i.owner !== NOBODY && !owners.includes(i.owner));
  const packed = items.filter((i) => !i.removed && i.checked).length;
  const total = items.filter((i) => !i.removed).length;
  const takenOff = items.filter((i) => i.removed).length;
  const columns = [NOBODY, ...owners];

  function dropOn(e: React.DragEvent, owner: string) {
    e.preventDefault();
    setOver(null);
    const itemId = e.dataTransfer.getData(ITEM);
    if (itemId) { set(itemId, { owner }); return; }
    const group = e.dataTransfer.getData(GROUP);
    if (group) {
      // A whole group card: everything of that kind the column it came from holds.
      const { name, from } = JSON.parse(group) as { name: string; from: string };
      setItems((all) => all.map((i) => (i.group === name && i.owner === from && !i.removed ? { ...i, owner } : i)));
      return;
    }
    const moving = e.dataTransfer.getData(OWNER);
    if (moving && owner && moving !== owner) {
      setOwners((all) => { const rest = all.filter((o) => o !== moving); const at = rest.indexOf(owner); rest.splice(at, 0, moving); return rest; });
    }
  }
  function addOwner() {
    const name = newOwner.trim();
    if (!name || owners.some((o) => o.toLowerCase() === name.toLowerCase())) return;
    setOwners((all) => [...all, name]);
    setNewOwner("");
  }
  function removeOwner(name: string) {
    setOwners((all) => all.filter((o) => o !== name));
    setItems((all) => all.map((i) => (i.owner === name ? { ...i, owner: NOBODY } : i)));
  }

  function print() {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    const body = columns.map((o) => {
      const list = live.filter((i) => i.owner === o);
      if (!list.length) return "";
      return `<h2>${o ? esc(o) : "Not assigned yet"}</h2><ul>${list.map((i) => `<li><span class="box">${i.checked ? "✓" : ""}</span>${esc(i.label)} <em>${esc(i.group)}</em></li>`).join("")}</ul>`;
    }).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>What to bring</title><style>
@page { size: letter portrait; margin: .6in }
body { font: 11pt/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; columns: 2; column-gap: .4in }
h1 { column-span: all; font-size: 18pt; margin: 0 0 .15in } h2 { font-size: 11.5pt; margin: .18in 0 .05in; break-after: avoid; color: #1f4b5b }
ul { list-style: none; padding: 0; margin: 0 } li { display: flex; gap: .1in; padding: .03in 0; break-inside: avoid } em { color: #888; font-size: 8.5pt; font-style: normal; margin-left: auto }
.box { display: inline-grid; place-items: center; width: .16in; height: .16in; border: 1.3px solid #111; font-size: 9pt; flex-shrink: 0; margin-top: .02in }
</style></head><body><h1>What to bring — ${packed} of ${total} packed</h1>${body}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 200); });</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fg">What to bring</p>
          <p className="text-[12.5px] text-muted">
            <strong className="text-fg">{packed}</strong> of {total} packed · drag a group, or a single item, onto a person to hand it to them
            {takenOff > 0 && <> · {takenOff} taken off</>}
          </p>
          <div className="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${total ? (packed / total) * 100 : 0}%` }} />
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

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((o) => {
          const list = [...live.filter((i) => i.owner === o), ...(o === NOBODY ? orphaned : [])];
          const mine = list.filter((i) => i.checked).length;
          return (
            <section
              key={o || "nobody"}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(ITEM) || e.dataTransfer.types.includes(GROUP) || (o && e.dataTransfer.types.includes(OWNER))) { e.preventDefault(); setOver(o || "nobody"); } }}
              onDragLeave={() => setOver((x) => (x === (o || "nobody") ? null : x))}
              onDrop={(e) => dropOn(e, o)}
              className={`flex w-72 shrink-0 flex-col rounded-xl border p-2.5 transition-colors ${
                over === (o || "nobody") ? "border-brand-400 bg-brand-500/10" : o ? "border-line bg-card" : "border-dashed border-line bg-elevated/30"
              }`}
            >
              <div
                draggable={!!o}
                onDragStart={(e) => { if (!o) return; e.dataTransfer.setData(OWNER, o); e.dataTransfer.effectAllowed = "move"; }}
                className={`flex items-center gap-1.5 ${o ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                {o && <GripVertical size={13} className="text-subtle" aria-hidden />}
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-fg">{o || "Not assigned yet"}</p>
                <span className="text-[11px] tabular-nums text-subtle">{mine}/{list.length}</span>
                {o && (
                  <ConfirmPopover message={`Take ${o} off the list?`} detail="Their items go back to Not assigned yet." confirmLabel="Remove" tone="danger" onConfirm={() => removeOwner(o)}>
                    {(open) => <button type="button" onClick={open} aria-label={`Remove ${o}`} className="rounded p-0.5 text-subtle hover:text-rose-500"><X size={13} /></button>}
                  </ConfirmPopover>
                )}
              </div>
              <div className="mt-2 flex-1 space-y-2">
                {[...new Set([...KIT_GROUPS, ...list.map((i) => i.group)])].map((g) => {
                  const inGroup = list.filter((i) => i.group === g);
                  if (!inGroup.length) return null;
                  return (
                    <div key={g} className="rounded-lg border border-line bg-card-solid">
                      <div
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData(GROUP, JSON.stringify({ name: g, from: o })); e.dataTransfer.effectAllowed = "move"; }}
                        title="Drag the whole group to someone"
                        className="flex cursor-grab items-center gap-1.5 border-b border-line px-2 py-1.5 active:cursor-grabbing"
                      >
                        <GripVertical size={12} className="text-subtle" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-fg">{g}</span>
                        <span className="text-[10.5px] tabular-nums text-subtle">{inGroup.filter((i) => i.checked).length}/{inGroup.length}</span>
                      </div>
                      <ul className="space-y-0.5 p-1">
                        {inGroup.map((i) => (
                          <li
                            key={i.id}
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(ITEM, i.id); e.dataTransfer.effectAllowed = "move"; }}
                            className="group flex cursor-grab items-start gap-2 rounded-md px-1.5 py-1 hover:bg-elevated/60 active:cursor-grabbing"
                          >
                            <input
                              id={`kit-${i.id}`}
                              type="checkbox"
                              checked={i.checked}
                              onChange={(e) => set(i.id, { checked: e.target.checked })}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                            />
                            <label htmlFor={`kit-${i.id}`} className="min-w-0 flex-1 cursor-pointer leading-snug">
                              <span className={`text-[12.5px] ${i.checked ? "text-subtle line-through" : "text-fg"}`}>{i.label}</span>
                              {i.suggested && <span className="ml-1.5 rounded bg-sky-500/12 px-1 text-[9.5px] font-semibold uppercase tracking-wide text-sky-700">suggested</span>}
                            </label>
                            <button type="button" onClick={() => remove(i)} aria-label={`Take “${i.label}” off the list`} className="shrink-0 rounded p-0.5 text-subtle opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100">
                              <X size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {list.length === 0 && <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[11.5px] text-subtle">Drag a group or an item here</p>}
              </div>
              <AddItem onAdd={(label, group) => setItems((all) => [...all, { id: `c-${Date.now().toString(36)}`, group, label, checked: false, custom: true, removed: false, suggested: false, owner: o }])} />
            </section>
          );
        })}
        <form
          onSubmit={(e) => { e.preventDefault(); addOwner(); }}
          className="flex w-56 shrink-0 flex-col gap-1.5 self-start rounded-xl border border-dashed border-line p-2.5"
        >
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted"><UserPlus size={13} /> Add a person</p>
          <input id="kit-new-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Name" maxLength={60} className="rounded-md border border-line bg-card-solid px-2 py-1 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none" />
          <button type="submit" disabled={!newOwner.trim()} className="rounded-md bg-brand-600 px-2 py-1 text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Add</button>
        </form>
      </div>
    </div>
  );
}

function AddItem({ onAdd }: { onAdd: (label: string, group: string) => void }) {
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<string>(KIT_GROUPS[0]);
  return (
    <form
      className="mt-2 flex flex-wrap gap-1"
      onSubmit={(e) => { e.preventDefault(); if (!label.trim()) return; onAdd(label.trim(), group); setLabel(""); }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add something…" maxLength={120} aria-label="Item" className="min-w-0 flex-1 rounded-md border border-line bg-card-solid px-2 py-1 text-[12px] text-fg focus:border-brand-400 focus:outline-none" />
      <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Kind" className="rounded-md border border-line bg-card-solid px-1 py-1 text-[11px] text-muted">
        {KIT_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <button type="submit" aria-label="Add" disabled={!label.trim()} className="rounded-md border border-line px-2 text-muted hover:text-fg disabled:opacity-40"><Plus size={13} /></button>
    </form>
  );
}
