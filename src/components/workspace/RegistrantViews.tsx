"use client";

/**
 * Registrants → views. Nine built-in views (all, by workshop, by day,
 * dietary & accessibility, approved, declined, waitlisted, letters not
 * sent, by distance) plus the coordinators' own: pick one, adjust the
 * filters, save it as a new view, update, rename or delete it. Saved
 * views are shared by every admin.
 */
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { saveRegistrantViews } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import {
  BUILT_IN_VIEWS, GROUP_BY, GROUP_LABEL, LETTERS, LETTER_LABEL, STATUSES, TRAVELS, TRAVEL_LABEL,
  applyView, isBuiltIn, type Filters, type RegistrantRow, type View,
} from "@/lib/allocation/registrant-views";

const STATUS_LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };
const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-600",
  waitlist: "bg-amber-500/12 text-amber-600",
  cancelled: "bg-rose-500/10 text-rose-600",
  pending: "bg-brand-500/12 text-brand-500",
};
const chip = "rounded px-1.5 py-0.5 text-[10.5px] font-bold";
const pill = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
    on ? "border-brand-500 bg-brand-500/10 text-fg" : "border-line text-muted hover:bg-elevated hover:text-fg"
  }`;
const SELECT = "rounded-md border border-line bg-elevated px-2 py-1 text-[12.5px] text-fg";

const tz = "America/Toronto";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));

/** One row per seat, with what the registration said. */
export function rowsFrom(workshops: AdminWorkshop[]): RegistrantRow[] {
  return workshops.flatMap((w) =>
    w.bookings.map((b) => ({
      bookingId: b.id,
      personKey: b.registrant.personKey,
      name: b.applicant.name,
      email: b.applicant.email,
      workshopId: w.id,
      workshop: w.title,
      day: dayKey(w.startDateTime),
      dayLabel: dayLabel(w.startDateTime),
      status: b.status,
      letter: b.letterOwed ? "owed" as const : b.status === "pending" ? "none" as const : "sent" as const,
      travel: b.applicant.travel,
      postcode: b.registrant.postcode,
      dietary: b.registrant.dietary,
      dietaryOther: b.registrant.dietaryOther,
      accessibility: b.registrant.accessibility,
      preference: b.applicant.preference,
      appliedAt: String(b.applicant.appliedAt),
    })),
  );
}

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
const same = (a: View, b: View) => JSON.stringify({ ...a, name: "" }) === JSON.stringify({ ...b, name: "" });

export function RegistrantViews({ workshops, initialViews }: { workshops: AdminWorkshop[]; initialViews: View[] }) {
  const [saved, setSaved] = useState<View[]>(initialViews);
  const all = [...BUILT_IN_VIEWS, ...saved];
  const [activeId, setActiveId] = useState("all");
  const active = all.find((v) => v.id === activeId) ?? BUILT_IN_VIEWS[0];
  const [draft, setDraft] = useState<View>(active);
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);

  const rows = useMemo(() => rowsFrom(workshops), [workshops]);
  const groups = useMemo(() => applyView(rows, draft), [rows, draft]);
  const shownCount = useMemo(() => new Set(groups.flatMap((g) => g.rows.map((r) => (draft.perPerson ? r.personKey : r.bookingId)))).size, [groups, draft.perPerson]);

  const days = useMemo(() => [...new Map(rows.map((r) => [r.day, r.dayLabel])).entries()].sort(), [rows]);
  const dietOptions = useMemo(() => [...new Set(rows.flatMap((r) => r.dietary))].filter((d) => !/^no dietary/i.test(d)).sort(), [rows]);
  const changed = !same(draft, active);
  const custom = !isBuiltIn(active.id);

  const setF = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, filters: { ...d.filters, ...patch } }));
  const open = (v: View) => { setActiveId(v.id); setDraft(v); setSaid(null); };

  function persist(next: View[], message: string, openId?: string) {
    start(async () => {
      const r = await saveRegistrantViews(next);
      if (!r.ok) { setSaid(r.problem ?? "Could not save."); return; }
      setSaved(r.views);
      const target = [...BUILT_IN_VIEWS, ...r.views].find((v) => v.id === (openId ?? activeId));
      if (target) { setActiveId(target.id); setDraft(target); }
      setSaid(message);
    });
  }
  function saveAsNew() {
    const name = prompt("Name this view", custom ? `${active.name} (copy)` : changed ? "My view" : `${active.name} (copy)`)?.trim();
    if (!name) return;
    const id = `v-${Date.now().toString(36)}`;
    persist([...saved, { ...draft, id, name: name.slice(0, 60) }], `Saved “${name}”.`, id);
  }
  function update() {
    persist(saved.map((v) => (v.id === active.id ? { ...draft, id: v.id, name: v.name } : v)), `Updated “${active.name}”.`);
  }
  function rename() {
    const name = prompt("Rename this view", active.name)?.trim();
    if (!name || name === active.name) return;
    persist(saved.map((v) => (v.id === active.id ? { ...v, name: name.slice(0, 60) } : v)), `Renamed to “${name}”.`);
  }
  function remove() {
    if (!confirm(`Delete the view “${active.name}”? The registrations themselves are not affected.`)) return;
    persist(saved.filter((v) => v.id !== active.id), `Deleted “${active.name}”.`, "all");
  }

  const csv = useMemo(() => {
    const head = ["Group", "Name", "Email", draft.perPerson ? "Workshops" : "Workshop", "Day", "Decision", "Email status", "Distance", "Postcode", "Dietary", "Accessibility"];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = groups.flatMap((g) => g.rows.map((r) => [
      g.label, r.name, r.email, r.workshops.join("; "), r.dayLabel, STATUS_LABEL[r.status] ?? r.status, LETTER_LABEL[r.letter],
      TRAVEL_LABEL[r.travel], r.postcode, [...r.dietary, r.dietaryOther].filter(Boolean).join("; "), r.accessibility,
    ]));
    return [head, ...lines].map((l) => l.map((c) => esc(String(c))).join(",")).join("\n");
  }, [groups, draft.perPerson]);

  return (
    <section className="rounded-lg border border-line bg-card p-4">
      {/* Views */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Registrant views">
        {all.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={v.id === activeId} onClick={() => open(v)} className={pill(v.id === activeId)}>
            {v.name}{!isBuiltIn(v.id) && <span className="ml-1 text-[10px] font-normal text-subtle">saved</span>}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-3 grid gap-2.5 rounded-lg border border-line bg-elevated/40 p-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="inline-flex items-center gap-1.5 text-muted">Group by
            <select className={SELECT} value={draft.groupBy} onChange={(e) => setDraft({ ...draft, groupBy: e.target.value as View["groupBy"] })}>
              {GROUP_BY.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </label>
          <span className="inline-flex items-center gap-1 text-muted">Rows
            <button type="button" className={pill(!draft.perPerson)} onClick={() => setDraft({ ...draft, perPerson: false })}>Seats</button>
            <button type="button" className={pill(draft.perPerson)} onClick={() => setDraft({ ...draft, perPerson: true })}>People</button>
          </span>
          <label className="inline-flex items-center gap-1.5 text-muted">Workshop
            <select className={SELECT} value={draft.filters.workshopIds[0] ?? ""} onChange={(e) => setF({ workshopIds: e.target.value ? [e.target.value] : [] })}>
              <option value="">All</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-muted">Day
            <select className={SELECT} value={draft.filters.days[0] ?? ""} onChange={(e) => setF({ days: e.target.value ? [e.target.value] : [] })}>
              <option value="">All</option>
              {days.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-muted">Dietary
            <select className={SELECT} value={draft.filters.dietary} onChange={(e) => setF({ dietary: e.target.value })}>
              <option value="">Any</option>
              <option value="needs">Has a requirement</option>
              <option value="none">None</option>
              <option value="unanswered">Not answered</option>
              {dietOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-muted">Accessibility
            <select className={SELECT} value={draft.filters.accessibility} onChange={(e) => setF({ accessibility: e.target.value as Filters["accessibility"] })}>
              <option value="">Any</option>
              <option value="needs">Has requirements</option>
              <option value="none">None</option>
              <option value="unanswered">Not answered</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex flex-wrap items-center gap-1 text-muted">Decision
            {STATUSES.map((s) => (
              <button key={s} type="button" className={pill(draft.filters.status.includes(s))} onClick={() => setF({ status: toggle(draft.filters.status, s) })}>{STATUS_LABEL[s]}</button>
            ))}
          </span>
          <span className="inline-flex flex-wrap items-center gap-1 text-muted">Email
            {LETTERS.map((l) => (
              <button key={l} type="button" className={pill(draft.filters.letter.includes(l))} onClick={() => setF({ letter: toggle(draft.filters.letter, l) })}>{LETTER_LABEL[l]}</button>
            ))}
          </span>
          <span className="inline-flex flex-wrap items-center gap-1 text-muted">Distance
            {TRAVELS.map((t) => (
              <button key={t} type="button" className={pill(draft.filters.travel.includes(t))} onClick={() => setF({ travel: toggle(draft.filters.travel, t) })}>{TRAVEL_LABEL[t]}</button>
            ))}
          </span>
          <input
            value={draft.filters.q}
            onChange={(e) => setF({ q: e.target.value })}
            placeholder="Search name, email, postcode, needs"
            aria-label="Search"
            className="min-w-[14rem] flex-1 rounded-md border border-line bg-card px-2.5 py-1 text-[12.5px] text-fg placeholder:text-subtle focus:border-brand-500 focus:outline-none"
          />
        </div>

        {/* Saved views: create, update, rename, delete */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <button type="button" onClick={saveAsNew} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40">
            <Plus size={12} /> Save as new view
          </button>
          {custom && (
            <>
              <button type="button" onClick={update} disabled={pending || !changed} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40">
                <Save size={12} /> Save changes
              </button>
              <button type="button" onClick={rename} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40">
                <Pencil size={12} /> Rename
              </button>
              <button type="button" onClick={remove} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-muted hover:border-rose-500/50 hover:text-rose-600 disabled:opacity-40">
                <Trash2 size={12} /> Delete view
              </button>
            </>
          )}
          {changed && (
            <button type="button" onClick={() => setDraft(active)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
              <RotateCcw size={12} /> Reset to “{active.name}”
            </button>
          )}
          {pending && <Loader2 size={13} className="animate-spin text-muted" />}
          {said && <span role="status" className="text-[12px] text-fg">{said}</span>}
          <span className="ml-auto text-[12px] text-muted">{shownCount} {draft.perPerson ? "people" : "seats"}</span>
        </div>
      </div>

      {/* Results */}
      <div className="mt-4 space-y-4">
        {groups.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
            {rows.length === 0 ? "Nobody has registered yet." : "Nobody matches this view."}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key}>
            {draft.groupBy !== "none" && (
              <h4 className="mb-1.5 flex items-baseline gap-2 text-[13px] font-bold text-fg">
                {g.label} <span className="text-[11.5px] font-normal text-muted">{g.rows.length}</span>
              </h4>
            )}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-elevated text-left">
                    {(draft.perPerson
                      ? ["Name", "Workshops", "Distance", "Dietary", "Accessibility"]
                      : ["Name", "Workshop", "Day", "Decision", "Email", "Distance", "Dietary", "Accessibility", "Choice"]
                    ).map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-subtle">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={draft.perPerson ? r.personKey : r.bookingId} className="border-t border-line align-top">
                      <td className="px-3 py-1.5">
                        <div className="font-semibold text-fg">{r.name}</div>
                        {r.email && r.email !== r.name && <div className="font-mono text-[11px] text-subtle">{r.email}</div>}
                      </td>
                      {draft.perPerson ? (
                        <td className="px-3 py-1.5 text-muted">{r.workshops.join(" · ")}</td>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 text-muted">{r.workshop}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-muted">{r.dayLabel}</td>
                          <td className="px-3 py-1.5"><span className={`${chip} ${STATUS_TONE[r.status] ?? "bg-elevated text-subtle"}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                          <td className="whitespace-nowrap px-3 py-1.5">
                            {r.letter === "owed" ? <span className={`${chip} bg-amber-500/12 text-amber-600`}>Not sent</span> : <span className="text-[11.5px] text-subtle">{r.letter === "sent" ? "Sent" : "—"}</span>}
                          </td>
                        </>
                      )}
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted">
                        {r.travel === "far" ? "Over 2 h" : r.travel === "near" ? "Local" : "—"}{r.postcode && <span className="ml-1 font-mono text-[11px] text-subtle">{r.postcode}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-muted">
                        {[...r.dietary.filter((d) => !/^other/i.test(d)), r.dietaryOther && `Other: ${r.dietaryOther}`].filter(Boolean).join(" · ") || <span className="text-subtle">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-muted">{r.accessibility === "none" ? "None" : r.accessibility || <span className="text-subtle">—</span>}</td>
                      {!draft.perPerson && <td className="whitespace-nowrap px-3 py-1.5 text-subtle">{r.preference ? `#${r.preference}` : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] text-muted hover:text-fg">
          <ChevronDown size={12} className="inline" /> Copy this view as CSV
        </summary>
        {/* A textarea rather than a download: select-all-copy always works. */}
        <textarea readOnly value={csv} rows={6} className="mt-2 w-full rounded-md border border-line bg-elevated p-2 font-mono text-[11px] text-muted" />
      </details>
    </section>
  );
}
