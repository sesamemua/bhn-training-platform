"use client";

/**
 * Registrants → views. Nine built-in views (all, by workshop, by day,
 * dietary & accessibility, approved, declined, waitlisted, letters not
 * sent, by distance) plus the coordinators' own: pick one, adjust the
 * filters, save it as a new view, update, rename or delete it. Saved
 * views are shared by every admin.
 */
import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ClipboardCopy, Download, Loader2, Mail, Pencil, Plus, RotateCcw, Save, Trash2, UtensilsCrossed, X } from "lucide-react";
import { downloadText, fileDate } from "@/lib/download";
import { decideSeats, saveCateringSnapshot, saveRegistrantViews, sendSeatLetters } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { workshopTone } from "@/lib/allocation/workshop-colour";
import { changesSince, currentEntries, fullText, updateText, type Snapshot } from "@/lib/allocation/catering";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import {
  BUILT_IN_VIEWS, GROUP_BY, GROUP_LABEL, LETTERS, LETTER_LABEL, STATUSES, TRAVELS, TRAVEL_LABEL,
  applyView, isBuiltIn, type Filters, type RegistrantRow, type ShownRow, type View,
} from "@/lib/allocation/registrant-views";

const STATUS_LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };
const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-600",
  waitlist: "bg-amber-500/12 text-amber-600",
  cancelled: "bg-rose-500/10 text-rose-600",
  pending: "bg-brand-500/12 text-brand-500",
};
const chip = "rounded px-1.5 py-0.5 text-[10.5px] font-bold";
/** What a selection can be told, in the order a coordinator works. */
const BULK: { to: string; label: string; className: string }[] = [
  { to: "confirmed", label: "Approve", className: "bg-emerald-600 text-white hover:bg-emerald-700" },
  { to: "waitlist", label: "Waitlist", className: "bg-amber-500 text-white hover:bg-amber-600" },
  { to: "cancelled", label: "Decline", className: "bg-rose-600 text-white hover:bg-rose-700" },
  { to: "pending", label: "Back to undecided", className: "border border-line text-fg hover:bg-elevated" },
];
const pill = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
    on ? "border-brand-500 bg-brand-500/10 text-fg" : "border-line text-muted hover:bg-elevated hover:text-fg"
  }`;
const SELECT = "rounded-md border border-line bg-elevated px-2 py-1 text-[12.5px] text-fg";

const tz = "America/Toronto";

/** "24 Sep, 2:41 p.m." — short enough to sit beside a name. */
const shortStamp = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

/**
 * Where the registration came in.
 *
 * Innovation Ignited takes its own registrations from its own page —
 * linked at the bottom of biohubnet.ca/training-week-2026 — and those
 * people never saw the week\'s form. Same seat, same room, different
 * front door, so the row says which.
 */
const FRONT_DOORS: Record<string, { label: string; className: string; title: string }> = {
  "innovation-ignited-2026": {
    label: "via Innovation Ignited",
    className: "bg-teal-500/12 text-teal-700",
    title: "Registered on the Innovation Ignited page, not the Training Week form",
  },
};

function SourceBadge({ formSlug }: { formSlug: string | null }) {
  const door = formSlug ? FRONT_DOORS[formSlug] : undefined;
  if (!door) return null;
  return <span className={`${chip} ${door.className}`} title={door.title}>{door.label}</span>;
}

/** Which programme let them in, in two letters of colour. */
function ProgrammeBadge({ programmes }: { programmes: string[] }) {
  if (programmes.length === 0) {
    return <span className={`${chip} bg-amber-500/12 text-amber-700`} title="On no programme list when they registered">Not on a list</span>;
  }
  const equip = programmes.includes("EQUIP");
  return (
    <span
      className={`${chip} ${equip ? "bg-violet-500/12 text-violet-700" : "bg-brand-500/12 text-brand-600"}`}
      title={`Recognised under ${programmes.join(", ")}`}
    >
      {equip ? "EQUIP" : "ENGAGE / EXPERIENCE"}
    </span>
  );
}

/**
 * Who came in last, by where they came from.
 *
 * Two short lists rather than one: the newest three off the
 * ENGAGE/EXPERIENCE roster and the newest two from EQUIP, because
 * "anything new today?" is usually asked about one programme or the
 * other. One line each — this sits above a table, not instead of it.
 */
export function LatestRegistrants({ rows }: { rows: RegistrantRow[] }) {
  const newest = useMemo(() => {
    const people = new Map<string, RegistrantRow>();
    for (const r of [...rows].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))) {
      if (!people.has(r.personKey)) people.set(r.personKey, r);
    }
    const all = [...people.values()];
    const equip = (r: RegistrantRow) => r.programmes.includes("EQUIP");
    return {
      roster: all.filter((r) => !equip(r)).slice(0, 3),
      equip: all.filter(equip).slice(0, 2),
    };
  }, [rows]);

  if (rows.length === 0) return null;

  const column = (title: string, list: RegistrantRow[], empty: string) => (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{title}</p>
      {list.length === 0 ? (
        <p className="text-[12px] text-subtle">{empty}</p>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {list.map((r) => (
            <li key={r.personKey} className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] leading-tight">
              <span className="font-semibold text-fg">{r.name}</span>
              <SourceBadge formSlug={r.formSlug} />
              <span className="truncate font-mono text-[10.5px] text-subtle">{r.email}</span>
              <span className="text-[10.5px] text-muted">{shortStamp(r.appliedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="mb-3 grid gap-3 rounded-lg border border-line bg-elevated/40 px-3 py-2 sm:grid-cols-2">
      {column("Latest — ENGAGE / EXPERIENCE", newest.roster, "None yet")}
      {column("Latest — EQUIP", newest.equip, "None yet")}
    </div>
  );
}
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
      programmes: b.applicant.programmes ?? [],
      formSlug: b.applicant.formSlug ?? null,
      workshopStart: w.startDateTime,
      workshopEnd: w.endDateTime,
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

  /* A workshop's colour is the same one it has on the dashboard and in
     the calendar, and it is keyed by slug — the rows carry ids. */
  const slugOf = useMemo(() => new Map(workshops.map((w) => [w.id, w.slug])), [workshops]);
  const toneOf = (workshopId: string) => workshopTone(slugOf.get(workshopId) ?? workshopId);

  /*
   * What is ticked.
   *
   * By row key, because that is what a coordinator sees — in People
   * mode one tick is somebody's whole registration, and the seats it
   * stands for come off the row. A row shown in two groups (somebody
   * with two dietary needs) is one key, so it ticks in both places and
   * is acted on once.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const keyOf = (r: ShownRow) => (draft.perPerson ? r.personKey : r.bookingId);
  const shownRows = useMemo(() => {
    const m = new Map<string, ShownRow>();
    for (const g of groups) for (const r of g.rows) m.set(draft.perPerson ? r.personKey : r.bookingId, r);
    return [...m.values()];
  }, [groups, draft.perPerson]);
  // Only what is on screen: a filter changing under a tick must not
  // decide somebody the coordinator can no longer see.
  const chosen = shownRows.filter((r) => picked.has(keyOf(r)));
  const chosenSeats = [...new Set(chosen.flatMap((r) => r.bookingIds))];
  const [alsoEmail, setAlsoEmail] = useState(false);
  const clearPick = () => setPicked(new Set());
  const tick = (k: string) => setPicked((s) => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n; });
  const tickAll = (rowsHere: ShownRow[], on: boolean) =>
    setPicked((s) => { const n = new Set(s); for (const r of rowsHere) { const k = keyOf(r); if (on) n.add(k); else n.delete(k); } return n; });

  function runBulk(to: string, label: string) {
    const seats = chosenSeats.length;
    const who = `${chosen.length} ${draft.perPerson ? (chosen.length === 1 ? "person" : "people") : chosen.length === 1 ? "seat" : "seats"}`;
    const what = draft.perPerson && seats !== chosen.length ? ` (${seats} seats)` : "";
    if (!confirm(`${label} ${who}${what}?${alsoEmail ? " They will be emailed now." : " No email is sent yet — the letters show as not sent."}`)) return;
    start(async () => {
      const r = await decideSeats(chosenSeats, to, { send: alsoEmail });
      if (!r.ok) { setSaid(r.problem ?? "That did not go through."); return; }
      setSaid(`${label}: ${r.done} seat${r.done === 1 ? "" : "s"}${r.sent ? `, ${r.sent} emailed` : ""}${r.failed ? `, ${r.failed} failed` : ""}.`);
      clearPick();
    });
  }
  function runLetters() {
    const owed = chosen.filter((r) => r.letter === "owed").flatMap((r) => r.bookingIds);
    if (owed.length === 0) { setSaid("None of those owe a letter."); return; }
    if (!confirm(`Send ${owed.length} letter${owed.length === 1 ? "" : "s"} now?`)) return;
    start(async () => {
      const r = await sendSeatLetters(owed);
      setSaid(`${r.sent} letter${r.sent === 1 ? "" : "s"} sent${r.failed ? `, ${r.failed} failed` : ""}.`);
      clearPick();
    });
  }
  function copyEmails() {
    const list = [...new Set(chosen.map((r) => r.email).filter(Boolean))];
    navigator.clipboard.writeText(list.join(", ")).then(
      () => setSaid(`${list.length} address${list.length === 1 ? "" : "es"} copied.`),
      () => setSaid("Could not copy."),
    );
  }
  const shownCount = useMemo(() => new Set(groups.flatMap((g) => g.rows.map((r) => (draft.perPerson ? r.personKey : r.bookingId)))).size, [groups, draft.perPerson]);

  const days = useMemo(() => [...new Map(rows.map((r) => [r.day, r.dayLabel])).entries()].sort(), [rows]);
  const dietOptions = useMemo(() => [...new Set(rows.flatMap((r) => r.dietary))].filter((d) => !/^no dietary/i.test(d)).sort(), [rows]);
  const changed = !same(draft, active);
  const custom = !isBuiltIn(active.id);

  const setF = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, filters: { ...d.filters, ...patch } }));
  const open = (v: View) => { setActiveId(v.id); setDraft(v); setSaid(null); setPicked(new Set()); };

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

      {activeId === "dietary" && (
        <p className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/[0.04] px-3 py-2 text-[12.5px] text-muted">
          To send this to the caterer, use the <strong className="text-fg">Catering &amp; accessibility</strong> tab — it copies only upcoming, approved attendees and tracks what changed.
        </p>
      )}

      {/* Filters */}
      <div className="mt-3 grid gap-2.5 rounded-lg border border-line bg-elevated/40 p-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="inline-flex items-center gap-1.5 text-muted">Group by
            <select className={SELECT} value={draft.groupBy} onChange={(e) => setDraft({ ...draft, groupBy: e.target.value as View["groupBy"] })}>
              {GROUP_BY.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </label>
          <span className="inline-flex items-center gap-1 text-muted">Rows
            <button type="button" className={pill(!draft.perPerson)} onClick={() => { setDraft({ ...draft, perPerson: false }); setPicked(new Set()); }}>Seats</button>
            <button type="button" className={pill(draft.perPerson)} onClick={() => { setDraft({ ...draft, perPerson: true }); setPicked(new Set()); }}>People</button>
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

      {/* What is ticked, and what can be done with it. Sticky, because
          the decision buttons belong beside the rows being decided. */}
      {chosen.length > 0 && (
        <div className="sticky top-2 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-500/40 bg-card-solid px-3 py-2 shadow-sm">
          <span className="text-[12.5px] font-bold text-fg">
            {chosen.length} {draft.perPerson ? (chosen.length === 1 ? "person" : "people") : chosen.length === 1 ? "seat" : "seats"} selected
            {draft.perPerson && chosenSeats.length !== chosen.length && (
              <span className="ml-1 font-normal text-muted">· {chosenSeats.length} seats</span>
            )}
          </span>
          <span className="h-4 w-px bg-line" aria-hidden />
          {BULK.map((b) => (
            <button key={b.to} type="button" disabled={pending} onClick={() => runBulk(b.to, b.label)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-bold disabled:opacity-50 ${b.className}`}>
              {b.label}
            </button>
          ))}
          <label className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} className="accent-brand-600" />
            Email them now
          </label>
          <span className="h-4 w-px bg-line" aria-hidden />
          <button type="button" disabled={pending} onClick={runLetters}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-50">
            <Mail size={12} /> Send letters owed
          </button>
          <button type="button" onClick={copyEmails}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated">
            <ClipboardCopy size={12} /> Copy addresses
          </button>
          <button type="button" onClick={clearPick} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-fg">
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* Results */}
      <div className="mt-4 space-y-4">
        <LatestRegistrants rows={rows} />
        {groups.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
            {rows.length === 0 ? "Nobody has registered yet." : "Nobody matches this view."}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key}>
            {draft.groupBy !== "none" && (
              <h4 className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-fg">
                {draft.groupBy === "workshop" && <span className={`h-2.5 w-2.5 rounded-full ${toneOf(g.key).dot}`} aria-hidden />}
                {g.label} <span className="text-[11.5px] font-normal text-muted">{g.rows.length}</span>
              </h4>
            )}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                <thead>
                  <tr className="bg-elevated text-left">
                    <th className="w-8 px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="accent-brand-600"
                        aria-label={`Select every row in ${g.label}`}
                        checked={g.rows.every((r) => picked.has(keyOf(r)))}
                        onChange={(e) => tickAll(g.rows, e.target.checked)}
                      />
                    </th>
                    {(draft.perPerson
                      ? ["Name", "Workshops", "Distance", "Dietary", "Accessibility"]
                      : ["Name", "Workshop", "Day", "Decision", "Email", "Distance", "Dietary", "Accessibility", "Choice"]
                    ).map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-subtle">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={draft.perPerson ? r.personKey : r.bookingId}
                      className={`border-t border-line align-top ${picked.has(keyOf(r)) ? "bg-brand-500/[0.06]" : ""}`}>
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          className="accent-brand-600"
                          aria-label={`Select ${r.name}`}
                          checked={picked.has(keyOf(r))}
                          onChange={() => tick(keyOf(r))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        {/* Name, address and when they registered on one
                            line each at most: the column used to be three
                            deep for every seat, and the page was a scroll
                            through the same names. */}
                        <div className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                          <span className="font-semibold text-fg">{r.name}</span>
                          <ProgrammeBadge programmes={r.programmes} />
                          <SourceBadge formSlug={r.formSlug} />
                        </div>
                        {/* Address and time share the second line, so a row
                            with two badges is still two lines and not three. */}
                        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[10.5px] leading-tight text-subtle">
                          {r.email && r.email !== r.name && <span className="font-mono">{r.email}</span>}
                          <span>{shortStamp(r.appliedAt)}</span>
                        </div>
                      </td>
                      {draft.perPerson ? (
                        <td className="px-2 py-1 text-muted">
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            {r.workshops.map((w, i) => (
                              <span key={`${r.bookingIds[i]}`} className="inline-flex items-center gap-1.5">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${toneOf(r.workshopIds[i]).dot}`} aria-hidden />{w}
                              </span>
                            ))}
                          </span>
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1 text-muted">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${toneOf(r.workshopId).dot}`} aria-hidden />{r.workshop}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-muted">{r.dayLabel}</td>
                          <td className="px-2 py-1"><span className={`${chip} ${STATUS_TONE[r.status] ?? "bg-elevated text-subtle"}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                          <td className="whitespace-nowrap px-2 py-1">
                            {r.letter === "owed" ? <span className={`${chip} bg-amber-500/12 text-amber-600`}>Not sent</span> : <span className="text-[11.5px] text-subtle">{r.letter === "sent" ? "Sent" : "—"}</span>}
                          </td>
                        </>
                      )}
                      <td className="whitespace-nowrap px-2 py-1 text-muted">
                        {r.travel === "far" ? "Over 2 h" : r.travel === "near" ? "Local" : "—"}{r.postcode && <span className="ml-1 font-mono text-[11px] text-subtle">{r.postcode}</span>}
                      </td>
                      <td className="px-2 py-1 text-muted">
                        {[...r.dietary.filter((d) => !/^other/i.test(d)), r.dietaryOther && `Other: ${r.dietaryOther}`].filter(Boolean).join(" · ") || <span className="text-subtle">—</span>}
                      </td>
                      <td className="px-2 py-1 text-muted">{r.accessibility === "none" ? "None" : r.accessibility || <span className="text-subtle">—</span>}</td>
                      {!draft.perPerson && <td className="whitespace-nowrap px-2 py-1 text-subtle">{r.preference ? `#${r.preference}` : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => downloadText(`training-week-${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${fileDate()}.csv`, csv)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated"
        >
          <Download size={12} /> Download this view as CSV
        </button>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[12.5px] text-muted hover:text-fg">
          <ChevronDown size={12} className="inline" /> Copy this view as CSV
        </summary>
        {/* A textarea rather than a download: select-all-copy always works. */}
        <textarea readOnly value={csv} rows={6} className="mt-2 w-full rounded-md border border-line bg-elevated p-2 font-mono text-[11px] text-muted" />
      </details>
    </section>
  );
}

const stampOf = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * For the caterer: one big button that copies everything they need for
 * the sessions still to come, and a second that copies only what changed
 * since the last copy. Every copy becomes the new baseline.
 */
export function CateringPanel({ rows, initial }: { rows: RegistrantRow[]; initial: Snapshot | null }) {
  const [snap, setSnap] = useState<Snapshot | null>(initial);
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [preview, setPreview] = useState<"full" | "update" | null>(null);

  const entries = useMemo(() => currentEntries(rows), [rows]);
  const changes = useMemo(() => changesSince(snap, entries), [snap, entries]);
  const count = (k: string) => changes.filter((c) => c.kind === k).length;
  const sessions = new Set(entries.map((e) => e.workshopId)).size;

  const textFor = (kind: "full" | "update") => {
    const now = new Date().toISOString();
    return kind === "full" || !snap ? fullText(entries, now) : updateText(changes, entries, snap.at, now);
  };

  async function copy(kind: "full" | "update") {
    const text = textFor(kind);
    setFallback(null);
    let byHand = false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard access (an iframe, an old browser): show it to copy by hand.
      byHand = true;
      setFallback(text);
    }
    start(async () => {
      const r = await saveCateringSnapshot(entries);
      if (r.ok && r.snapshot) {
        setSnap(r.snapshot);
        setSaid(byHand
          ? "Copy the text below by hand — it is now the baseline for the next update."
          : `${kind === "full" ? "Everything" : "The changes"} copied — paste into your email to the caterer.`);
      } else setSaid(r.problem ?? "Copied, but could not record it — the next update may repeat these changes.");
    });
  }

  return (
    <div className="mt-3 rounded-xl border-2 border-brand-500/30 bg-brand-500/[0.04] p-4">
      <div className="flex flex-wrap items-start gap-4">
        <UtensilsCrossed size={22} className="mt-1 shrink-0 text-brand-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fg">For the caterer</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Approved attendees of the {sessions} session{sessions === 1 ? "" : "s"} still to come — headcount, dietary requirements with names,
            and accessibility needs. Sessions that are over are left out.
          </p>
          <p className="mt-1.5 text-[12.5px]">
            {snap ? (
              <>
                <span className="text-muted">Last copied {stampOf(snap.at)}{snap.by ? ` by ${snap.by}` : ""}. </span>
                {changes.length === 0
                  ? <span className="font-semibold text-emerald-600">Nothing has changed since.</span>
                  : <span className="font-semibold text-amber-600">Since then: {count("added")} added · {count("changed")} changed · {count("removed")} no longer attending.</span>}
              </>
            ) : (
              <span className="text-muted">Not copied yet.</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => copy("full")}
          disabled={pending}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCopy size={18} />} Copy for the caterer
        </button>
        <button
          type="button"
          onClick={() => copy("update")}
          disabled={pending || !snap || changes.length === 0}
          title={!snap ? "Copy everything once first" : changes.length === 0 ? "Nothing has changed since the last copy" : undefined}
          className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-brand-500/50 px-5 text-[14px] font-bold text-fg hover:bg-brand-500/10 disabled:opacity-40"
        >
          Copy only what changed{snap && changes.length ? ` (${changes.length})` : ""}
        </button>
        <button type="button" onClick={() => setPreview(preview ? null : snap && changes.length ? "update" : "full")} className="ml-1 text-[12px] font-semibold text-muted underline-offset-2 hover:text-fg hover:underline">
          {preview ? "Hide preview" : "Preview"}
        </button>
      </div>

      {said && <p role="status" className="mt-2 text-[12.5px] font-medium text-fg">{said}</p>}
      {fallback && <textarea readOnly autoFocus onFocus={(e) => e.currentTarget.select()} value={fallback} rows={10} className="mt-2 w-full rounded-md border border-line bg-card p-2 font-mono text-[11.5px] text-fg" />}
      {preview && !fallback && (
        <div className="mt-3">
          <div className="mb-1 flex gap-1.5">
            <button type="button" className={pill(preview === "full")} onClick={() => setPreview("full")}>Everything</button>
            {snap && <button type="button" className={pill(preview === "update")} onClick={() => setPreview("update")}>Only what changed</button>}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-card p-3 font-mono text-[11.5px] leading-relaxed text-fg">{textFor(preview)}</pre>
        </div>
      )}
    </div>
  );
}
