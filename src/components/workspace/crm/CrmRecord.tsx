"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, CalendarCheck, CheckSquare, ClipboardList, HandCoins, ListOrdered, Mail, MessageSquarePlus,
  Plus, Square, UserPlus, UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { DEAL_STAGES, LEAD_STATUSES, LIFECYCLE_STAGES, cad, labelOf, scoreBand } from "@/lib/outreach/crm";
import type { TimelineItem } from "@/lib/outreach/crm-server";
import { btnCls, crmPost, fmtDay, inputCls, primaryCls } from "./crm-api";

interface Props {
  person: {
    id: string; values: Record<string, string>; lifecycle: string; leadStatus: string; ownerId: string | null;
    source: string; score: number; unsubscribed: boolean; lists: { id: string; name: string }[];
  };
  tasks: { id: string; title: string; dueAt: string | null; assigneeName: string }[];
  deals: { id: string; name: string; stage: string; amount: number }[];
  enrollments: { id: string; name: string; status: string; step: number; total: number; nextDueAt: string | null }[];
  timeline: TimelineItem[];
  owners: { id: string; name: string }[];
  sequences: { id: string; name: string }[];
}

const KIND_ICON: Record<TimelineItem["kind"], typeof Mail> = {
  touch: MessageSquarePlus, email: Mail, form: ClipboardList, registration: CalendarCheck,
  account: UserPlus, task: CheckSquare, sequence: ListOrdered, created: UserRound,
};

export const BAND_CLS = { hot: "bg-rose-50 text-rose-700", warm: "bg-amber-50 text-amber-800", cold: "bg-elevated text-muted" } as const;

