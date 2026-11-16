"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, ChevronDown, Loader2, Mail, Plus, Square, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { btnCls, crmPost, fmtDay, inputCls, primaryCls } from "./crm-api";

export interface TaskRow {
  id: string; title: string; dueAt: string | null; doneAt: string | null; assigneeId: string | null; assigneeName: string;
  personId: string | null; personName: string | null; dealName: string | null;
}
export interface DueStep {
  id: string; personId: string; personName: string; email: string; sequenceName: string;
  step: number; total: number; dueAt: string | null; subject: string; body: string;
}

export function TasksClient({ tasks, steps, owners, meId }: { tasks: TaskRow[]; steps: DueStep[]; owners: { id: string; name: string }[]; meId: string | null }) {
  const router = useRouter();
  const [mine, setMine] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", due: "", assigneeId: meId ?? "" });

  async function act(action: string, body: Record<string, unknown>, id: string) {
    setBusyId(id); setError(null);
    const { ok, data } = await crmPost(action, body);
    setBusyId(null);
    if (!ok) { setError(data.error ?? "That didn't work."); return; }
    router.refresh();
  }

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const today1 = new Date(today0.getTime() + 86_400_000);
  const shown = tasks.filter((t) => !mine || t.assigneeId === meId);
  const openTasks = shown.filter((t) => !t.doneAt);
  const groups: [string, TaskRow[]][] = [
    ["Overdue", openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < today0)],
    ["Today", openTasks.filter((t) => t.dueAt && new Date(t.dueAt) >= today0 && new Date(t.dueAt) < today1)],
    ["Upcoming", openTasks.filter((t) => t.dueAt && new Date(t.dueAt) >= today1)],
    ["No due date", openTasks.filter((t) => !t.dueAt)],
    ["Done recently", shown.filter((t) => t.doneAt)],
  ];

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">{error}</p>}

      <Card className="p-0">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Sequence emails due <span className="text-subtle">({steps.length})</span></h2>
          <p className="mt-0.5 text-[11.5px] text-muted">Nothing sends on its own: preview each step, then Send. Skip moves to the next step; Stop ends the sequence for that person.</p>
        </div>
        {steps.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted">No sequence emails due.</p> : (
          <ul className="divide-y divide-line">
            {steps.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/admin/workspace/outreach/contacts/${s.personId}`} className="text-sm font-semibold text-fg hover:text-brand-700">{s.personName}</Link>
                    <p className="text-[11.5px] text-muted">{s.sequenceName} · step {s.step + 1} of {s.total} · due {fmtDay(s.dueAt)} · {s.email || "no email"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className={btnCls}><ChevronDown size={12} className={cn("transition-transform", open === s.id && "rotate-180")} /> Preview</button>
                    <button type="button" disabled={busyId === s.id} onClick={() => act("enrollment.skip", { id: s.id }, s.id)} className={btnCls}>Skip</button>
                    <button type="button" disabled={busyId === s.id} onClick={() => act("enrollment.stop", { id: s.id }, s.id)} className={cn(btnCls, "hover:text-rose-700")}>Stop</button>
                    <button type="button" disabled={busyId === s.id || !s.email} onClick={() => act("enrollment.send", { id: s.id }, s.id)} className={primaryCls}>
                      {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Send
                    </button>
                  </div>
                </div>
                {open === s.id && (
                  <div className="mt-2 rounded-lg border border-line bg-elevated/30 p-3">
                    <p className="text-[12px] font-semibold text-fg">Subject: <span className="font-normal">{s.subject}</span></p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">{s.body}</pre>
                    <p className="mt-2 text-[11px] text-subtle">The unsubscribe footer is added when it sends.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <input id="task-title" aria-label="New task" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="New task…" className={cn(inputCls, "min-w-[14rem] flex-1")} />
        <input id="task-due" aria-label="Due date" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className={inputCls} />
        <select id="task-assignee" aria-label="Assign to" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className={inputCls}>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button type="button" disabled={!form.title.trim() || busyId === "new"} onClick={async () => {
          await act("task.create", { title: form.title, dueAt: form.due ? `${form.due}T12:00:00` : null, assigneeId: form.assigneeId }, "new");
          setForm((f) => ({ ...f, title: "", due: "" }));
        }} className={primaryCls}><Plus size={12} /> Add task</button>
        <span className="ml-auto inline-flex rounded-lg bg-elevated/60 p-1">
          {[["Mine", true], ["Everyone's", false]].map(([label, val]) => (
            <button key={String(label)} type="button" aria-pressed={mine === val} onClick={() => setMine(val as boolean)} className={cn("rounded-md px-3 py-1 text-xs font-semibold", mine === val ? "bg-card-solid text-fg shadow-card-rest" : "text-muted hover:text-fg")}>{label as string}</button>
          ))}
        </span>
      </div>

      {groups.map(([label, rows]) => rows.length > 0 && (
        <Card key={label} className="p-0">
          <h2 className={cn("border-b border-line px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em]", label === "Overdue" ? "text-rose-700" : "text-subtle")}>{label} · {rows.length}</h2>
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id} className="group flex items-start gap-3 px-4 py-2.5">
                <button type="button" aria-label={t.doneAt ? `Reopen “${t.title}”` : `Mark “${t.title}” done`} disabled={busyId === t.id} onClick={() => act("task.toggle", { id: t.id }, t.id)} className="mt-0.5 text-muted hover:text-emerald-700">
                  {t.doneAt ? <CheckSquare size={15} className="text-emerald-600" /> : <Square size={15} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13px] font-medium", t.doneAt ? "text-subtle line-through" : "text-fg")}>{t.title}</p>
                  <p className="text-[11px] text-subtle">
                    {t.dueAt ? `Due ${fmtDay(t.dueAt)}` : "No due date"} · {t.assigneeName}
                    {t.personId && <> · <Link href={`/admin/workspace/outreach/contacts/${t.personId}`} className="text-brand-700 hover:underline">{t.personName}</Link></>}
                    {t.dealName && <> · deal: {t.dealName}</>}
                  </p>
                </div>
                <button type="button" aria-label="Delete task" onClick={() => act("task.delete", { id: t.id }, t.id)} className="text-subtle opacity-0 hover:text-rose-700 group-hover:opacity-100 focus:opacity-100"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {shown.length === 0 && <p className="text-center text-sm text-muted">No tasks{mine ? " assigned to you" : ""}.</p>}
    </div>
  );
}
