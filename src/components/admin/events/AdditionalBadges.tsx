"use client";

import { useState } from "react";
import { Loader2, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { BadgePreview } from "./BadgePreview";
import { badgeLayout } from "@/lib/events/badge-layout";
import { AdditionalBadgeSchema, standardOrganization, type AdditionalBadge, type PrintAction } from "@/lib/events/print-jobs";

const INPUT = "w-full min-w-0 rounded-md border border-line bg-card-solid px-2.5 py-2 text-[13px] text-fg focus-visible:outline-2 focus-visible:outline-brand";
const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-semibold text-fg hover:brightness-95 disabled:opacity-40";
const fields = [
  { key: "name", label: "Full name", size: 20, min: 10, max: 32, length: 160 },
  { key: "position", label: "Position title", size: 12.5, min: 8, max: 22, length: 200 },
  { key: "organization", label: "Organization", size: 11.5, min: 8, max: 22, length: 250 },
  { key: "extra", label: "Additional line", size: 10, min: 8, max: 18, length: 200 },
] as const;
const blank = (): AdditionalBadge => ({ name: "", position: "", organization: "", extra: "" });

export function AdditionalBadges({ busy, onCreate }: { busy: boolean; onCreate: (action: PrintAction) => Promise<boolean> }) {
  const [badges, setBadges] = useState<AdditionalBadge[]>([blank()]);
  const [active, setActive] = useState(0), [label, setLabel] = useState("");
  const [skip, setSkip] = useState(0), [offsetX, setOffsetX] = useState(0), [offsetY, setOffsetY] = useState(0);
  const [assignedTo, setAssignedTo] = useState(""), [notes, setNotes] = useState("");
  const badge = badges[active];
  const errors = badges.map(b => {
    if (!AdditionalBadgeSchema.safeParse(b).success) return b.name.trim().length < 2 ? "Enter a full name." : "Check the text lengths and font sizes.";
    try { badgeLayout({ ...b, organization: standardOrganization(b.organization) }); return ""; }
    catch (e) { return e instanceof Error ? e.message : "Check badge details."; }
  });
  const invalid = errors.findIndex(Boolean);
  const update = (value: AdditionalBadge) => setBadges(current => current.map((b, i) => i === active ? value : b));

  return <form className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]" aria-label="Additional badge printing" onSubmit={async e => {
    e.preventDefault();
    if (invalid >= 0 || busy) return;
    if (await onCreate({ action: "additional_badges", badges, label: label.trim() || "Additional badges", assignedTo, notes, skip, offsetX, offsetY })) {
      setBadges([blank()]); setActive(0); setLabel("");
    }
  }}>
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Additional badges</h2>
        <span className="text-xs text-muted">Avery 5393 · 4 × 3 in · Letter</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Badges in this batch">
        {badges.map((b, i) => <button type="button" key={i} aria-pressed={active === i} className={BUTTON + " max-w-full text-left" + (active === i ? " bg-brand text-white hover:brightness-110" : "")} disabled={busy} onClick={() => setActive(i)}><span className="min-w-0 break-words">{i + 1}. {b.name || "New badge"}</span></button>)}
        <button type="button" className={BUTTON} disabled={busy || badges.length >= 60} onClick={() => { setBadges([...badges, blank()]); setActive(badges.length); }}><Plus size={14} /> Add badge</button>
      </div>
      <fieldset className="min-w-0 space-y-4" disabled={busy}>
        <legend className="mb-3 flex w-full items-center justify-between gap-3 text-sm font-semibold">
          Badge {active + 1}
          <button type="button" className={BUTTON + " size-8 !p-0"} disabled={badges.length === 1 || busy} title="Remove this badge" aria-label="Remove this badge" onClick={() => { setBadges(badges.filter((_, i) => i !== active)); setActive(Math.max(0, active - 1)); }}><Trash2 size={14} /></button>
        </legend>
        {fields.map(field => <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_88px] items-end gap-3" key={field.key}>
          <label className="min-w-0 text-xs">{field.label}<input className={INPUT + " mt-1"} value={badge[field.key] ?? ""} required={field.key === "name"} minLength={field.key === "name" ? 2 : undefined} maxLength={field.length} onChange={e => update({ ...badge, [field.key]: e.target.value })} /></label>
          <label className="text-xs">Size (pt)<input className={INPUT + " mt-1 tabular-nums"} aria-label={field.label + " font size"} type="number" min={field.min} max={field.max} step={0.5} value={badge.fontSizes?.[field.key] ?? field.size} onChange={e => update({ ...badge, fontSizes: { ...badge.fontSizes, [field.key]: Number(e.target.value) } })} /></label>
        </div>)}
        <button type="button" className={BUTTON} onClick={() => update({ ...badge, fontSizes: undefined })}><RotateCcw size={14} /> Reset font sizes</button>
      </fieldset>
      <details className="border-y border-line py-3">
        <summary className="cursor-pointer text-sm font-semibold">Print settings</summary>
        <div className="grid gap-3 pt-4 sm:grid-cols-2">
          <label className="text-xs">Batch name<input className={INPUT + " mt-1"} value={label} onChange={e => setLabel(e.target.value)} maxLength={120} disabled={busy} /></label>
          <label className="text-xs">Print colleague<input className={INPUT + " mt-1"} value={assignedTo} onChange={e => setAssignedTo(e.target.value)} maxLength={200} disabled={busy} /></label>
          <label className="text-xs">Start at sheet position<select className={INPUT + " mt-1"} value={skip} onChange={e => setSkip(Number(e.target.value))} disabled={busy}>{["1 · Top left", "2 · Top right", "3 · Middle left", "4 · Middle right", "5 · Bottom left", "6 · Bottom right"].map((title, i) => <option key={i} value={i}>{title}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">{[["Horizontal offset", offsetX, setOffsetX], ["Vertical offset", offsetY, setOffsetY]].map(([title, value, setter]) => <label className="text-xs" key={String(title)}>{String(title)} (mm)<input className={INPUT + " mt-1"} type="number" min={-5} max={5} step={0.5} value={value as number} onChange={e => (setter as typeof setOffsetX)(Number(e.target.value))} disabled={busy} /></label>)}</div>
          <label className="text-xs sm:col-span-2">Print note<textarea className={INPUT + " mt-1"} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} disabled={busy} /></label>
        </div>
      </details>
      {invalid >= 0 && badges[invalid].name && <p role="alert" className="text-sm text-red-700 dark:text-red-300">Badge {invalid + 1}: {errors[invalid]}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">{badges.length} {badges.length === 1 ? "badge" : "badges"} · {Math.ceil((badges.length + skip) / 6)} {Math.ceil((badges.length + skip) / 6) === 1 ? "sheet" : "sheets"} · 100% actual size</span>
        <button type="submit" className={BUTTON + " bg-brand text-white hover:brightness-110"} disabled={busy || invalid >= 0}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Create print PDF</button>
      </div>
    </section>
    <aside className="min-w-0 space-y-3 lg:sticky lg:top-5">
      <h3 className="text-sm font-semibold">Badge preview</h3>
      <BadgePreview badge={{ ...badge, organization: standardOrganization(badge.organization), reviewed: false }} />
    </aside>
  </form>;
}