export function CrmRecord({ person, tasks, deals, enrollments, timeline, owners, sequences }: Props) {
  const router = useRouter();
  const v = person.values;
  const [error, setError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState("call");
  const [dealName, setDealName] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [seqId, setSeqId] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: string, body: Record<string, unknown>) {
    setBusy(true); setError(null);
    const { ok, data } = await crmPost(action, body);
    setBusy(false);
    if (!ok) { setError(data.error ?? "That didn't save."); return false; }
    router.refresh();
    return true;
  }

  async function logActivity() {
    if (!note.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/workspace/outreach/people/${person.id}/touches`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: noteKind, note }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError("Couldn't log that activity."); return; }
    setNote(""); router.refresh();
  }

  const band = scoreBand(person.score);
  const select = (value: string, onChange: (v: string) => void, opts: readonly { key: string; label: string }[], id: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "w-full")}>
      {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <Link href="/admin/workspace/outreach/contacts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg">
        <ArrowLeft size={14} /> All contacts
      </Link>

      <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-fg">{v.name || v.email || "Unnamed contact"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            {v.title && <span>{v.title}</span>}
            {v.org && <Link href={`/admin/workspace/outreach/contacts?q=${encodeURIComponent(v.org)}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Building2 size={12} /> {v.org}</Link>}
            {v.email && <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Mail size={12} /> {v.email}</a>}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {person.lists.map((l) => <span key={l.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold text-brand-700">{l.name}</span>)}
            {person.unsubscribed && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700">Unsubscribed</span>}
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[10.5px] text-muted">Source: {person.source}</span>
          </p>
        </div>
        <div className={cn("rounded-xl px-4 py-2 text-center", BAND_CLS[band])} title="Lead score: touches, emails opened and clicked, forms, registrations and an account all add up (max 100).">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Lead score</p>
          <p className="text-2xl font-bold tabular-nums">{person.score}</p>
          <p className="text-[10.5px] font-semibold capitalize">{band}</p>
        </div>
      </Card>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Properties</h2>
            <label htmlFor="crm-lifecycle" className="block text-[11px] font-semibold text-muted">Lifecycle stage
              {select(person.lifecycle, (x) => run("person.update", { id: person.id, lifecycle: x }), LIFECYCLE_STAGES, "crm-lifecycle")}
            </label>
            <label htmlFor="crm-status" className="block text-[11px] font-semibold text-muted">Lead status
              {select(person.leadStatus, (x) => run("person.update", { id: person.id, leadStatus: x }), LEAD_STATUSES, "crm-status")}
            </label>
            <label htmlFor="crm-owner" className="block text-[11px] font-semibold text-muted">Owner
              {select(person.ownerId ?? "", (x) => run("person.update", { id: person.id, ownerId: x || null }), [{ key: "", label: "No owner" }, ...owners.map((o) => ({ key: o.id, label: o.name }))], "crm-owner")}
            </label>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Tasks</h2>
            <ul className="space-y-1.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-xs">
                  <button type="button" aria-label={`Mark “${t.title}” done`} onClick={() => run("task.toggle", { id: t.id })} className="mt-0.5 text-muted hover:text-emerald-700"><Square size={14} /></button>
                  <span className="min-w-0 flex-1"><span className="font-medium text-fg">{t.title}</span><span className="block text-[10.5px] text-subtle">{t.dueAt ? `Due ${fmtDay(t.dueAt)}` : "No due date"} · {t.assigneeName}</span></span>
                </li>
              ))}
              {tasks.length === 0 && <li className="text-xs text-subtle">No open tasks.</li>}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              <input id="crm-task-title" aria-label="New task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow up about…" className={cn(inputCls, "min-w-0 flex-1")} />
              <input id="crm-task-due" aria-label="Due date" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={inputCls} />
              <button type="button" disabled={busy || !taskTitle.trim()} onClick={async () => { if (await run("task.create", { title: taskTitle, dueAt: taskDue ? `${taskDue}T12:00:00` : null, personId: person.id })) { setTaskTitle(""); setTaskDue(""); } }} className={primaryCls}><Plus size={12} /> Add</button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Deals</h2>
            <ul className="space-y-1.5 text-xs">
              {deals.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <Link href="/admin/workspace/outreach/deals" className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg hover:text-brand-700"><HandCoins size={12} className="shrink-0" /><span className="truncate">{d.name}</span></Link>
                  <span className="shrink-0 text-muted">{labelOf(DEAL_STAGES, d.stage)} · <span className="tabular-nums">{cad(d.amount)}</span></span>
                </li>
              ))}
              {deals.length === 0 && <li className="text-subtle">No deals.</li>}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              <input id="crm-deal-name" aria-label="Deal name" value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder={`${v.org || "Org"} sponsorship`} className={cn(inputCls, "min-w-0 flex-1")} />
              <input id="crm-deal-amount" aria-label="Amount in CAD" inputMode="numeric" value={dealAmount} onChange={(e) => setDealAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="$" className={cn(inputCls, "w-20")} />
              <button type="button" disabled={busy || !dealName.trim()} onClick={async () => { if (await run("deal.save", { name: dealName, org: v.org ?? "", amount: Number(dealAmount) || 0, personId: person.id })) { setDealName(""); setDealAmount(""); } }} className={primaryCls}><Plus size={12} /> Add</button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-fg">Sequences</h2>
            <ul className="space-y-1.5 text-xs">
              {enrollments.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-fg">{e.name}</span>
                  <span className="shrink-0 text-muted">
                    {e.status === "active" ? `Step ${e.step + 1}/${e.total} · due ${fmtDay(e.nextDueAt)}` : e.status}
                    {e.status === "active" && <button type="button" onClick={() => run("enrollment.stop", { id: e.id })} className="ml-2 font-semibold text-rose-700 hover:underline">Stop</button>}
                  </span>
                </li>
              ))}
              {enrollments.length === 0 && <li className="text-subtle">Not in a sequence.</li>}
            </ul>
            {sequences.length > 0 && (
              <div className="flex gap-1.5">
                <select id="crm-seq" aria-label="Sequence" value={seqId} onChange={(e) => setSeqId(e.target.value)} className={cn(inputCls, "min-w-0 flex-1")}>
                  <option value="">Choose a sequence…</option>
                  {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" disabled={busy || !seqId} onClick={async () => { if (await run("sequence.enroll", { sequenceId: seqId, personIds: [person.id] })) setSeqId(""); }} className={primaryCls}>Enrol</button>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg">Activity</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <select id="crm-note-kind" aria-label="Activity type" value={noteKind} onChange={(e) => setNoteKind(e.target.value)} className={inputCls}>
              {["call", "meeting", "email", "linkedin", "event", "other"].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
            <input id="crm-note" aria-label="What happened" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logActivity()} placeholder="Log a call, meeting or note…" className={cn(inputCls, "min-w-0 flex-1")} />
            <button type="button" disabled={busy || !note.trim()} onClick={logActivity} className={btnCls}>Log</button>
          </div>
          <ol className="mt-4 space-y-0">
            {timeline.map((t, i) => {
              const Icon = KIND_ICON[t.kind];
              return (
                <li key={`${t.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < timeline.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-line" />}
                  <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-card-solid text-muted"><Icon size={13} /></span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13px] font-medium text-fg">{t.title}</p>
                    {t.detail && <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-muted">{t.detail}</p>}
                    <p className="mt-0.5 text-[11px] text-subtle">{new Date(t.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}{t.by ? ` · ${t.by}` : ""}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}
