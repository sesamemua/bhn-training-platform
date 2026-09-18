"use client";

/**
 * Edit one call sheet — laid out like the paper one, edited in place.
 *
 * The sheet renders twice from the same component: editable on the page,
 * read-only (hidden) for Print, which copies it into a window of its own —
 * printing this page would print the app around it. Its look is plain CSS
 * (SHEET_CSS) rather than Tailwind so the print window, which has no app
 * stylesheet, gets exactly what is on screen.
 *
 * Everything is local until Save; leaving with unsaved changes asks first.
 */
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Loader2, Plus, Printer, Save, Trash2, X } from "lucide-react";
import {
  blankPerson, blankScheduleRow, GROUP_LABEL, SHEET_GROUPS,
  type CallSheetData, type CallSheetInput, type Person, type PersonGroup, type ScheduleRow,
} from "@/lib/video/call-sheet";
import {
  deleteCallSheet, duplicateCallSheet, updateCallSheet,
} from "@/app/(dashboard)/admin/workspace/marketing/video/call-sheets/actions";
import { fmtShootDate } from "./CallSheetList";

const LIST = "/admin/workspace/marketing/video/call-sheets";

function move<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── Cells ──────────────────────────────────────────────────────────────────

/** A text box that wraps and grows with its content — never scrolls sideways. */
function AutoText({ value, onChange, label, placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      className={`cs-in ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

type Edit = ((v: string) => void) | null;

/** Editable text on screen, plain text in the printout. */
function T({ v, on, label, ph, className }: { v: string; on: Edit; label: string; ph?: string; className?: string }) {
  if (!on) return v ? <span className={`cs-txt ${className ?? ""}`}>{v}</span> : null;
  return <AutoText value={v} onChange={on} label={label} placeholder={ph} className={className} />;
}

/**
 * A time as a call sheet writes it — "08:00" — in a plain text box. The
 * browser's time picker renders 12-hour with a clock icon at its own size
 * and spills out of a narrow column.
 */
function Time({ v, on, label, className }: { v: string; on: Edit; label: string; className?: string }) {
  if (!on) return <span className={`cs-txt ${className ?? ""}`}>{v || "—"}</span>;
  return (
    <input type="text" inputMode="numeric" placeholder="00:00" maxLength={8} aria-label={label}
      className={`cs-in cs-time ${className ?? ""}`} value={v} onChange={(e) => on(e.target.value)} />
  );
}

function RowCtl({ onUp, onDown, onRemove, first, last, extra }: {
  onUp: () => void; onDown: () => void; onRemove: () => void; first: boolean; last: boolean; extra?: React.ReactNode;
}) {
  return (
    <td className="cs-ctl">
      <div>
        {extra}
        <button type="button" title="Move up" aria-label="Move up" disabled={first} onClick={onUp}><ArrowUp size={12} /></button>
        <button type="button" title="Move down" aria-label="Move down" disabled={last} onClick={onDown}><ArrowDown size={12} /></button>
        <button type="button" title="Remove" aria-label="Remove row" className="cs-del" onClick={onRemove}><X size={12} /></button>
      </div>
    </td>
  );
}

// ── The sheet ──────────────────────────────────────────────────────────────

interface Ops {
  setSheet: (patch: Partial<CallSheetInput>) => void;
  setData: (patch: Partial<CallSheetData>) => void;
  setPerson: (i: number, patch: Partial<Person>) => void;
  addPerson: (g: PersonGroup) => void;
  removePerson: (i: number) => void;
  movePerson: (i: number, dir: -1 | 1) => void;
  setRow: (i: number, patch: Partial<ScheduleRow>) => void;
  addRow: () => void;
  removeRow: (i: number) => void;
  moveRow: (i: number, dir: -1 | 1) => void;
}

type SheetGroup = (typeof SHEET_GROUPS)[number];

const PEOPLE_COLS: Record<SheetGroup, { key: keyof Person; head: string; w?: string }[]> = {
  // Percentages leave Notes (the auto column) a real share of the width.
  talent: [
    { key: "name", head: "Name", w: "18%" }, { key: "role", head: "Role" },
    { key: "call", head: "Call", w: "64px" }, { key: "notes", head: "Notes", w: "30%" },
  ],
  crew: [
    { key: "role", head: "Position", w: "20%" }, { key: "name", head: "Name", w: "15%" }, { key: "call", head: "Call", w: "64px" },
    { key: "phone", head: "Phone", w: "12%" }, { key: "email", head: "Email", w: "18%" }, { key: "notes", head: "Notes" },
  ],
  team: [
    { key: "name", head: "Name", w: "14%" }, { key: "role", head: "Role", w: "21%" }, { key: "call", head: "Call", w: "64px" },
    { key: "phone", head: "Phone", w: "11%" }, { key: "email", head: "Email", w: "19%" }, { key: "notes", head: "Notes" },
  ],
};
const PEOPLE_TITLE: Record<SheetGroup, string> = { talent: "On camera", crew: "Crew", team: "BHN team" };
// No vendors table: contracts and rentals stay on Production cost, off the
// sheet the crew and the people on camera receive.

function SheetView({ sheet, ops }: { sheet: CallSheetInput; ops: Ops | null }) {
  const d = sheet.data;
  const edit = <K extends keyof CallSheetData>(k: K): Edit => (ops ? (v) => ops.setData({ [k]: v } as Partial<CallSheetData>) : null);
  const people = d.people.map((p, i) => ({ p, i }));
  const byRole = (role: RegExp) => d.people.find((p) => role.test(p.role));
  const contacts = [
    // "Director" alone would catch the Scientific Directors.
    ["Producer & director", byRole(/producer/i)],
    ["Sound & lighting", byRole(/sound|lighting/i)],
  ] as const;

  return (
    <div className="cs-page">
      {/* ── Logos: U of T signature (always on white) and the BioHubNet lockup ── */}
      <div className="cs-logos">
        {/* eslint-disable-next-line @next/next/no-img-element -- copied into the print window, which has no Next image loader */}
        <img src="/uoft-logo.png" alt="University of Toronto" className="cs-logo-uoft" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/biohubnet-logo.png" alt="BioHubNet" className="cs-logo-bhn" />
        <div className="cs-logos-label">Call sheet</div>
      </div>
      {/* ── Header: contacts · title + general call · date & safety ── */}
      <div className="cs-head">
        <div className="cs-box">
          <div className="cs-lbl">Production contacts</div>
          {contacts.map(([label, p]) => (
            <div key={label} className="cs-contact">
              <div className="cs-mini">{label}</div>
              <div className="cs-strong">{p?.name || "—"}</div>
              {p && [p.phone, p.email].filter(Boolean).map((x) => <div key={x}>{x}</div>)}
            </div>
          ))}
        </div>

        <div className="cs-box cs-center">
          <T v={sheet.title} on={ops ? (v) => ops.setSheet({ title: v }) : null} label="Title" className="cs-title" />
          <T v={d.production} on={edit("production")} label="Production" ph="Production" className="cs-sub" />
          <div className="cs-callbox">
            <div className="cs-lbl">General crew call</div>
            <Time v={d.generalCall} on={edit("generalCall")} label="General crew call" className="cs-bigtime" />
          </div>
          <div className="cs-wrapline">
            <span className="cs-mini">Est. wrap</span> <Time v={d.wrap} on={edit("wrap")} label="Estimated wrap" />
          </div>
        </div>

        <div className="cs-box">
          <div className="cs-lbl">Date</div>
          {ops
            ? <input type="date" aria-label="Shoot date" className="cs-in cs-strong" value={sheet.shootDate} onChange={(e) => ops.setSheet({ shootDate: e.target.value })} />
            : <div className="cs-strong">{fmtShootDate(sheet.shootDate)}</div>}
          <T v={d.dayLabel} on={edit("dayLabel")} label="Day" ph="Day 1 of 1" className="cs-day" />
          <div className="cs-lbl cs-gap">Weather</div>
          <T v={d.weather} on={edit("weather")} label="Weather" ph="Forecast" />
          <div className="cs-lbl cs-gap">Nearest hospital</div>
          <T v={d.hospital} on={edit("hospital")} label="Nearest hospital" />
        </div>
      </div>

      {/* ── Location · parking · meals ── */}
      <div className="cs-row3">
        <div className="cs-box">
          <div className="cs-lbl">Location</div>
          <T v={d.locationName} on={edit("locationName")} label="Location" className="cs-strong" />
          <T v={d.locationAddress} on={edit("locationAddress")} label="Address" ph="Address" />
          <T v={d.locationNotes} on={edit("locationNotes")} label="Location notes" ph="Notes" className="cs-note" />
        </div>
        <div className="cs-box">
          <div className="cs-lbl">Parking</div>
          <T v={d.parking} on={edit("parking")} label="Parking" />
        </div>
        <div className="cs-box">
          <div className="cs-lbl">Meals</div>
          <T v={d.meals} on={edit("meals")} label="Meals" />
        </div>
      </div>

      {/* ── Schedule ── */}
      <table className="cs-table">
        <caption>Schedule</caption>
        <colgroup><col style={{ width: "112px" }} /><col /><col style={{ width: "22%" }} /><col style={{ width: "24%" }} />{ops && <col className="cs-ctlcol" />}</colgroup>
        <thead><tr><th>Time</th><th>What</th><th>Who</th><th>Notes</th>{ops && <th />}</tr></thead>
        <tbody>
          {d.schedule.map((r, i) => (
            <tr key={i}>
              <td className="cs-times">
                <Time v={r.time} on={ops ? (v) => ops.setRow(i, { time: v }) : null} label="From" />
                <span className="cs-dash">–</span>
                <Time v={r.end} on={ops ? (v) => ops.setRow(i, { end: v }) : null} label="To" />
              </td>
              <td><T v={r.item} on={ops ? (v) => ops.setRow(i, { item: v }) : null} label="What" className="cs-strongish" /></td>
              <td><T v={r.who} on={ops ? (v) => ops.setRow(i, { who: v }) : null} label="Who" /></td>
              <td><T v={r.notes} on={ops ? (v) => ops.setRow(i, { notes: v }) : null} label="Notes" /></td>
              {ops && (
                <RowCtl first={i === 0} last={i === d.schedule.length - 1}
                  onUp={() => ops.moveRow(i, -1)} onDown={() => ops.moveRow(i, 1)} onRemove={() => ops.removeRow(i)} />
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {ops && <button type="button" className="cs-add" onClick={ops.addRow}><Plus size={12} /> Add schedule row</button>}

      {/* ── People, by group ── */}
      {SHEET_GROUPS.map((g) => {
        const rows = people.filter(({ p }) => p.group === g);
        if (!ops && rows.length === 0) return null;
        const cols = PEOPLE_COLS[g];
        return (
          <div key={g}>
            <table className="cs-table">
              <caption>{PEOPLE_TITLE[g]}</caption>
              <colgroup>
                {g === "talent" && <col style={{ width: "34px" }} />}
                {cols.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
                {ops && <col className="cs-ctlcol" />}
              </colgroup>
              <thead>
                <tr>{g === "talent" && <th>#</th>}{cols.map((c) => <th key={c.key}>{c.head}</th>)}{ops && <th />}</tr>
              </thead>
              <tbody>
                {rows.map(({ p, i }, k) => (
                  <tr key={i}>
                    {g === "talent" && <td className="cs-num">{k + 1}</td>}
                    {cols.map((c) => (
                      <td key={c.key}>
                        {c.key === "call"
                          ? <Time v={p.call} on={ops ? (v) => ops.setPerson(i, { call: v }) : null} label="Call time" className="cs-strong" />
                          : <T v={p[c.key] as string} on={ops ? (v) => ops.setPerson(i, { [c.key]: v } as Partial<Person>) : null}
                              label={c.head} className={c.key === "name" ? "cs-strongish" : undefined} />}
                      </td>
                    ))}
                    {ops && (
                      <RowCtl first={k === 0} last={k === rows.length - 1}
                        onUp={() => ops.movePerson(i, -1)} onDown={() => ops.movePerson(i, 1)} onRemove={() => ops.removePerson(i)}
                        extra={
                          <select aria-label="Move to group" title="Move to another table" value={p.group}
                            onChange={(e) => ops.setPerson(i, { group: e.target.value as PersonGroup })}>
                            {SHEET_GROUPS.map((x) => <option key={x} value={x}>{GROUP_LABEL[x]}</option>)}
                          </select>
                        } />
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {ops && <button type="button" className="cs-add" onClick={() => ops.addPerson(g)}><Plus size={12} /> Add to {PEOPLE_TITLE[g].toLowerCase()}</button>}
          </div>
        );
      })}

      {/* ── Notes ── */}
      <div className="cs-notes cs-box">
        <div className="cs-lbl">Notes &amp; safety</div>
        <T v={d.notes} on={edit("notes")} label="Notes" />
      </div>
    </div>
  );
}

// ── The page ───────────────────────────────────────────────────────────────

export function CallSheetEditor({ id, initial, updatedAt }: { id: string; initial: CallSheetInput; updatedAt: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<CallSheetInput>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const printRef = useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(sheet) !== savedJson;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const mapPeople = (f: (p: Person[]) => Person[]) => setSheet((s) => ({ ...s, data: { ...s.data, people: f(s.data.people) } }));
  const mapRows = (f: (r: ScheduleRow[]) => ScheduleRow[]) => setSheet((s) => ({ ...s, data: { ...s.data, schedule: f(s.data.schedule) } }));

  const ops: Ops = {
    setSheet: (patch) => setSheet((s) => ({ ...s, ...patch })),
    setData: (patch) => setSheet((s) => ({ ...s, data: { ...s.data, ...patch } })),
    setPerson: (i, patch) => mapPeople((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p))),
    addPerson: (g) => mapPeople((ps) => [...ps, blankPerson(g)]),
    removePerson: (i) => mapPeople((ps) => ps.filter((_, k) => k !== i)),
    // Each table shows one group, so "up" means past the previous person IN
    // THAT GROUP, however far away they sit in the full list.
    movePerson: (i, dir) => mapPeople((ps) => {
      const g = ps[i].group;
      let j = i + dir;
      while (j >= 0 && j < ps.length && ps[j].group !== g) j += dir;
      return move(ps, i, j);
    }),
    setRow: (i, patch) => mapRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r))),
    addRow: () => mapRows((rs) => [...rs, blankScheduleRow()]),
    removeRow: (i) => mapRows((rs) => rs.filter((_, k) => k !== i)),
    moveRow: (i, dir) => mapRows((rs) => move(rs, i, i + dir)),
  };

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
    const w = window.open("", "_blank", "width=1000,height=1200");
    if (!w || !printRef.current) return;
    w.document.head.innerHTML = `<meta charset="utf-8"><base href="${window.location.origin}/"><title></title><style>${SHEET_CSS}${PRINT_CSS}</style>`;
    w.document.title = sheet.title;
    w.document.body.innerHTML = printRef.current.innerHTML;
    // Print once the logos are in, or they come out as blank boxes.
    const imgs = Array.from(w.document.images);
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))).then(() => {
      w.focus();
      w.print();
    });
  }

  return (
    <div className="pb-24">
      <style>{SHEET_CSS}</style>
      <div className="overflow-x-auto">
        <SheetView sheet={sheet} ops={ops} />
      </div>

      {/* The printout: the same sheet, read-only, copied into the print window. */}
      <div ref={printRef} hidden><SheetView sheet={sheet} ops={null} /></div>

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
    </div>
  );
}

// A call sheet is a paper document: white page, black rules, in either app
// theme. Scoped by the cs- prefix; shared with the print window.
const SHEET_CSS = `
.cs-page { width: 100%; min-width: 820px; max-width: 1060px; background: #fff; color: #111; border: 2px solid #111;
  font: 12.5px/1.4 Arial, "Helvetica Neue", Helvetica, sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.cs-page * { box-sizing: border-box; }
/* The edit boxes first: the type classes below must win over their font: inherit. */
.cs-in { display: block; border: 1px solid transparent; border-radius: 3px; background: transparent; color: inherit;
  font: inherit; padding: 1px 3px; margin: 0 -4px; width: calc(100% + 8px); resize: none; overflow: hidden; }
.cs-in:hover { border-color: #d0d0d0; background: #fafafa; }
.cs-in:focus { outline: none; border-color: #2563eb; background: #fff; box-shadow: 0 0 0 2px rgba(37,99,235,.18); }
.cs-in::placeholder { color: #aaa; }
.cs-lbl { font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #555; margin-bottom: 3px; }
.cs-mini { font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: #666; }
.cs-gap { margin-top: 8px; }
.cs-strong { font-weight: 700; }
.cs-strongish { font-weight: 600; }
.cs-note { color: #444; font-size: 11.5px; }
.cs-txt { display: block; white-space: pre-line; }
.cs-box { padding: 8px 10px; min-width: 0; }
.cs-logos { display: flex; align-items: center; gap: 22px; padding: 10px 14px; border-bottom: 2px solid #111; background: #fff; }
.cs-logo-uoft { height: 40px; width: auto; }
.cs-logo-bhn { height: 34px; width: auto; }
.cs-logos-label { margin-left: auto; font-size: 22px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.cs-notes { border-top: 2px solid #111; }
.cs-head { display: grid; grid-template-columns: 1fr 1.35fr 1fr; border-bottom: 2px solid #111; }
.cs-head > .cs-box + .cs-box { border-left: 1px solid #111; }
.cs-contact + .cs-contact { margin-top: 8px; }
.cs-center { text-align: center; display: flex; flex-direction: column; align-items: center; }
.cs-center .cs-in, .cs-center .cs-txt { text-align: center; }
.cs-title { font-size: 20px; font-weight: 800; letter-spacing: .01em; text-transform: uppercase; line-height: 1.15; }
.cs-sub { font-size: 12px; color: #333; }
.cs-callbox { margin-top: 8px; border: 2px solid #111; padding: 4px 18px 6px; min-width: 170px; }
.cs-callbox .cs-lbl { color: #111; margin: 0; }
.cs-callbox .cs-time { margin: 0 auto; }
.cs-bigtime { font-size: 28px; font-weight: 800; line-height: 1.1; }
.cs-wrapline { margin-top: 5px; display: flex; gap: 6px; align-items: baseline; justify-content: center; }
.cs-day { font-size: 11.5px; color: #333; }
.cs-row3 { display: grid; grid-template-columns: 1.2fr 1fr 1fr; border-bottom: 2px solid #111; }
.cs-row3 > .cs-box + .cs-box { border-left: 1px solid #111; }
.cs-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: inherit; }
.cs-table caption { caption-side: top; text-align: left; background: #111; color: #fff; font-size: 10px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase; padding: 4px 10px; }
.cs-table th { background: #e8e8e8; text-align: left; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  padding: 4px 8px; border-bottom: 1px solid #111; }
.cs-table td { border-bottom: 1px solid #c9c9c9; padding: 3px 8px; vertical-align: top; }
.cs-table th + th, .cs-table td + td { border-left: 1px solid #d6d6d6; }
.cs-num { text-align: center; font-weight: 700; }
.cs-times { white-space: nowrap; }
.cs-times .cs-in, .cs-times .cs-txt { display: inline-block; }
.cs-dash { color: #777; padding: 0 2px; }
.cs-time { width: 5.6ch; margin: 0; padding: 1px 2px; }
.cs-callbox .cs-bigtime { width: 3.3em; text-align: center; margin: 0 auto; }
.cs-ctlcol { width: 132px; }
.cs-ctl { padding: 3px 4px !important; }
.cs-ctl > div { display: flex; gap: 2px; align-items: center; justify-content: flex-end; opacity: .35; transition: opacity .12s; }
.cs-table tr:hover .cs-ctl > div, .cs-ctl > div:focus-within { opacity: 1; }
.cs-ctl button { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 22px; border: 0; border-radius: 3px;
  background: transparent; color: #555; cursor: pointer; }
.cs-ctl button:hover { background: #eee; color: #111; }
.cs-ctl button:disabled { opacity: .3; cursor: default; }
.cs-ctl .cs-del:hover { background: #fde8e8; color: #b91c1c; }
.cs-ctl select { font: inherit; font-size: 10.5px; width: 62px; border: 1px solid #d0d0d0; border-radius: 3px; background: #fff; color: #333; padding: 1px 2px; }
.cs-add { display: inline-flex; align-items: center; gap: 4px; margin: 4px 8px 8px; padding: 2px 6px; border: 0; background: transparent;
  color: #1d4ed8; font: 600 11.5px Arial, sans-serif; cursor: pointer; border-radius: 3px; }
.cs-add:hover { background: #eff6ff; }
`;

const PRINT_CSS = `
@page { size: letter; margin: 10mm; }
body { margin: 0; }
.cs-page { min-width: 0; max-width: none; box-shadow: none; font-size: 10.5px; }
.cs-table tr, .cs-box { break-inside: avoid; }
`;
