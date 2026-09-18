"use client";

/**
 * Edit one call sheet. Everything is local until Save; leaving with unsaved
 * changes asks first. Print opens the sheet on its own in a new window —
 * printing this page would print the app around it.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Copy, Loader2, Plus, Printer, Save, Trash2,
} from "lucide-react";
import {
  blankPerson, blankScheduleRow, GROUP_LABEL, PERSON_GROUPS,
  type CallSheetData, type CallSheetInput, type Person, type PersonGroup, type ScheduleRow,
} from "@/lib/video/call-sheet";
import {
  deleteCallSheet, duplicateCallSheet, updateCallSheet,
} from "@/app/(dashboard)/admin/workspace/marketing/video/call-sheets/actions";
import { fmtShootDate } from "./CallSheetList";

const LIST = "/admin/workspace/marketing/video/call-sheets";
const INPUT =
  "w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const CELL = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-fg hover:border-line focus:border-line focus:bg-card-solid focus:outline-none";
const ICON = "inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-elevated hover:text-fg disabled:opacity-30";

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card-solid">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-[14px] font-bold text-fg">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function CallSheetEditor({ id, initial, updatedAt }: { id: string; initial: CallSheetInput; updatedAt: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<CallSheetInput>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const printRef = useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(sheet) !== savedJson;
  const d = sheet.data;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setData = (patch: Partial<CallSheetData>) => setSheet((s) => ({ ...s, data: { ...s.data, ...patch } }));
  const setPerson = (i: number, patch: Partial<Person>) =>
    setData({ people: d.people.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const setRow = (i: number, patch: Partial<ScheduleRow>) =>
    setData({ schedule: d.schedule.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  function save() {
    setError(null);
    start(async () => {
      const r = await updateCallSheet(id, sheet);
      if (!r.ok) { setError(r.error); return; }
      setSavedJson(JSON.stringify(sheet));
      setSavedAt(new Date().toISOString());
      router.refresh();
    });
  }
  function duplicate() {
    if (dirty && !confirm("Duplicate the last saved version? Your unsaved changes are not included.")) return;
    start(async () => {
      const r = await duplicateCallSheet(id);
      if (r.ok) router.push(`${LIST}/${r.id}`); else setError(r.error);
    });
  }
  function remove() {
    if (!confirm(`Delete “${sheet.title}”? This can't be undone.`)) return;
    start(async () => {
      await deleteCallSheet(id);
      setSavedJson(JSON.stringify(sheet)); // nothing left to warn about
      router.push(LIST);
    });
  }
  function print() {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w || !printRef.current) return;
    w.document.head.innerHTML = `<meta charset="utf-8"><title></title><style>${PRINT_CSS}</style>`;
    w.document.title = sheet.title;
    w.document.body.innerHTML = printRef.current.innerHTML;
    w.focus();
    w.print();
  }

  // People grouped in a fixed order for the printout.
  const grouped = PERSON_GROUPS.map((g) => ({ g, rows: d.people.filter((p) => p.group === g) })).filter((x) => x.rows.length);

  return (
    <div className="max-w-5xl space-y-4 pb-24">
      {/* Sheet header */}
      <Section title="Shoot day">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Title" className="sm:col-span-2">
            <input className={INPUT} value={sheet.title} onChange={(e) => setSheet({ ...sheet, title: e.target.value })} />
          </Field>
          <Field label="Shoot date">
            <input type="date" className={INPUT} value={sheet.shootDate} onChange={(e) => setSheet({ ...sheet, shootDate: e.target.value })} />
          </Field>
          <Field label="Day">
            <input className={INPUT} value={d.dayLabel} placeholder="Day 1 of 1" onChange={(e) => setData({ dayLabel: e.target.value })} />
          </Field>
          <Field label="Production" className="sm:col-span-2">
            <input className={INPUT} value={d.production} onChange={(e) => setData({ production: e.target.value })} />
          </Field>
          <Field label="General crew call">
            <input type="time" className={INPUT} value={d.generalCall} onChange={(e) => setData({ generalCall: e.target.value })} />
          </Field>
          <Field label="Estimated wrap">
            <input type="time" className={INPUT} value={d.wrap} onChange={(e) => setData({ wrap: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Location & logistics">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Location">
            <input className={INPUT} value={d.locationName} onChange={(e) => setData({ locationName: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className={INPUT} value={d.locationAddress} onChange={(e) => setData({ locationAddress: e.target.value })} />
          </Field>
          {([
            ["locationNotes", "Location notes"],
            ["parking", "Parking"],
            ["meals", "Meals"],
            ["hospital", "Nearest hospital"],
            ["weather", "Weather"],
            ["equipment", "Equipment"],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea rows={key === "equipment" ? 4 : 3} className={INPUT} value={d[key]} onChange={(e) => setData({ [key]: e.target.value } as Partial<CallSheetData>)} />
            </Field>
          ))}
        </div>
      </Section>

      <Section
        title={`People (${d.people.length})`}
        action={
          <button type="button" onClick={() => setData({ people: [...d.people, blankPerson()] })} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:text-brand-900">
            <Plus size={13} /> Add person
          </button>
        }
      >
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="border-b border-line text-[10.5px] font-bold uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Group</th>
                <th className="w-[90px] px-3 py-2">Call</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Notes</th><th className="w-[96px] px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {d.people.map((p, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="px-2 py-1"><input aria-label="Name" className={CELL} value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Role" className={CELL} value={p.role} onChange={(e) => setPerson(i, { role: e.target.value })} /></td>
                  <td className="px-2 py-1">
                    <select aria-label="Group" className={CELL} value={p.group} onChange={(e) => setPerson(i, { group: e.target.value as PersonGroup })}>
                      {PERSON_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1"><input aria-label="Call time" type="time" className={CELL} value={p.call} onChange={(e) => setPerson(i, { call: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Phone" type="tel" className={CELL} value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Email" type="email" className={CELL} value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Notes" className={CELL} value={p.notes} onChange={(e) => setPerson(i, { notes: e.target.value })} /></td>
                  <td className="whitespace-nowrap px-2 py-1">
                    <button type="button" className={ICON} title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => setData({ people: move(d.people, i, -1) })}><ArrowUp size={13} /></button>
                    <button type="button" className={ICON} title="Move down" aria-label="Move down" disabled={i === d.people.length - 1} onClick={() => setData({ people: move(d.people, i, 1) })}><ArrowDown size={13} /></button>
                    <button type="button" className={`${ICON} hover:text-rose-600`} title="Remove" aria-label={`Remove ${p.name || "person"}`} onClick={() => setData({ people: d.people.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={`Schedule (${d.schedule.length})`}
        action={
          <button type="button" onClick={() => setData({ schedule: [...d.schedule, blankScheduleRow()] })} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:text-brand-900">
            <Plus size={13} /> Add row
          </button>
        }
      >
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-line text-[10.5px] font-bold uppercase tracking-wider text-subtle">
              <tr>
                <th className="w-[90px] px-3 py-2">From</th><th className="w-[90px] px-3 py-2">To</th><th className="px-3 py-2">What</th>
                <th className="px-3 py-2">Who</th><th className="px-3 py-2">Notes</th><th className="w-[96px] px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {d.schedule.map((r, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="px-2 py-1"><input aria-label="From" type="time" className={CELL} value={r.time} onChange={(e) => setRow(i, { time: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="To" type="time" className={CELL} value={r.end} onChange={(e) => setRow(i, { end: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="What" className={CELL} value={r.item} onChange={(e) => setRow(i, { item: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Who" className={CELL} value={r.who} onChange={(e) => setRow(i, { who: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Notes" className={CELL} value={r.notes} onChange={(e) => setRow(i, { notes: e.target.value })} /></td>
                  <td className="whitespace-nowrap px-2 py-1">
                    <button type="button" className={ICON} title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => setData({ schedule: move(d.schedule, i, -1) })}><ArrowUp size={13} /></button>
                    <button type="button" className={ICON} title="Move down" aria-label="Move down" disabled={i === d.schedule.length - 1} onClick={() => setData({ schedule: move(d.schedule, i, 1) })}><ArrowDown size={13} /></button>
                    <button type="button" className={`${ICON} hover:text-rose-600`} title="Remove" aria-label="Remove row" onClick={() => setData({ schedule: d.schedule.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Notes">
        <textarea rows={5} className={INPUT} value={d.notes} onChange={(e) => setData({ notes: e.target.value })} />
      </Section>

      {/* Action bar */}
      <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-card-solid/95 px-3 py-2 shadow-elevated backdrop-blur">
        <span className={`px-1.5 text-[12px] ${error ? "text-rose-600" : dirty ? "font-medium text-amber-700" : "text-muted"}`}>
          {error ?? (dirty ? "Unsaved changes" : `Saved ${new Date(savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`)}
        </span>
        <button type="button" onClick={save} disabled={pending || !dirty} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
        <button type="button" onClick={print} title="Print" aria-label="Print" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-fg"><Printer size={15} /></button>
        <button type="button" onClick={duplicate} disabled={pending} title="Duplicate" aria-label="Duplicate" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-fg"><Copy size={15} /></button>
        <button type="button" onClick={remove} disabled={pending} title="Delete" aria-label="Delete" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-rose-500/10 hover:text-rose-600"><Trash2 size={15} /></button>
      </div>

      {/* The printable sheet — never shown here, copied into the print window. */}
      <div ref={printRef} hidden>
        <div className="sheet">
          <header>
            <div className="eyebrow">Call sheet · {d.dayLabel}</div>
            <h1>{sheet.title}</h1>
            <div className="sub">{d.production}</div>
            <table className="facts"><tbody><tr>
              <td><b>Date</b>{fmtShootDate(sheet.shootDate)}</td>
              <td><b>General call</b>{d.generalCall || "—"}</td>
              <td><b>Est. wrap</b>{d.wrap || "—"}</td>
              <td><b>Location</b>{d.locationName}{d.locationAddress ? `, ${d.locationAddress}` : ""}</td>
            </tr></tbody></table>
          </header>

          <h2>Schedule</h2>
          <table className="grid">
            <thead><tr><th>Time</th><th>What</th><th>Who</th><th>Notes</th></tr></thead>
            <tbody>
              {d.schedule.map((r, i) => (
                <tr key={i}><td className="nowrap">{r.time}{r.end ? `–${r.end}` : ""}</td><td>{r.item}</td><td>{r.who}</td><td>{r.notes}</td></tr>
              ))}
            </tbody>
          </table>

          <h2>People</h2>
          <table className="grid">
            <thead><tr><th>Call</th><th>Name</th><th>Role</th><th>Contact</th><th>Notes</th></tr></thead>
            {grouped.map(({ g, rows }) => (
              <tbody key={g}>
                <tr className="group"><td colSpan={5}>{GROUP_LABEL[g]}</td></tr>
                {rows.map((p, i) => (
                  <tr key={i}><td className="nowrap">{p.call}</td><td>{p.name}</td><td>{p.role}</td><td>{[p.phone, p.email].filter(Boolean).join(" · ")}</td><td>{p.notes}</td></tr>
                ))}
              </tbody>
            ))}
          </table>

          <div className="logistics">
            {([
              ["Location notes", d.locationNotes], ["Parking", d.parking], ["Meals", d.meals],
              ["Nearest hospital", d.hospital], ["Weather", d.weather], ["Equipment", d.equipment], ["Notes", d.notes],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><h3>{k}</h3><p>{v}</p></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PRINT_CSS = `
@page { size: letter; margin: 12mm; }
* { box-sizing: border-box; }
body { font: 10.5px/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
.eyebrow { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #555; }
h1 { font-size: 20px; margin: 2px 0 0; }
.sub { color: #444; margin-bottom: 8px; }
h2 { font-size: 12px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .06em; }
h3 { font-size: 10px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .06em; color: #444; }
p { margin: 0; white-space: pre-line; }
table { width: 100%; border-collapse: collapse; }
.facts td { border: 1px solid #999; padding: 5px 7px; vertical-align: top; }
.facts b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
.grid th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1.5px solid #111; padding: 3px 5px; }
.grid td { border-bottom: 1px solid #ccc; padding: 3px 5px; vertical-align: top; }
.grid .group td { background: #eee; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
.nowrap { white-space: nowrap; }
.logistics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-top: 14px; }
tr, .logistics > div { break-inside: avoid; }
`;
