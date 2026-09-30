"use client";

/**
 * The prep day's tasks, one line each: a tick for done, its people (added
 * from the filming day's list), a due date; the note and — for "Prepare my
 * gear" — the checklist open underneath. New tasks and new checklist lines can be added anywhere.
 * Saves on its own a moment after each change.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ListChecks, Loader2, Plus, StickyNote, X } from "lucide-react";
import type { PrepList, PrepTask } from "@/lib/video/prep";
import { savePrep } from "@/lib/video/printout-actions";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

type Person = { id: string; name: string; group: string };
const INPUT = "min-w-0 rounded-md border border-line bg-card-solid px-2 py-1 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none";

export function PrepDay({ projectId, when, people, initial, list = "prep", heading = "Prep day" }: {
  projectId: string; when: string; people: Person[]; initial: PrepTask[];
  /** Which list this is: the day before, or the weeks before. */
  list?: PrepList;
  heading?: string;
}) {
  const [tasks, setTasks] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [newTask, setNewTask] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const byId = new Map(people.map((p) => [p.id, p]));

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      savePrep(projectId, tasks, list).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 600);
    return () => clearTimeout(t);
  }, [tasks, projectId]);

  const set = (id: string, patch: Partial<PrepTask>) => setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const live = tasks.filter((t) => !t.removed);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
  const done = live.filter((t) => t.done).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted"><strong className="text-[15px] text-fg">{heading}</strong> · {when} · <strong className="text-fg">{done}</strong> of {live.length} done</p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle" role="status">
          {status === "saving" ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
            : status === "error" ? <span className="text-rose-600">Not saved — try again</span>
            : <><Check size={11} className="text-emerald-500" /> Saved</>}
        </span>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {live.map((t) => {
          const itemsDone = t.items.filter((i) => i.checked).length;
          const free = people.filter((p) => !t.people.includes(p.id));
          const isOpen = !!open[t.id];
          const late = !t.done && !!t.due && t.due < today;
          return (
            <li key={t.id} className={`px-3 py-1.5 transition-colors ${t.done ? "bg-black/20" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => set(t.id, { done: !t.done })}
                  aria-pressed={t.done}
                  aria-label={t.done ? `Mark “${t.title}” as not done` : `Mark “${t.title}” as done`}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line text-transparent hover:border-emerald-500 hover:text-emerald-500"
                  }`}
                >
                  <Check size={11} strokeWidth={3} />
                </button>
                <input
                  id={`prep-title-${t.id}`}
                  value={t.title}
                  maxLength={160}
                  onChange={(e) => set(t.id, { title: e.target.value })}
                  aria-label="Task"
                  className={`min-w-[12rem] flex-1 bg-transparent text-[13.5px] font-semibold text-fg outline-none focus:underline ${t.done ? "line-through decoration-2 opacity-55" : ""}`}
                />
                {t.suggested && <span className="rounded bg-sky-500/12 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">suggested</span>}
                <div className={`flex flex-wrap items-center gap-1 ${t.done ? "opacity-55" : ""}`}>
                  {t.people.map((id) => byId.get(id)).filter((p): p is Person => !!p).map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/12 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-fg">
                      {p.name}
                      <button type="button" aria-label={`Take ${p.name} off this task`} onClick={() => set(t.id, { people: t.people.filter((x) => x !== p.id) })} className="rounded-full px-0.5 text-subtle hover:text-rose-500">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {t.people.length === 0 && <span className="text-[11px] italic text-amber-600">Nobody yet</span>}
                  {free.length > 0 && (
                    <select
                      id={`prep-add-person-${t.id}`}
                      aria-label="Put someone on this task"
                      value=""
                      onChange={(e) => e.target.value && set(t.id, { people: [...t.people, e.target.value] })}
                      className="w-7 rounded-full border border-dashed border-line bg-transparent px-1 py-0.5 text-[11px] text-muted hover:text-fg"
                      title="Add someone"
                    >
                      <option value="">+</option>
                      {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>
                <label className={`inline-flex items-center gap-1 text-[11px] ${late ? "font-semibold text-rose-600" : t.due === today && !t.done ? "font-semibold text-amber-600" : "text-muted"}`}>
                  <span className="sr-only">Due</span>
                  <input
                    id={`prep-due-${t.id}`}
                    type="date"
                    value={t.due}
                    onChange={(e) => set(t.id, { due: e.target.value })}
                    className="rounded border border-line bg-transparent px-1 py-0 text-[11px] text-fg"
                  />
                  {late ? "overdue" : t.due === today && !t.done ? "today" : null}
                </label>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "Hide notes and checklist" : "Show notes and checklist"}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${isOpen ? "border-brand-400 text-fg" : "border-line text-muted hover:text-fg"}`}
                >
                  {t.items.length > 0 ? <><ListChecks size={12} /> {itemsDone}/{t.items.length}</> : <StickyNote size={12} />}
                  {t.notes && !isOpen && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />}
                  <ChevronDown size={11} className={isOpen ? "rotate-180" : ""} />
                </button>
                <ConfirmPopover message={`Remove “${t.title}”?`} confirmLabel="Remove" tone="danger" onConfirm={() => (t.custom ? setTasks((all) => all.filter((x) => x.id !== t.id)) : set(t.id, { removed: true }))}>
                  {(openIt) => (
                    <button type="button" onClick={openIt} aria-label={`Remove ${t.title}`} className="rounded p-0.5 text-subtle hover:text-rose-500"><X size={13} /></button>
                  )}
                </ConfirmPopover>
              </div>
              {!isOpen && t.notes && <p className="truncate pl-7 text-[11.5px] text-muted">{t.notes}</p>}

              {isOpen && (
                <div className="mt-1 space-y-1.5 pl-7">
                  <textarea
                    id={`prep-notes-${t.id}`}
                    value={t.notes}
                    rows={t.notes ? 2 : 1}
                    maxLength={1000}
                    placeholder="Notes…"
                    onChange={(e) => set(t.id, { notes: e.target.value })}
                    className="w-full resize-y rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[12px] text-muted placeholder:text-subtle focus:border-brand-400 focus:outline-none"
                  />
                  {t.items.length > 0 && (
                    <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-4">
                      {t.items.map((i) => (
                        <li key={i.id} className="group flex items-center gap-1.5">
                          <input
                            id={`prep-item-${i.id}`}
                            type="checkbox"
                            checked={i.checked}
                            onChange={(e) => set(t.id, { items: t.items.map((x) => (x.id === i.id ? { ...x, checked: e.target.checked } : x)) })}
                            className="h-3.5 w-3.5 accent-emerald-600"
                          />
                          <label htmlFor={`prep-item-${i.id}`} className={`min-w-0 flex-1 cursor-pointer text-[12px] ${i.checked ? "text-subtle line-through" : "text-fg"}`}>{i.label}</label>
                          <button type="button" aria-label={`Remove ${i.label}`} onClick={() => set(t.id, { items: t.items.filter((x) => x.id !== i.id) })} className="text-subtle opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100">
                            <X size={11} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const label = (newItem[t.id] ?? "").trim();
                      if (!label) return;
                      set(t.id, { items: [...t.items, { id: `i-${Date.now().toString(36)}`, label, checked: false }] });
                      setNewItem((n) => ({ ...n, [t.id]: "" }));
                    }}
                  >
                    <input id={`prep-new-item-${t.id}`} value={newItem[t.id] ?? ""} onChange={(e) => setNewItem((n) => ({ ...n, [t.id]: e.target.value }))} placeholder="Add a checklist line…" maxLength={120} className={`${INPUT} w-64`} />
                    <button type="submit" aria-label="Add the line" disabled={!(newItem[t.id] ?? "").trim()} className="rounded-md border border-line px-2 text-muted hover:text-fg disabled:opacity-40"><Plus size={13} /></button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const title = newTask.trim();
          if (!title) return;
          setTasks((all) => [...all, { id: `c-${Date.now().toString(36)}`, title, people: [], done: false, notes: "", items: [], removed: false, custom: true, due: "", suggested: false }]);
          setNewTask("");
        }}
      >
        <input id="prep-new-task" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder={list === "preshoot" ? "Add something to do before the shoot…" : "Add a task for the prep day…"} maxLength={160} className={`${INPUT} w-full max-w-md`} />
        <button type="submit" disabled={!newTask.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40"><Plus size={13} /> Add task</button>
      </form>
      {tasks.some((t) => t.removed) && (
        <button type="button" onClick={() => setTasks((all) => all.map((t) => ({ ...t, removed: false })))} className="text-[12px] font-semibold text-muted hover:text-fg">
          Put back the tasks that were removed
        </button>
      )}
    </div>
  );
}
