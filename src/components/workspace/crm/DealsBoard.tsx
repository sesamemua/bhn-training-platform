"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { cn } from "@/lib/utils";
import { DEAL_STAGES, cad, pipelineTotals } from "@/lib/outreach/crm";
import { crmPost, fmtDay, inputCls, primaryCls } from "./crm-api";

export interface DealCard {
  id: string; name: string; org: string; stage: string; amount: number; closeDate: string | null;
  ownerName: string; personId: string | null; personName: string | null;
}

export function DealsBoard({ initial, people }: { initial: DealCard[]; people: { id: string; label: string }[] }) {
  const [deals, setDeals] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", org: "", amount: "", closeDate: "", personId: "" });

  async function save(id: string, patch: Partial<DealCard>) {
    const before = deals;
    setDeals((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { ok, data } = await crmPost("deal.save", { id, ...patch });
    if (!ok) { setDeals(before); setError(data.error ?? "That didn't save."); }
  }

  async function create() {
    if (!form.name.trim()) return;
    const { ok, data } = await crmPost<{ deal: DealCard & { closeDate: string | null } }>("deal.save", {
      name: form.name, org: form.org, amount: Number(form.amount) || 0,
      closeDate: form.closeDate ? `${form.closeDate}T12:00:00` : null, personId: form.personId || null,
    });
    if (!ok) { setError(data.error ?? "Couldn't add the deal."); return; }
    const p = people.find((x) => x.id === form.personId);
    setDeals((d) => [{ ...data.deal, personName: p?.label ?? null }, ...d]);
    setForm({ name: "", org: "", amount: "", closeDate: "", personId: "" });
  }

  async function remove(id: string) {
    const before = deals;
    setDeals((d) => d.filter((x) => x.id !== id));
    const { ok } = await crmPost("deal.delete", { id });
    if (!ok) { setDeals(before); setError("Couldn't delete that deal."); }
  }

  const totals = pipelineTotals(deals);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card-solid p-3">
        <input id="deal-name" aria-label="Deal name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Deal, e.g. MaRS · Symposium gold sponsor" className={cn(inputCls, "min-w-[14rem] flex-1")} />
        <input id="deal-org" aria-label="Organisation" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} placeholder="Organisation" className={cn(inputCls, "w-40")} />
        <input id="deal-amount" aria-label="Amount in CAD" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="Amount $" className={cn(inputCls, "w-28")} />
        <input id="deal-close" aria-label="Expected close date" type="date" value={form.closeDate} onChange={(e) => setForm({ ...form, closeDate: e.target.value })} className={inputCls} />
        <select id="deal-person" aria-label="Contact" value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} className={cn(inputCls, "w-48")}>
          <option value="">No contact</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" onClick={create} disabled={!form.name.trim()} className={primaryCls}><Plus size={12} /> Add deal</button>
      </div>

      <p className="text-[12px] text-muted">
        Open <strong className="text-fg">{cad(totals.open)}</strong> · weighted <strong className="text-fg">{cad(totals.weighted)}</strong> · won <strong className="text-fg">{cad(totals.won)}</strong>. Drag a card to move it to another stage.
      </p>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1080px] grid-cols-6 gap-3">
          {DEAL_STAGES.map((s) => {
            const col = deals.filter((d) => d.stage === s.key);
            return (
              <section
                key={s.key}
                aria-label={s.label}
                onDragOver={(e) => { e.preventDefault(); setOverStage(s.key); }}
                onDragLeave={() => setOverStage(null)}
                onDrop={(e) => { e.preventDefault(); setOverStage(null); if (dragId) save(dragId, { stage: s.key }); setDragId(null); }}
                className={cn("flex min-h-[16rem] flex-col rounded-xl bg-elevated/50 p-2 transition-colors", overStage === s.key && "bg-brand-50 ring-2 ring-brand-300")}
              >
                <header className="flex items-baseline justify-between px-1 pb-2">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">{s.label} <span className="font-semibold">{col.length}</span></h2>
                  <span className="text-[11px] font-semibold tabular-nums text-muted">{cad(col.reduce((a, d) => a + d.amount, 0))}</span>
                </header>
                <ul className="space-y-2">
                  {col.map((d) => (
                    <li
                      key={d.id}
                      draggable
                      onDragStart={() => setDragId(d.id)}
                      onDragEnd={() => setDragId(null)}
                      className={cn("group cursor-grab rounded-lg border border-line bg-card-solid p-2.5 shadow-card-rest active:cursor-grabbing", dragId === d.id && "opacity-50")}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[12.5px] font-semibold leading-snug text-fg">{d.name}</p>
                        <ConfirmPopover message={`Delete “${d.name}”?`} confirmLabel="Delete" tone="danger" onConfirm={() => remove(d.id)}>
                          {(open) => <button type="button" aria-label="Delete deal" onClick={open} className="text-subtle opacity-0 hover:text-rose-700 group-hover:opacity-100 focus:opacity-100"><Trash2 size={12} /></button>}
                        </ConfirmPopover>
                      </div>
                      {d.org && <p className="text-[11px] text-muted">{d.org}</p>}
                      <label className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                        $<input
                          aria-label={`Amount for ${d.name}`}
                          defaultValue={d.amount || ""}
                          inputMode="numeric"
                          onBlur={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, "")) || 0; if (n !== d.amount) save(d.id, { amount: n }); }}
                          className="w-20 rounded border border-transparent bg-transparent px-1 font-semibold tabular-nums text-fg hover:border-line focus:border-line focus:outline-none"
                        />
                      </label>
                      <p className="mt-1 text-[10.5px] text-subtle">
                        {d.closeDate ? `Close ${fmtDay(d.closeDate)}` : "No close date"}{d.ownerName ? ` · ${d.ownerName}` : ""}
                      </p>
                      {d.personId && <Link href={`/admin/workspace/outreach/contacts/${d.personId}`} className="mt-1 block truncate text-[11px] font-medium text-brand-700 hover:underline">{d.personName ?? "Contact"}</Link>}
                      {/* Keyboard alternative to drag-and-drop. */}
                      <select aria-label={`Stage for ${d.name}`} value={d.stage} onChange={(e) => save(d.id, { stage: e.target.value })} className="mt-1.5 w-full rounded border border-line bg-card-solid px-1 py-0.5 text-[10.5px] text-muted">
                        {DEAL_STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
