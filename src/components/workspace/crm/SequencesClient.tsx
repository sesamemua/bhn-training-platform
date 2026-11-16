"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { cn } from "@/lib/utils";
import type { SequenceStep } from "@/lib/outreach/crm";
import { btnCls, crmPost, inputCls, primaryCls } from "./crm-api";

export interface SequenceRow { id: string; name: string; steps: SequenceStep[]; active: number; done: number; stopped: number }

const BLANK: SequenceStep = { delayDays: 0, subject: "", body: "Hi {{firstName}},\n\n\n\nBest,\n{{senderName}}" };

export function SequencesClient({ sequences, lists }: { sequences: SequenceRow[]; lists: { id: string; name: string; personIds: string[] }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id?: string; name: string; steps: SequenceStep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enrollList, setEnrollList] = useState<Record<string, string>>({});

  async function save() {
    if (!editing) return;
    const { ok, data } = await crmPost("sequence.save", editing);
    if (!ok) { setError(data.error ?? "Couldn't save the sequence."); return; }
    setEditing(null); setError(null); router.refresh();
  }

  async function enroll(seq: SequenceRow) {
    const list = lists.find((l) => l.id === enrollList[seq.id]);
    if (!list) return;
    const { ok, data } = await crmPost<{ enrolled: number; already: number }>("sequence.enroll", { sequenceId: seq.id, personIds: list.personIds });
    if (!ok) { setError(data.error ?? "Couldn't enrol."); return; }
    setNotice(`${data.enrolled} enrolled in “${seq.name}”${data.already ? ` · ${data.already} were already in it` : ""}. Their first email shows on Tasks when it's due.`);
    router.refresh();
  }

  const setStep = (i: number, patch: Partial<SequenceStep>) =>
    setEditing((e) => e && { ...e, steps: e.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">{notice}</p>}

      {!editing && <button type="button" onClick={() => setEditing({ name: "", steps: [{ ...BLANK }] })} className={primaryCls}><Plus size={12} /> New sequence</button>}

      {editing && (
        <Card className="space-y-4 p-5">
          <input id="seq-name" aria-label="Sequence name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Sequence name, e.g. EQUIP partner follow-up" className={cn(inputCls, "w-full text-sm")} />
          <ol className="space-y-3">
            {editing.steps.map((s, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-fg">Step {i + 1}</span>
                  <label className="inline-flex items-center gap-1 text-muted">
                    send
                    <input aria-label={`Delay for step ${i + 1}`} type="number" min={0} max={365} value={s.delayDays} onChange={(e) => setStep(i, { delayDays: Number(e.target.value) })} className={cn(inputCls, "w-16")} />
                    days after {i === 0 ? "enrolling" : "the previous step"}
                  </label>
                  {editing.steps.length > 1 && (
                    <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })} className="ml-auto text-subtle hover:text-rose-700"><Trash2 size={13} /></button>
                  )}
                </div>
                <input aria-label={`Subject for step ${i + 1}`} value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="Subject" className={cn(inputCls, "mt-2 w-full")} />
                <textarea aria-label={`Body for step ${i + 1}`} value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} rows={6} className={cn(inputCls, "mt-2 w-full font-sans leading-relaxed")} />
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-subtle">Placeholders: {"{{firstName}} {{contactName}} {{org}} {{senderName}}"}. The unsubscribe footer is added automatically.</p>
          <div className="flex flex-wrap gap-2">
            {editing.steps.length < 10 && <button type="button" onClick={() => setEditing({ ...editing, steps: [...editing.steps, { ...BLANK, delayDays: 3 }] })} className={btnCls}><Plus size={12} /> Add step</button>}
            <button type="button" onClick={save} className={primaryCls}>Save sequence</button>
            <button type="button" onClick={() => { setEditing(null); setError(null); }} className={btnCls}>Cancel</button>
          </div>
        </Card>
      )}

      <ul className="space-y-3">
        {sequences.map((s) => (
          <li key={s.id}>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{s.name}</p>
                <p className="text-[11.5px] text-muted">
                  {s.steps.length} step{s.steps.length === 1 ? "" : "s"} over {s.steps.reduce((a, x) => a + x.delayDays, 0)} days · {s.active} active · {s.done} finished · {s.stopped} stopped
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select aria-label={`List to enrol in ${s.name}`} value={enrollList[s.id] ?? ""} onChange={(e) => setEnrollList({ ...enrollList, [s.id]: e.target.value })} className={inputCls}>
                  <option value="">Enrol a list…</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.personIds.length})</option>)}
                </select>
                <button type="button" disabled={!enrollList[s.id]} onClick={() => enroll(s)} className={btnCls}><UserPlus size={12} /> Enrol</button>
                <button type="button" onClick={() => setEditing({ id: s.id, name: s.name, steps: s.steps })} className={btnCls}><Pencil size={12} /> Edit</button>
                <ConfirmPopover message={`Archive “${s.name}”?`} detail="Everyone still in it is stopped. Sent emails stay on their records." confirmLabel="Archive" tone="danger" onConfirm={async () => { await crmPost("sequence.archive", { id: s.id }); router.refresh(); }}>
                  {(open) => <button type="button" onClick={open} className={cn(btnCls, "hover:text-rose-700")}><Archive size={12} /> Archive</button>}
                </ConfirmPopover>
              </div>
            </Card>
          </li>
        ))}
        {sequences.length === 0 && !editing && <li className="text-sm text-muted">No sequences yet. A sequence is a set of follow-up emails spaced out over days; each one waits on Tasks for you to send it.</li>}
      </ul>
    </div>
  );
}
