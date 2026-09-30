"use client";

/**
 * The prep day's tasks. Each one: a tick for done, its people (added from
 * the filming day's list), a note, and — for "Prepare my gear" — its own
 * checklist. New tasks and new checklist lines can be added anywhere.
 * Saves on its own a moment after each change.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import type { PrepTask } from "@/lib/video/prep";
import { savePrep } from "@/lib/video/printout-actions";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

type Person = { id: string; name: string; group: string };
const INPUT = "min-w-0 rounded-md border border-line bg-card-solid px-2 py-1 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none";

export function PrepDay({ projectId, when, people, initial }: { projectId: string; when: string; people: Person[]; initial: PrepTask[] }) {
  const [tasks, setTasks] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [newTask, setNewTask] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const byId = new Map(people.map((p) => [p.id, p]));

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      savePrep(projectId, tasks).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 600);
    return () => clearTimeout(t);
  }, [tasks, projectId]);

  const set = (id: string, patch: Partial<PrepTask>) => setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const live = tasks.filter((t) => !t.removed);
  const done = live.filter((t) => t.done).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fg">Prep day</p>
          <p className="text-[12.5px] text-muted">{when} · <strong className="text-fg">{done}</strong> of {live.length} done</p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle" role="status">
          {status === "saving" ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
            : status === "error" ? <span className="text-rose-600">Not saved — try again</span>
            : <><Check size={11} className="text-emerald-500" /> Saved</>}
        </span>
      </div>

      <ul className="space-y-2">
        {live.map((t) => {
          const itemsDone = t.items.filter((i) => i.checked).length;
          const free = people.filter((p) => !t.people.includes(p.id));
          return (
            <li key={t.id} className={`rounded-xl border p-3 transition-colors ${t.done ? "border-line bg-black/20" : "border-line bg-card"}`}>
              <div className="flex flex-wrap items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => set(t.id, { done: !t.done })}
                  aria-pressed={t.done}
                  aria-label={t.done ? `Mark “${t.title}” as not done` : `Mark “${t.title}” as done`}
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line text-transparent hover:border-emerald-500 hover:text-emerald-500"
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <div className={`min-w-0 flex-1 ${t.done ? "opacity-55" : ""}`}>
                  <input
                    id={`prep-title-${t.id}`}
                    value={t.title}
                    maxLength={160}
                    onChange={(e) => set(t.id, { title: e.target.value })}
                    aria-label="Task"
                    className={`w-full bg-transparent text-[14px] font-bold text-fg outline-none focus:underline ${t.done ? "line-through decoration-2" : ""}`}
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.people.map((id) => byId.get(id)).filter((p): p is Person => !!p).map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/12 py-0.5 pl-2 pr-1 text-[11.5px] font-semibold text-fg">
                        {p.name}
                        <button type="button" aria-label={`Take ${p.name} off this task`} onClick={() => set(t.id, { people: t.people.filter((x) => x !== p.id) })} className="rounded-full px-0.5 text-subtle hover:text-rose-500">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    {t.people.length === 0 && <span className="text-[11.5px] italic text-amber-600">Nobody on this yet</span>}
                    {free.length > 0 && (
                      <select
                        id={`prep-add-person-${t.id}`}
                        aria-label="Put someone on this task"
                        value=""
                        onChange={(e) => e.target.value && set(t.id, { people: [...t.people, e.target.value] })}
                        className="rounded-full border border-dashed border-line bg-transparent px-2 py-0.5 text-[11.5px] text-muted hover:text-fg"
                      >
                        <option value="">+ Add someone</option>
                        {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                  <textarea
                    id={`prep-notes-${t.id}`}
                    value={t.notes}
                    rows={t.notes ? 2 : 1}
                    maxLength={1000}
                    placeholder="Notes…"
                    onChange={(e) => set(t.id, { notes: e.target.value })}
                    className="mt-1.5 w-full resize-y rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-muted placeholder:text-subtle hover:border-line focus:border-brand-400 focus:outline-none"
                  />

                  {(t.items.length > 0 || newItem[t.id] !== undefined) && (
                    <div className="mt-1.5 rounded-lg border border-line bg-elevated/40 p-2">
                      <p className="text-[11px] font-semibold text-subtle">{itemsDone} of {t.items.length} ready</p>
                      <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
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
                    </div>
                  )}
                  <form
                    className="mt-1.5 flex gap-1.5"
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
                <ConfirmPopover message={`Remove “${t.title}”?`} confirmLabel="Remove" tone="danger" onConfirm={() => (t.custom ? setTasks((all) => all.filter((x) => x.id !== t.id)) : set(t.id, { removed: true }))}>
                  {(open) => (
                    <button type="button" onClick={open} aria-label={`Remove ${t.title}`} className="rounded p-1 text-subtle hover:text-rose-500"><X size={14} /></button>
                  )}
                </ConfirmPopover>
              </div>
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
          setTasks((all) => [...all, { id: `c-${Date.now().toString(36)}`, title, people: [], done: false, notes: "", items: [], removed: false, custom: true }]);
          setNewTask("");
        }}
      >
        <input id="prep-new-task" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task for the prep day…" maxLength={160} className={`${INPUT} w-full max-w-md py-1.5`} />
        <button type="submit" disabled={!newTask.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40"><Plus size={13} /> Add task</button>
      </form>
      {tasks.some((t) => t.removed) && (
        <button type="button" onClick={() => setTasks((all) => all.map((t) => ({ ...t, removed: false })))} className="text-[12px] font-semibold text-muted hover:text-fg">
          Put back the tasks that were removed
        </button>
      )}
    </div>
  );
}
