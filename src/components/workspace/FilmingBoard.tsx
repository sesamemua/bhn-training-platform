"use client";

/**
 * The filming day as a timeline. Each task is a bar across the day; drag
 * it to move it, drag either end to change its length. People sit in the
 * list on the left and are dragged onto a task to put them on it — the
 * same person can be on several (Yoo Jin interviewed, then supporting).
 * An interview's bar shows its preparation paler than its filming.
 *
 * Everything the plan gets wrong is listed above it: two things filmed
 * at once, somebody in two places, anything outside building hours, a
 * task with nobody on it.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, DoorOpen, GripVertical, Lock, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  GROUP_LABEL, GROUPS, KIND_LABEL, KINDS, atMinute, clockOf, hhmmToMinutes, issues, longDate, minuteOfDay, minutesToHhmm,
  type Block, type Issue, type Person,
} from "@/lib/video/filming";
import {
  addFilmingBlock, addFilmingPerson, deleteFilmingBlock, deleteFilmingPerson, updateFilmingBlock, updateFilmingDay, updateFilmingPerson,
} from "@/lib/video/filming-actions";

export interface FilmingDayProps {
  id: string;
  title: string;
  date: string;
  location: string;
  opensAt: string;
  closesAt: string;
  notes: string;
}

const DRAG_TYPE = "application/x-filming-person";
const SNAP = 5;
const LABEL_W = 250;

const KIND_TONE: Record<string, { bar: string; prep: string; chip: string }> = {
  setup: { bar: "bg-slate-500", prep: "bg-slate-500/40", chip: "bg-slate-500/15 text-fg" },
  logistics: { bar: "bg-amber-500", prep: "bg-amber-500/40", chip: "bg-amber-500/15 text-amber-700" },
  interview: { bar: "bg-sky-600", prep: "bg-sky-500/35", chip: "bg-sky-500/15 text-sky-700" },
  lab: { bar: "bg-violet-600", prep: "bg-violet-500/35", chip: "bg-violet-500/15 text-violet-700" },
  broll: { bar: "bg-emerald-600", prep: "bg-emerald-500/35", chip: "bg-emerald-500/15 text-emerald-700" },
};
const tone = (k: string) => KIND_TONE[k] ?? KIND_TONE.logistics;

const INPUT = "w-full rounded-md border border-line bg-card px-2 py-1 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-brand-500/60 hover:bg-brand-500/10 disabled:opacity-50";

const payload = (b: Block) => ({
  kind: b.kind, title: b.title, notes: b.notes, start: b.start, end: b.end,
  prepMinutes: b.prepMinutes, locked: b.locked, flexible: b.flexible, people: b.people,
});
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function FilmingBoard({ day, people: initialPeople, blocks: initialBlocks }: { day: FilmingDayProps; people: Person[]; blocks: Block[] }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [people, setPeople] = useState(initialPeople);
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);
  useEffect(() => setPeople(initialPeople), [initialPeople]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [focusPerson, setFocusPerson] = useState<string | null>(null);

  const sorted = useMemo(() => [...blocks].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)), [blocks]);
  const found = useMemo(() => issues(day, blocks, people), [day, blocks, people]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // The visible range: building hours with a margin, widened to fit any task outside them.
  const opens = hhmmToMinutes(day.opensAt);
  const closes = hhmmToMinutes(day.closesAt);
  const from = Math.floor((Math.min(opens, ...blocks.map((b) => minuteOfDay(b.start))) - 30) / 60) * 60;
  const to = Math.ceil((Math.max(closes, ...blocks.map((b) => minuteOfDay(b.end))) + 30) / 60) * 60;
  const span = to - from;
  const pct = (min: number) => `${((min - from) / span) * 100}%`;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => from + i * 60);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, refresh = false) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Could not save.");
        router.refresh();
      } else if (refresh) router.refresh();
    });
  }
  const saveBlock = (b: Block) => {
    setBlocks((bs) => bs.map((x) => (x.id === b.id ? b : x)));
    run(() => updateFilmingBlock(b.id, payload(b)));
  };

  // ── dragging a bar ─────────────────────────────────────────────────
  const drag = useRef<{ id: string; mode: "move" | "start" | "end"; x0: number; width: number; s0: number; e0: number; moved: boolean } | null>(null);
  function onBarDown(e: React.PointerEvent<HTMLDivElement>, b: Block) {
    if (b.locked || e.button !== 0) return;
    const track = e.currentTarget.parentElement!.getBoundingClientRect();
    const bar = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bar.left;
    const mode = x < 8 ? "start" : x > bar.width - 8 ? "end" : "move";
    drag.current = { id: b.id, mode, x0: e.clientX, width: track.width, s0: minuteOfDay(b.start), e0: minuteOfDay(b.end), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onBarMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dm = Math.round(((e.clientX - d.x0) / d.width) * span / SNAP) * SNAP;
    if (dm === 0 && !d.moved) return;
    d.moved = true;
    setBlocks((bs) => bs.map((b) => {
      if (b.id !== d.id) return b;
      let s = d.s0, en = d.e0;
      if (d.mode === "move") { s += dm; en += dm; }
      if (d.mode === "start") s = Math.min(d.s0 + dm, en - Math.max(SNAP, b.prepMinutes + SNAP));
      if (d.mode === "end") en = Math.max(d.e0 + dm, s + Math.max(SNAP, b.prepMinutes + SNAP));
      s = Math.max(0, s); en = Math.min(24 * 60 - 1, en);
      return { ...b, start: atMinute(day.date, s), end: atMinute(day.date, en) };
    }));
  }
  function onBarUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const b = blocks.find((x) => x.id === d.id);
    if (b) run(() => updateFilmingBlock(b.id, payload(b)));
  }

  // ── dropping a person on a task ────────────────────────────────────
  function onDrop(e: React.DragEvent, b: Block) {
    e.preventDefault();
    setDropOn(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (!id || b.people.includes(id)) return;
    saveBlock({ ...b, people: [...b.people, id] });
  }
  const acceptsPerson = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

  function addTask() {
    run(() => addFilmingBlock(day.id, {
      kind: "logistics", title: "New task", notes: "", prepMinutes: 0, locked: false, flexible: false, people: [],
      start: atMinute(day.date, opens), end: atMinute(day.date, opens + 30),
    }).then((r) => { if (r.ok && r.id) setEditing(r.id); return r; }), true);
  }

  const tasksOf = (personId: string) => blocks.filter((b) => b.people.includes(personId)).length;

  return (
    <div className="space-y-4">
      {/* The day: where, when the doors are open, and the standing rule. */}
      <section className="rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-fg">{day.title}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{longDate(day.date)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg">
              {day.location && <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-muted" /> {day.location}</span>}
              <span className="inline-flex items-center gap-1"><DoorOpen size={13} className="text-muted" /> Building open {clockOf(opens)} – {clockOf(closes)}</span>
            </p>
          </div>
          <button type="button" className={BTN} onClick={() => setEditingDay((v) => !v)}><Pencil size={12} /> {editingDay ? "Close" : "Edit the day"}</button>
        </div>
        {day.notes && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] font-medium text-fg">
            <DoorOpen size={15} className="mt-px shrink-0 text-amber-600" /> {day.notes}
          </p>
        )}
        {editingDay && <DayForm day={day} pending={pending} onSave={(v) => { run(() => updateFilmingDay(day.id, v), true); setEditingDay(false); }} />}
      </section>

      {error && <p role="alert" className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
      <IssueList issues={found} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* People: drag onto a task. */}
        <aside className="w-full shrink-0 rounded-xl border border-line bg-card p-3 lg:sticky lg:top-3 lg:w-56">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">People</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">Drag a name onto a task.</p>
          {GROUPS.map((g) => {
            const list = people.filter((p) => p.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mt-3">
                <p className="text-[11px] font-semibold text-subtle">{GROUP_LABEL[g]}</p>
                <ul className="mt-1 space-y-1">
                  {list.map((p) => (
                    <li key={p.id}>
                      <div
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, p.id); e.dataTransfer.effectAllowed = "copy"; }}
                        onMouseEnter={() => setFocusPerson(p.id)}
                        onMouseLeave={() => setFocusPerson(null)}
                        className="group flex cursor-grab items-start gap-1.5 rounded-md border border-line bg-card-solid px-2 py-1.5 active:cursor-grabbing"
                        title={p.role || undefined}
                      >
                        <GripVertical size={13} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold leading-tight text-fg">{p.name}</span>
                          {p.role && <span className="block truncate text-[10.5px] leading-tight text-muted">{p.role}</span>}
                        </span>
                        <span className="text-[10.5px] tabular-nums text-subtle" title="Tasks they are on">{tasksOf(p.id)}</span>
                        <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditingPerson(editingPerson === p.id ? null : p.id)} className="rounded p-0.5 text-subtle opacity-0 hover:text-fg group-hover:opacity-100 focus:opacity-100">
                          <Pencil size={11} />
                        </button>
                      </div>
                      {editingPerson === p.id && (
                        <PersonForm
                          person={p}
                          pending={pending}
                          onSave={(v) => { setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...v } : x))); run(() => updateFilmingPerson(p.id, v)); setEditingPerson(null); }}
                          onDelete={() => {
                            if (!confirm(`Take ${p.name} off the day, and off every task they are on?`)) return;
                            setPeople((ps) => ps.filter((x) => x.id !== p.id));
                            setBlocks((bs) => bs.map((b) => ({ ...b, people: b.people.filter((x) => x !== p.id) })));
                            run(() => deleteFilmingPerson(p.id));
                            setEditingPerson(null);
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <AddPerson pending={pending} onAdd={(v) => run(() => addFilmingPerson(day.id, v), true)} />
        </aside>

        {/* The timeline. */}
        <section className="min-w-0 flex-1 rounded-xl border border-line bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">Timeline · {blocks.length} tasks</p>
            <button type="button" className={BTN} onClick={addTask} disabled={pending}><Plus size={13} /> Add task</button>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              {/* Hour ruler. */}
              <div className="flex border-b border-line">
                <div style={{ width: LABEL_W }} className="shrink-0" />
                <div className="relative h-7 flex-1">
                  {hours.map((h) => (
                    <span key={h} className="absolute top-1.5 -translate-x-1/2 text-[10.5px] tabular-nums text-subtle" style={{ left: pct(h) }}>
                      {clockOf(h).replace(":00", "")}
                    </span>
                  ))}
                </div>
              </div>

              {sorted.map((b) => {
                const s = minuteOfDay(b.start), en = minuteOfDay(b.end);
                const t = tone(b.kind);
                const prepPct = b.prepMinutes > 0 ? Math.min(100, (b.prepMinutes / (en - s)) * 100) : 0;
                const focused = focusPerson && b.people.includes(focusPerson);
                return (
                  <div key={b.id} className="border-b border-line last:border-b-0">
                    <div
                      className={`flex transition-colors ${dropOn === b.id ? "bg-brand-500/10" : focused ? "bg-amber-400/[0.08]" : ""}`}
                      onDragOver={(e) => { if (acceptsPerson(e)) { e.preventDefault(); setDropOn(b.id); } }}
                      onDragLeave={() => setDropOn((x) => (x === b.id ? null : x))}
                      onDrop={(e) => onDrop(e, b)}
                    >
                      {/* Label: what, when, who. */}
                      <div style={{ width: LABEL_W }} className="shrink-0 border-r border-line px-3 py-2">
                        <button type="button" onClick={() => setEditing(editing === b.id ? null : b.id)} className="block w-full text-left">
                          <span className="flex items-center gap-1 text-[12.5px] font-semibold leading-tight text-fg">
                            {b.locked && <Lock size={11} className="shrink-0 text-subtle" aria-label="Pinned" />}
                            <span className="truncate">{b.title}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                            <span className={`rounded px-1 text-[10px] font-semibold ${t.chip}`}>{KIND_LABEL[b.kind as keyof typeof KIND_LABEL] ?? b.kind}</span>
                            <span className="tabular-nums">{clockOf(s)}–{clockOf(en)}</span>
                            {b.flexible && <span className="text-amber-600">time TBC</span>}
                          </span>
                        </button>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {b.people.map((id) => byId.get(id)).filter((p): p is Person => !!p).map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-0.5 rounded-full bg-elevated py-px pl-1.5 pr-0.5 text-[10.5px] font-medium text-fg">
                              {p.name}
                              <button type="button" aria-label={`Take ${p.name} off ${b.title}`} onClick={() => saveBlock({ ...b, people: b.people.filter((x) => x !== p.id) })} className="rounded-full px-0.5 text-subtle hover:text-rose-500">
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                          {b.people.length === 0 && <span className="text-[10.5px] italic text-amber-600">Drop someone here</span>}
                        </div>
                      </div>

                      {/* Track. */}
                      <div className="relative min-h-[56px] flex-1">
                        {/* Outside building hours, shaded. */}
                        <div className="absolute inset-y-0 bg-elevated/70" style={{ left: 0, width: pct(opens) }} aria-hidden />
                        <div className="absolute inset-y-0 right-0 bg-elevated/70" style={{ left: pct(closes) }} aria-hidden />
                        {hours.map((h) => <div key={h} className="absolute inset-y-0 w-px bg-line/60" style={{ left: pct(h) }} aria-hidden />)}
                        <div className="absolute inset-y-0 w-0.5 bg-rose-500/70" style={{ left: pct(closes) }} aria-hidden />
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${b.title}, ${clockOf(s)} to ${clockOf(en)}${b.locked ? ", pinned" : ", drag to move"}`}
                          onPointerDown={(e) => onBarDown(e, b)}
                          onPointerMove={onBarMove}
                          onPointerUp={onBarUp}
                          onPointerCancel={onBarUp}
                          onDoubleClick={() => setEditing(b.id)}
                          className={`absolute top-2 bottom-2 flex touch-none select-none overflow-hidden rounded-md text-white shadow-sm ${
                            b.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                          } ${b.flexible ? "outline-2 outline-dashed outline-offset-1 outline-amber-500" : ""} ${focused ? "ring-2 ring-amber-400" : ""}`}
                          style={{ left: pct(s), width: `calc(${pct(en)} - ${pct(s)})` }}
                          title={`${b.title} · ${clockOf(s)}–${clockOf(en)}${b.prepMinutes ? ` · ${b.prepMinutes} min preparation, then filming` : ""}${b.notes ? `\n${b.notes}` : ""}`}
                        >
                          {prepPct > 0 && (
                            <div className={`h-full shrink-0 ${t.prep}`} style={{ width: `${prepPct}%`, backgroundImage: "repeating-linear-gradient(-45deg, transparent 0 5px, rgba(255,255,255,.18) 5px 10px)" }} />
                          )}
                          <div className={`flex h-full min-w-0 flex-1 items-center gap-0.5 px-1.5 ${t.bar}`}>
                            {b.people.slice(0, 6).map((id) => byId.get(id)).filter(Boolean).map((p) => (
                              <span key={p!.id} className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/25 text-[9px] font-bold" title={p!.name}>
                                {initials(p!.name)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {editing === b.id && (
                      <TaskForm
                        block={b}
                        date={day.date}
                        pending={pending}
                        onSave={(nb) => { saveBlock(nb); setEditing(null); }}
                        onDelete={() => {
                          if (!confirm(`Delete “${b.title}”?`)) return;
                          setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                          run(() => deleteFilmingBlock(b.id));
                          setEditing(null);
                        }}
                        onClose={() => setEditing(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-subtle">
            Drag a bar to move it, or its ends to change its length (5-minute steps). Striped part: preparation; solid: filming or the task itself.
            Dashed outline: time not fixed. <Lock size={10} className="inline" /> pinned. Grey: building closed; red line: {clockOf(closes)} close.
          </p>
        </section>
      </div>
    </div>
  );
}

function IssueList({ issues: list }: { issues: Issue[] }) {
  if (!list.length) {
    return <p className="text-[12.5px] font-semibold text-emerald-600">No clashes: nobody is in two places, one thing is filmed at a time, and everything is inside building hours.</p>;
  }
  const say = (i: Issue) => {
    switch (i.kind) {
      case "camera": return <><strong>Filmed at the same time:</strong> {i.a.title} and {i.b.title}.</>;
      case "person": return <><strong>{i.person.name}</strong> is on two things at once: {i.a.title} and {i.b.title}.</>;
      case "hours": return i.when === "after"
        ? <><strong>{i.block.title}</strong> runs past closing — keep one person inside to open the door for anyone who steps out.</>
        : <><strong>{i.block.title}</strong> starts before the building opens.</>;
      case "nobody": return <><strong>{i.block.title}</strong> has nobody on it.</>;
    }
  };
  return (
    <section role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/[0.07] p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-fg"><AlertTriangle size={15} className="text-amber-600" /> {list.length} thing{list.length === 1 ? "" : "s"} to sort out</p>
      <ul className="mt-1.5 space-y-1 text-[12.5px] text-fg">
        {list.map((i, n) => (
          <li key={n} className={`flex gap-1.5 ${i.kind === "camera" ? "text-rose-600" : ""}`}>
            <span aria-hidden>•</span><span>{say(i)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskForm({ block, date, pending, onSave, onDelete, onClose }: {
  block: Block; date: string; pending: boolean; onSave: (b: Block) => void; onDelete: () => void; onClose: () => void;
}) {
  const [f, setF] = useState({
    title: block.title, kind: block.kind, notes: block.notes, prepMinutes: block.prepMinutes, locked: block.locked, flexible: block.flexible,
    from: minutesToHhmm(minuteOfDay(block.start)), to: minutesToHhmm(minuteOfDay(block.end)),
  });
  return (
    <form
      className="grid gap-2 border-t border-dashed border-line bg-elevated/40 px-3 py-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...block, title: f.title, kind: f.kind, notes: f.notes, prepMinutes: f.prepMinutes, locked: f.locked, flexible: f.flexible,
          start: atMinute(date, hhmmToMinutes(f.from)), end: atMinute(date, hhmmToMinutes(f.to)),
        });
      }}
    >
      <label className="text-[11px] text-muted sm:col-span-3">Task
        <input id={`t-title-${block.id}`} className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} />
      </label>
      <label className="text-[11px] text-muted">Kind
        <select id={`t-kind-${block.id}`} className={INPUT} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-muted">From
        <input id={`t-from-${block.id}`} type="time" step={300} className={INPUT} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} required />
      </label>
      <label className="text-[11px] text-muted">To
        <input id={`t-to-${block.id}`} type="time" step={300} className={INPUT} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} required />
      </label>
      <label className="text-[11px] text-muted sm:col-span-4">Notes
        <input id={`t-notes-${block.id}`} className={INPUT} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
      </label>
      <label className="text-[11px] text-muted sm:col-span-2">Preparation first (minutes)
        <input id={`t-prep-${block.id}`} type="number" min={0} max={240} step={5} className={INPUT} value={f.prepMinutes} onChange={(e) => setF({ ...f, prepMinutes: Number(e.target.value) || 0 })} />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-[12px] text-fg sm:col-span-6">
        <label className="inline-flex items-center gap-1.5"><input id={`t-flex-${block.id}`} type="checkbox" checked={f.flexible} onChange={(e) => setF({ ...f, flexible: e.target.checked })} /> Time not fixed (others may overlap it)</label>
        <label className="inline-flex items-center gap-1.5"><input id={`t-lock-${block.id}`} type="checkbox" checked={f.locked} onChange={(e) => setF({ ...f, locked: e.target.checked })} /> Pinned (can't be dragged)</label>
        <span className="ml-auto flex gap-1.5">
          <button type="button" className={`${BTN} text-rose-600`} onClick={onDelete} disabled={pending}><Trash2 size={12} /> Delete</button>
          <button type="button" className={BTN} onClick={onClose}>Cancel</button>
          <button type="submit" className={`${BTN} border-brand-500 bg-brand-600 text-white hover:bg-brand-700`} disabled={pending}>Save</button>
        </span>
      </div>
    </form>
  );
}

function PersonForm({ person, pending, onSave, onDelete }: {
  person: Person; pending: boolean; onSave: (v: Omit<Person, "id">) => void; onDelete: () => void;
}) {
  const [f, setF] = useState({ name: person.name, group: person.group, role: person.role, email: person.email });
  return (
    <form className="mt-1 space-y-1.5 rounded-md border border-dashed border-line p-2" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <input id={`p-name-${person.id}`} aria-label="Name" className={INPUT} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} />
      <select id={`p-group-${person.id}`} aria-label="Group" className={INPUT} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>
        {GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
      </select>
      <input id={`p-role-${person.id}`} aria-label="Role on the day" placeholder="Role on the day" className={INPUT} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} maxLength={200} />
      <input id={`p-email-${person.id}`} aria-label="Email" placeholder="Email (optional)" className={INPUT} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} />
      <div className="flex justify-between gap-1.5">
        <button type="button" className={`${BTN} text-rose-600`} onClick={onDelete} disabled={pending}><Trash2 size={11} /> Remove</button>
        <button type="submit" className={BTN} disabled={pending}>Save</button>
      </div>
    </form>
  );
}

function AddPerson({ pending, onAdd }: { pending: boolean; onAdd: (v: Omit<Person, "id">) => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>("team");
  return (
    <form
      className="mt-3 space-y-1.5 border-t border-line pt-3"
      onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onAdd({ name: name.trim(), group, role: "", email: "" }); setName(""); }}
    >
      <p className="text-[11px] font-semibold text-subtle">Add a person</p>
      <input id="filming-add-person" aria-label="Name" placeholder="Name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <div className="flex gap-1.5">
        <select id="filming-add-group" aria-label="Group" className={INPUT} value={group} onChange={(e) => setGroup(e.target.value)}>
          {GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
        </select>
        <button type="submit" className={BTN} disabled={pending || !name.trim()}><Plus size={12} /> Add</button>
      </div>
    </form>
  );
}

function DayForm({ day, pending, onSave }: { day: FilmingDayProps; pending: boolean; onSave: (v: Omit<FilmingDayProps, "id">) => void }) {
  const [f, setF] = useState({ title: day.title, date: day.date, location: day.location, opensAt: day.opensAt, closesAt: day.closesAt, notes: day.notes });
  return (
    <form className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <label className="text-[11px] text-muted sm:col-span-3">Title<input id="fd-title" className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
      <label className="text-[11px] text-muted">Date<input id="fd-date" type="date" className={INPUT} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
      <label className="text-[11px] text-muted">Building opens<input id="fd-opens" type="time" className={INPUT} value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} required /></label>
      <label className="text-[11px] text-muted">Closes<input id="fd-closes" type="time" className={INPUT} value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} required /></label>
      <label className="text-[11px] text-muted sm:col-span-6">Location<input id="fd-location" className={INPUT} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      <label className="text-[11px] text-muted sm:col-span-6">Notes for everybody on the day
        <textarea id="fd-notes" rows={2} className={INPUT} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} />
      </label>
      <div className="sm:col-span-6"><button type="submit" className={BTN} disabled={pending}>Save the day</button></div>
    </form>
  );
}
