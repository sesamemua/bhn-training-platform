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
import { AlertTriangle, DoorOpen, Lock, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  GROUP_LABEL, GROUPS, KIND_LABEL, KINDS, ON_CAMERA, atMinute, clockOf, hhmmToMinutes, issues, longDate, minuteOfDay, minutesToHhmm,
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
const ROW_H = 64;
const RULER_H = 48;
/** Where the People box sits: the 3–5 p.m. columns, above the rows starting from 12:30. */
const TRAY_FROM = 15 * 60;
const TRAY_TO = 17 * 60;
const TRAY_ABOVE = 12 * 60 + 30;
/** The chart always runs to at least 7 p.m.: a shoot can go past closing. */
const VIEW_UNTIL = 19 * 60;
/** "11:30", and a whole hour as just "12", so a half-hour bar can hold its times. */
const compact = (min: number) => (min % 60 ? short(min) : String(((Math.floor(min / 60) + 11) % 12) + 1));
const short = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")}`;

/*
 * Set-up and errands are see-through: a tint and an outline, so the
 * filming reads first. Coffee and lunch get a colour of their own. An
 * interview's prep & make-up is the same colour, lighter, leading in.
 */
const KIND_TONE: Record<string, { bar: string; prep: string; chip: string; text: string }> = {
  setup: { bar: "bg-slate-400/20 border border-slate-400/60", prep: "bg-slate-400/[0.07]", chip: "bg-slate-500/15 text-fg", text: "text-fg" },
  logistics: { bar: "bg-slate-400/15 border border-dashed border-slate-400/60", prep: "bg-slate-400/[0.07]", chip: "bg-slate-500/15 text-fg", text: "text-fg" },
  meal: { bar: "bg-amber-500", prep: "bg-amber-500/15 border border-amber-500/30", chip: "bg-amber-500/15 text-amber-700", text: "text-white" },
  interview: { bar: "bg-sky-600", prep: "bg-sky-500/15 border border-sky-500/30", chip: "bg-sky-500/15 text-sky-700", text: "text-white" },
  lab: { bar: "bg-violet-600", prep: "bg-violet-500/15 border border-violet-500/30", chip: "bg-violet-500/15 text-violet-700", text: "text-white" },
};
const tone = (k: string) => KIND_TONE[k] ?? KIND_TONE.logistics;

const INPUT = "w-full rounded-md border border-line bg-card px-2 py-1 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-brand-500/60 hover:bg-brand-500/10 disabled:opacity-50";

const payload = (b: Block) => ({
  kind: b.kind, title: b.title, notes: b.notes, start: b.start, end: b.end,
  prepMinutes: b.prepMinutes, locked: b.locked, flexible: b.flexible, people: b.people, facilitators: b.facilitators,
});
const minutes = (n: number) => (n >= 60 && n % 60 === 0 ? `${n / 60} h` : n > 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);

export function FilmingBoard({ day, people: initialPeople, blocks: initialBlocks }: { day: FilmingDayProps; people: Person[]; blocks: Block[] }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [people, setPeople] = useState(initialPeople);
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);
  useEffect(() => setPeople(initialPeople), [initialPeople]);
  // Edge to edge: measured against the scrolling <main> it sits in, so it
  // meets the sidebar on the left and stops at main's scrollbar on the right.
  const bleedRef = useRef<HTMLDivElement>(null);
  const [bleed, setBleed] = useState<{ ml: number; w: number } | null>(null);
  useEffect(() => {
    const el = bleedRef.current;
    const main = el?.closest("main");
    if (!el?.parentElement || !main) return;
    const set = () => {
      const m = main.getBoundingClientRect();
      const parent = el.parentElement!.getBoundingClientRect();
      setBleed({ ml: m.left + main.clientLeft - parent.left, w: main.clientWidth });
    };
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [focusPerson, setFocusPerson] = useState<string | null>(null);

  const sorted = useMemo(() => [...blocks].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title)), [blocks]);
  const found = useMemo(() => issues(day, blocks), [day, blocks]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // The visible range: building hours with a margin, widened to fit any task outside them.
  const opens = hhmmToMinutes(day.opensAt);
  const closes = hhmmToMinutes(day.closesAt);
  const from = Math.floor(Math.min(opens, ...blocks.map((b) => minuteOfDay(b.start))) / 15) * 15;
  const to = Math.ceil(Math.max(VIEW_UNTIL, closes + 60, ...blocks.map((b) => minuteOfDay(b.end) + 30)) / 60) * 60;
  const span = to - from;
  const pct = (min: number) => `${((min - from) / span) * 100}%`;
  // Every quarter hour: the hour largest, the half hour smaller, :15 and :45 smallest.
  const quarters = Array.from({ length: span / 15 + 1 }, (_, i) => from + i * 15);
  const QUARTER = { 0: "bg-line", 30: "bg-line/50", 15: "bg-line/25", 45: "bg-line/25" } as Record<number, string>;

  // The People box sits over the rows that start before midday-ish, in the
  // 3–5 p.m. columns, pushed right of any label that reaches that far.
  const trayRows = (() => { const i = sorted.findIndex((b) => minuteOfDay(b.start) >= TRAY_ABOVE); return i === -1 ? sorted.length : i; })();
  const chartRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const [labelEdge, setLabelEdge] = useState(0);
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    const left = c.getBoundingClientRect().left;
    let edge = 0;
    for (const b of sorted.slice(0, trayRows)) {
      const el = labelRefs.current.get(b.id);
      if (el) edge = Math.max(edge, Math.round(el.getBoundingClientRect().right - left));
    }
    setLabelEdge((prev) => (prev === edge ? prev : edge));
  });

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
  const drag = useRef<{ id: string; mode: "move" | "start" | "end"; x0: number; width: number; s0: number; e0: number; p0: number; moved: boolean } | null>(null);
  function onBarDown(e: React.PointerEvent<HTMLDivElement>, b: Block) {
    if (b.locked || e.button !== 0) return;
    const track = e.currentTarget.parentElement!.getBoundingClientRect();
    const bar = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bar.left;
    const mode = x < 8 ? "start" : x > bar.width - 8 ? "end" : "move";
    drag.current = { id: b.id, mode, x0: e.clientX, width: track.width, s0: minuteOfDay(b.start), e0: minuteOfDay(b.end), p0: b.prepMinutes, moved: false };
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
      let prep = d.p0;
      if (d.mode === "start" && d.p0 > 0) {
        // The lead-in grows or shrinks; the filming stays put.
        const film = d.s0 + d.p0;
        s = Math.min(d.s0 + dm, film);
        prep = film - s;
      } else if (d.mode === "start") s = Math.min(d.s0 + dm, en - SNAP);
      if (d.mode === "end") en = Math.max(d.e0 + dm, s + prep + SNAP);
      s = Math.max(0, s); en = Math.min(24 * 60 - 1, en);
      return { ...b, start: atMinute(day.date, s), end: atMinute(day.date, en), prepMinutes: prep };
    }));
  }
  function onBarUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const b = blocks.find((x) => x.id === d.id);
    if (b) run(() => updateFilmingBlock(b.id, payload(b)));
  }

  // ── dragging people: from the box onto a task (adds), from one task to
  // another (moves), from a task back into the box (takes them off) ─────
  type Drag = { id: string; from?: string; role?: "people" | "facilitators" };
  const startDrag = (e: React.DragEvent, d: Drag) => {
    e.stopPropagation();
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(d));
    e.dataTransfer.effectAllowed = "move";
  };
  const readDrag = (e: React.DragEvent): Drag | null => {
    try { return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Drag; } catch { return null; }
  };
  const takeOff = (d: Drag) => {
    const src = d.from ? blocks.find((x) => x.id === d.from) : null;
    if (src && d.role) saveBlock({ ...src, [d.role]: src[d.role].filter((x) => x !== d.id) });
  };
  function onDrop(e: React.DragEvent, b: Block) {
    e.preventDefault();
    setDropOn(null);
    const d = readDrag(e);
    if (!d || d.from === b.id) return;
    if (!b.people.includes(d.id) && !b.facilitators.includes(d.id)) {
      if (asFacilitator(b)) saveBlock({ ...b, facilitators: [...b.facilitators, d.id] });
      else saveBlock({ ...b, people: [...b.people, d.id] });
    }
    takeOff(d);
  }
  const asFacilitator = (b: Block) => b.kind === "interview" && b.people.length > 0;
  const acceptsPerson = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

  function addTask() {
    run(() => addFilmingBlock(day.id, {
      kind: "logistics", title: "New task", notes: "", prepMinutes: 0, locked: false, flexible: false, people: [], facilitators: [],
      start: atMinute(day.date, opens), end: atMinute(day.date, opens + 30),
    }).then((r) => { if (r.ok && r.id) setEditing(r.id); return r; }), true);
  }

  const tasksOf = (personId: string) => blocks.filter((b) => b.people.includes(personId) || b.facilitators.includes(personId)).length;

  return (
    <div className="space-y-4">
      {/* The day: where, when the doors are open, and the standing rule. */}
      <section className="rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-fg">{day.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg">
              <span className="text-muted">{longDate(day.date)}</span>
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

      {/* Edge to edge: the day needs every pixel of width it can get. */}
      <div
        ref={bleedRef}
        className={`border-y border-line bg-card ${bleed ? "" : "rounded-xl border-x"}`}
        style={bleed ? { marginLeft: bleed.ml, width: bleed.w } : undefined}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[11.5px] text-muted">
            Drag people from the <strong className="text-fg">People</strong> box onto a task, from one task to another to move them, or back into the box to take them off.
          </span>
          <button type="button" className={`${BTN} ml-auto`} onClick={addTask} disabled={pending}><Plus size={13} /> Add task</button>
        </div>
        {(() => {
          const p = people.find((x) => x.id === editingPerson);
          if (!p) return null;
          return (
            <PersonForm
              key={p.id}
              person={p}
              pending={pending}
              onClose={() => setEditingPerson(null)}
              onSave={(v) => { setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...v } : x))); run(() => updateFilmingPerson(p.id, v)); setEditingPerson(null); }}
              onDelete={() => {
                if (!confirm(`Take ${p.name} off the day, and off every task they are on?`)) return;
                setPeople((ps) => ps.filter((x) => x.id !== p.id));
                setBlocks((bs) => bs.map((b) => ({ ...b, people: b.people.filter((x) => x !== p.id), facilitators: b.facilitators.filter((x) => x !== p.id) })));
                run(() => deleteFilmingPerson(p.id));
                setEditingPerson(null);
              }}
            />
          );
        })()}

        {/* The chart: one thin row per task, the whole width is time. */}
        <div className="overflow-x-auto">
          <div ref={chartRef} className="relative min-w-[1100px]">
            {/* Three levels, so neighbouring labels never collide: the hour on
                top, the half hour under it, the quarters smallest at the foot. */}
            <div className="relative h-12 border-b border-line bg-elevated/40">
              {quarters.map((q) => {
                const m = q % 60;
                if (q === to) return null;
                return (
                  <span
                    key={q}
                    className={`absolute whitespace-nowrap tabular-nums leading-none ${q === from ? "pl-1" : "-translate-x-1/2"} ${
                      m === 0 ? "top-1 text-[11.5px] font-semibold text-fg" : m === 30 ? "top-[17px] text-[9.5px] text-muted" : "top-[28px] text-[8px] text-subtle"
                    }`}
                    style={{ left: pct(q) }}
                  >
                    {m === 0 ? clockOf(q).replace(":00", "") : short(q)}
                  </span>
                );
              })}
              {quarters.map((q) => (
                <span key={`t${q}`} className={`absolute bottom-0 w-px ${QUARTER[q % 60]}`} style={{ left: pct(q), height: q % 60 === 0 ? 10 : q % 60 === 30 ? 7 : 4 }} aria-hidden />
              ))}
              {/* Just left of the line, between the half hour and the hour, where no label sits. */}
              <span className="absolute top-[16px] mr-1 rounded bg-rose-500/15 px-1 text-[9px] font-semibold leading-tight text-rose-500" style={{ right: `calc(100% - ${pct(closes)})` }} title="The building closes">closes</span>
            </div>

            {/* People: a box sitting in the day's empty corner — the afternoon
                columns above the midday rows — clear of every label beside it. */}
            <div
              onDragOver={(e) => { if (acceptsPerson(e)) { e.preventDefault(); setDropOn("tray"); } }}
              onDragLeave={() => setDropOn((x) => (x === "tray" ? null : x))}
              onDrop={(e) => { e.preventDefault(); setDropOn(null); const d = readDrag(e); if (d) takeOff(d); }}
              className={`absolute z-20 overflow-y-auto rounded-xl border p-2.5 shadow-lg transition-colors ${
                dropOn === "tray" ? "border-rose-400 bg-rose-500/10" : "border-brand-500/40 bg-card-solid"
              }`}
              style={{
                top: RULER_H + 6,
                left: `max(${pct(TRAY_FROM)}, ${labelEdge + 12}px)`,
                width: `max(15rem, calc(${pct(TRAY_TO)} - max(${pct(TRAY_FROM)}, ${labelEdge + 12}px)))`,
                maxHeight: Math.max(trayRows * ROW_H - 12, 200),
              }}
            >
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">People</p>
              <p className="text-[10.5px] leading-snug text-subtle">{dropOn === "tray" ? "Drop to take them off that task" : "Drag onto a task"}</p>
              {GROUPS.map((g) => {
                const list = people.filter((p) => p.group === g);
                if (!list.length) return null;
                return (
                  <div key={g} className="mt-1.5">
                    <p className="text-[10.5px] font-semibold text-subtle">{GROUP_LABEL[g]}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {list.map((p) => (
                        <span
                          key={p.id}
                          draggable
                          onDragStart={(e) => startDrag(e, { id: p.id })}
                          onMouseEnter={() => setFocusPerson(p.id)}
                          onMouseLeave={() => setFocusPerson(null)}
                          title={`${p.role ? `${p.role} · ` : ""}on ${tasksOf(p.id)} task${tasksOf(p.id) === 1 ? "" : "s"}`}
                          className={`inline-flex cursor-grab items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-[11.5px] font-semibold text-fg active:cursor-grabbing ${
                            editingPerson === p.id ? "border-brand-400 bg-brand-500/10" : "border-line bg-card hover:border-brand-400/60"
                          }`}
                        >
                          {p.name}
                          <span className="text-[10px] font-normal tabular-nums text-subtle">{tasksOf(p.id)}</span>
                          <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditingPerson(editingPerson === p.id ? null : p.id)} className="rounded-full p-0.5 text-subtle hover:text-fg">
                            <Pencil size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 border-t border-line pt-2">
                <AddPerson pending={pending} onAdd={(v) => run(() => addFilmingPerson(day.id, v), true)} />
              </div>
            </div>

            {sorted.map((b, i) => {
              const s = minuteOfDay(b.start), en = minuteOfDay(b.end);
              const t = tone(b.kind);
              const prep = Math.min(b.prepMinutes, en - s);
              const film = s + prep;
              const prepPct = prep > 0 ? (prep / (en - s)) * 100 : 0;
              const focused = focusPerson && (b.people.includes(focusPerson) || b.facilitators.includes(focusPerson));
              const onIt = b.people.map((id) => byId.get(id)).filter((p): p is Person => !!p);
              const facs = b.facilitators.map((id) => byId.get(id)).filter((p): p is Person => !!p);
              const chip = (p: Person, from: "people" | "facilitators") => (
                <span
                  key={`${from}${p.id}`}
                  draggable
                  onDragStart={(e) => startDrag(e, { id: p.id, from: b.id, role: from })}
                  title="Drag to another task to move, or into the People box to take off"
                  className={`group/chip inline-flex cursor-grab items-center rounded-full py-px pl-1.5 pr-0.5 text-[11px] font-medium active:cursor-grabbing ${
                  from === "facilitators" ? "border border-dashed border-line bg-card-solid text-fg" : t.chip
                }`}>
                  {p.name}
                  <button
                    type="button"
                    aria-label={`Take ${p.name} off ${b.title}`}
                    onClick={() => saveBlock({ ...b, [from]: b[from].filter((x) => x !== p.id) })}
                    className="ml-0.5 rounded-full text-subtle opacity-40 hover:text-rose-500 hover:opacity-100 group-hover/chip:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
              return (
                <div key={b.id}>
                  <div
                    className={`relative h-16 border-b border-line/60 transition-colors ${
                      dropOn === b.id ? "bg-brand-500/15" : focused ? "bg-amber-400/10" : i % 2 ? "bg-elevated/20" : ""
                    }`}
                    onDragOver={(e) => { if (acceptsPerson(e)) { e.preventDefault(); setDropOn(b.id); } }}
                    onDragLeave={() => setDropOn((x) => (x === b.id ? null : x))}
                    onDrop={(e) => onDrop(e, b)}
                  >
                    {/* Before the building opens, shaded; quarter-hour lines; the closing line. After closing stays open. */}
                    <div className="absolute inset-y-0 bg-elevated/60" style={{ left: 0, width: pct(opens) }} aria-hidden />
                    {quarters.map((q) => <div key={q} className={`absolute inset-y-0 w-px ${QUARTER[q % 60]}`} style={{ left: pct(q) }} aria-hidden />)}
                    <div className="absolute inset-y-0 w-0.5 bg-rose-500/50" style={{ left: pct(closes) }} aria-hidden />

                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.title}, ${clockOf(s)} to ${clockOf(en)}${b.locked ? ", pinned" : ", drag to move"}`}
                      onPointerDown={(e) => onBarDown(e, b)}
                      onPointerMove={onBarMove}
                      onPointerUp={onBarUp}
                      onPointerCancel={onBarUp}
                      onDoubleClick={() => setEditing(b.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") setEditing(b.id); }}
                      className={`absolute top-2.5 bottom-2.5 flex touch-none select-none overflow-hidden rounded ${
                        b.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                      } ${b.flexible ? "outline-2 outline-dashed outline-offset-1 outline-amber-500" : ""} ${focused ? "ring-2 ring-amber-400" : ""}`}
                      style={{ left: pct(s), width: `calc(${pct(en)} - ${pct(s)})` }}
                      title={`${b.title} · ${clockOf(s)}–${clockOf(en)}${prep ? ` · prep & make-up ${minutes(prep)}, then filming ${minutes(en - film)}` : ""}${b.notes ? `\n${b.notes}` : ""}`}
                    >
                      {prep > 0 && (
                        <div
                          className={`flex h-full shrink-0 flex-col items-center justify-center overflow-hidden text-center leading-tight ${t.prep} text-muted rounded-l`}
                          style={{ width: `${prepPct}%` }}
                          title={`Prep, ${clockOf(s)}–${clockOf(film)} (${minutes(prep)}): get familiar with the script, and make-up.`}
                        >
                          {prep >= 20 && <><span className="text-[9px] font-semibold">Prep</span><span className="text-[8.5px] tabular-nums opacity-80">{minutes(prep)}</span></>}
                        </div>
                      )}
                      <div
                        className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-1 text-center leading-tight ${t.bar} ${t.text}`}
                        title={prep > 0 ? `${ON_CAMERA.has(b.kind) ? "Filming" : b.title}, ${clockOf(film)}–${clockOf(en)} (${minutes(en - film)})${b.notes ? `\n${b.notes}` : ""}` : undefined}
                      >
                        {en - film >= 25 && (
                          <>
                            {ON_CAMERA.has(b.kind) && <span className="whitespace-nowrap text-[9px] font-semibold">Filming</span>}
                            <span className="whitespace-nowrap text-[9px] font-semibold tabular-nums">{compact(film)}–{compact(en)}</span>
                            <span className="whitespace-nowrap text-[8.5px] tabular-nums opacity-85">{minutes(en - film)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* What and who, always to the right of the bar. */}
                    <div
                      ref={(el) => { if (el) labelRefs.current.set(b.id, el); else labelRefs.current.delete(b.id); }}
                      className="absolute top-0 flex h-full max-w-[34rem] flex-col justify-center gap-0.5 pl-2"
                      style={{ left: pct(en) }}
                    >
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <button type="button" onClick={() => setEditing(editing === b.id ? null : b.id)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg hover:underline">
                          {b.locked && <Lock size={10} className="text-subtle" aria-label="Pinned" />}
                          {b.title}
                        </button>
                        {/* Short bars cannot hold their times, so they sit here. */}
                        {en - film < 25 && <span className="text-[10.5px] tabular-nums text-subtle">{clockOf(s)}–{clockOf(en)}</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-1">
                        {onIt.map((p) => chip(p, "people"))}
                        {facs.length > 0 && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">Facilitator{facs.length > 1 ? "s" : ""}</span>}
                        {facs.map((p) => chip(p, "facilitators"))}
                        {onIt.length + facs.length === 0 && <span className="text-[11px] italic text-amber-600">drop someone here</span>}
                        {b.kind === "interview" && onIt.length > 0 && facs.length === 0 && <span className="text-[11px] italic text-amber-600">drop a facilitator here</span>}
                      </span>
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
        <p className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-1.5 text-[11px] leading-snug text-subtle">
          {KINDS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1"><span className={`inline-block h-2.5 w-4 rounded-sm ${tone(k).bar}`} /> {KIND_LABEL[k]}</span>
          ))}
          <span>· Drag a bar to move it, its right end to change its length, an interview's left end to change its prep (5 min steps) · lighter lead-in: prep — the script and make-up · dashed outline: time not fixed · <Lock size={10} className="inline" /> pinned · dashed chip: facilitator · click a task's name to edit it</span>
        </p>
      </div>
      <div className="h-[70vh]" aria-hidden />
    </div>
  );
}

function IssueList({ issues: list }: { issues: Issue[] }) {
  if (!list.length) {
    return <p className="text-[12.5px] font-semibold text-emerald-600">All clear: one thing filmed at a time, every task has somebody on it, and every interview has a facilitator.</p>;
  }
  const say = (i: Issue) => {
    switch (i.kind) {
      case "camera": return <><strong>Filmed at the same time:</strong> {i.a.title} and {i.b.title}.</>;
      case "early": return <><strong>{i.block.title}</strong> starts before the building opens.</>;
      case "nobody": return <><strong>{i.block.title}</strong> has nobody on it.</>;
      case "facilitator": return <><strong>{i.block.title}</strong> has no facilitator.</>;
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
      <label className="text-[11px] text-muted sm:col-span-2">Prep & make-up first (minutes)
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

function PersonForm({ person, pending, onSave, onDelete, onClose }: {
  person: Person; pending: boolean; onSave: (v: Omit<Person, "id">) => void; onDelete: () => void; onClose: () => void;
}) {
  const [f, setF] = useState({ name: person.name, group: person.group, role: person.role, email: person.email });
  return (
    <form className="flex flex-wrap items-end gap-2 border-b border-line bg-elevated/40 px-3 py-2" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <label className="w-40 text-[11px] text-muted">Name<input id={`p-name-${person.id}`} className={INPUT} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></label>
      <label className="w-36 text-[11px] text-muted">Group
        <select id={`p-group-${person.id}`} className={INPUT} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>
          {GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
        </select>
      </label>
      <label className="min-w-[14rem] flex-1 text-[11px] text-muted">Role on the day<input id={`p-role-${person.id}`} className={INPUT} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} maxLength={200} /></label>
      <label className="w-56 text-[11px] text-muted">Email (optional)<input id={`p-email-${person.id}`} className={INPUT} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} /></label>
      <span className="flex gap-1.5">
        <button type="button" className={`${BTN} text-rose-600`} onClick={onDelete} disabled={pending}><Trash2 size={11} /> Remove</button>
        <button type="button" className={BTN} onClick={onClose}>Cancel</button>
        <button type="submit" className={`${BTN} border-brand-500 bg-brand-600 text-white hover:bg-brand-700`} disabled={pending}>Save</button>
      </span>
    </form>
  );
}

function AddPerson({ pending, onAdd }: { pending: boolean; onAdd: (v: Omit<Person, "id">) => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>("team");
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onAdd({ name: name.trim(), group, role: "", email: "" }); setName(""); }}
    >
      <input id="filming-add-person" aria-label="Add a person" placeholder="Add a person" className={`${INPUT} w-32 py-0.5`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <select id="filming-add-group" aria-label="Group" className={`${INPUT} w-auto py-0.5`} value={group} onChange={(e) => setGroup(e.target.value)}>
        {GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
      </select>
      <button type="submit" aria-label="Add" className={`${BTN} py-0.5`} disabled={pending || !name.trim()}><Plus size={12} /></button>
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
