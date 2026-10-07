"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, Check, Copy, GripVertical, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2, Unlink, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { PLAN_SESSIONS, ROSTER_EVENTS, personEvents, matchPlanPeople, type PlanPerson, type PersonInput, type PlanSession, type PlanSnapshot, type Match } from "@/lib/events/people-plan";
import type { PlanAction } from "@/lib/events/people-plan-store";
import PeoplePublicationPanel from "./PeoplePublicationPanel";

const API = "/api/admin/symposium-people";
const INPUT = "w-full min-w-0 rounded-md border border-line bg-card-solid px-2.5 py-2 text-[13px] text-fg focus-visible:outline-2 focus-visible:outline-brand";
const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-2.5 py-2 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";
type Draft = PersonInput & { session: PlanSession; key: string };

export function SymposiumPeopleTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState("people");
  const [publicationOpened, setPublicationOpened] = useState(false);
  const router = useRouter();
  return <div className="mx-auto w-full max-w-[1500px] pb-12">
    <nav aria-label="Speaker workspace" className="mb-5 flex flex-wrap gap-2 border-b border-line">
      {[["people", "People planner"], ["roster", "People roster"], ["submissions", "Headshots & bios"], ["publication", "Website publishing"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); if (key === "publication") setPublicationOpened(true); if (key === "submissions") router.refresh(); }} className={`border-b-2 px-2 py-3 text-[14px] font-semibold ${tab === key ? "border-brand text-fg" : "border-transparent text-muted"}`}>{label}</button>)}
    </nav>
    <div hidden={tab !== "people" && tab !== "roster"}><SymposiumPeoplePlanner view={tab === "roster" ? "roster" : "planner"} /></div>
    <div hidden={tab !== "publication"}>{publicationOpened && <PeoplePublicationPanel />}</div>
    {tab === "submissions" && <div className="mx-auto max-w-3xl">{children}</div>}
  </div>;
}

export function SymposiumPeoplePlanner({ view = "planner" }: { view?: "planner" | "roster" }) {
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const editVersion = useRef<string | null>(null);
  const [source, setSource] = useState<"paste" | "2025">("paste");
  const [text, setText] = useState("");
  const [retry, setRetry] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [defaultSession, setDefaultSession] = useState<PlanSession>("networking");
  const defaultRef = useRef(defaultSession);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [editing, setEditing] = useState<PlanPerson | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (busyRef.current) return;
      const started = generation.current;
      try {
        const response = await fetch(API, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't load profiles.");
        if (!cancelled && !busyRef.current && started === generation.current) setSnapshot(body);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load profiles."); }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!text.trim()) { setParsing(false); return; }
      setDrafts([]); setParseError(""); setWarnings([]);
      setParsing(true);
      try {
        const response = await fetch(API, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "parse", text }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Couldn't separate the list.");
        if (!controller.signal.aborted) {
          setDrafts(body.people.map((p: PersonInput) => ({ ...p, session: defaultRef.current, key: crypto.randomUUID() })));
          setWarnings(body.warnings ?? []);
          if (!body.people.length) setParseError("No people found. Add a name or paste another list.");
        }
      } catch (e) { if (!controller.signal.aborted) setParseError(e instanceof Error ? e.message : "Couldn't separate the list."); }
      finally { if (!controller.signal.aborted) setParsing(false); }
    }, 900);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [text, retry]);

  const matches = useMemo(() => matchPlanPeople(snapshot?.people ?? [], snapshot?.speakers ?? []), [snapshot]);
  const visible = (p: PlanPerson) => !p.archived && (!eventFilter || personEvents(p).includes(eventFilter))
    && `${p.fullName} ${p.organization} ${p.tags?.join(" ") ?? ""} ${matches.get(p.id)?.speaker?.fullName ?? ""} ${matches.get(p.id)?.speaker?.organization ?? ""}`.toLowerCase().includes(query.toLowerCase());

  async function mutate(change: PlanAction, version = snapshot?.version) {
    if (!snapshot || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    generation.current++;
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, change }) });
      const body = await response.json();
      if (body.snapshot) setSnapshot(body.snapshot);
      if (response.status === 409) throw new Error("A colleague changed the board. Their changes are loaded; your draft is kept. Reopen the profile to review their changes before saving.");
      if (!response.ok) throw new Error(body.error ?? "Couldn't save.");
      setNotice(change.action === "add" ? `${body.added} added${body.skipped ? `; ${body.skipped} already in the board (not overwritten)` : ""}.` : "Saved.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }

  function card(p: PlanPerson) {
    return <PersonCard key={p.id} person={p} match={matches.get(p.id)!} disabled={busy} speakers={snapshot!.speakers}
      onEdit={() => { editVersion.current = snapshot!.version; setEditing(p); }} onChange={mutate} onDrag={setDragging} />;
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold text-fg">{view === "roster" ? "People roster" : "2026 session people"}</h2><p className="text-[12px] text-muted">{view === "roster" ? "Event associations, not attendance confirmations. No new invitations or website publication." : "Planning only · Not published or invited · Concurrent sessions, 3:30–4:45 p.m."}</p></div>
      <button className={BUTTON} type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(`${location.origin}/events/2026-annual-symposium/speaker`); setNotice("Submission link copied."); } catch { setError("Couldn't copy the link."); }
      }}><Copy size={14} />Copy submission link</button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-w-0 flex-1 items-center gap-2"><Search size={16} className="text-muted" /><input className={INPUT} aria-label="Search people" placeholder="Search name, company or tag" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <select aria-label="Filter by event" className={`${INPUT} sm:max-w-60`} value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}><option value="">All events</option>{Object.entries(ROSTER_EVENTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <button type="button" className={BUTTON} onClick={() => setShowArchive(!showArchive)}><Archive size={14} />Archived ({snapshot?.people.filter((p) => p.archived).length ?? 0})</button>
    </div>
    {error && <p role="alert" className="border-l-2 border-rose-500 pl-3 text-[13px] text-fg">{error}</p>}
    <p role="status" aria-live="polite" className="min-h-5 text-[12px] text-muted">{busy ? "Saving..." : notice}</p>
    {!snapshot ? <p className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" />Loading profiles...</p> : (
      <><div hidden={view !== "roster"}>
        <div className="mb-3 text-[12px] text-muted">{snapshot.people.filter(visible).length} people</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{snapshot.people.filter(visible).sort((a, b) => a.fullName.localeCompare(b.fullName)).map(card)}</div>
        {!snapshot.people.some(visible) && <p className="py-8 text-sm text-muted">No people match these filters.</p>}
      </div><div className={view === "roster" ? "hidden" : "grid items-start gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]"}>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
          <div className="flex border-b border-line">
            {([['paste', 'Paste a list'], ['2025', 'People library']] as const).map(([id, label]) => <button type="button" key={id} onClick={() => setSource(id)} aria-pressed={source === id} className={`flex-1 border-b-2 px-2 py-2 text-[13px] font-semibold ${source === id ? "border-brand text-fg" : "border-transparent text-muted"}`}>{label}</button>)}
          </div>
          {source === "paste" ? <>
            <label className="block space-y-1 text-[12px] text-muted"><span>Default session</span><select className={INPUT} value={defaultSession} onChange={(e) => { const next = e.target.value as PlanSession; setDefaultSession(next); defaultRef.current = next; setDrafts((d) => d.map((p) => ({ ...p, session: next }))); }}>{Object.entries(PLAN_SESSIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="block space-y-1 text-[12px] text-muted"><span>Names, companies and biographies</span><textarea className={`${INPUT} min-h-64 resize-y`} aria-label="Paste people list" maxLength={20000} value={text} placeholder={"Name, Company, Title, Bio, Email\n\nOr paste names and notes from an email."} onChange={(e) => { setText(e.target.value); setDrafts([]); setParsing(Boolean(e.target.value.trim())); }} /></label>
            <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={!text.trim() || parsing} onClick={() => setRetry((r) => r + 1)}><RefreshCw size={14} />Parse again</button><button type="button" className={BUTTON} disabled={parsing} onClick={() => setDrafts((d) => [...d, { fullName: "", organization: "", title: "", bio: "", email: "", session: defaultSession, key: crypto.randomUUID() }])}><Plus size={14} />Add person</button></div>
            {parseError && <p role="alert" className="text-[12px] text-fg">{parseError}</p>}
            {warnings.map((w) => <p key={w} className="text-[12px] text-muted">{w}</p>)}
          </> : <>
            <p className="text-[12px] text-muted">Unassigned people from symposium and Industry Insights records. Historical roles need reconfirmation.</p>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">{snapshot.people.filter((p) => visible(p) && !p.session).map(card)}
              {!snapshot.people.some((p) => visible(p) && !p.session) && <p className="text-[12px] text-muted">No unassigned profiles.</p>}
            </div>
          </>}
        </aside>
        <div className="min-w-0 space-y-5">
          {(parsing || drafts.length > 0) && <section className="space-y-3 border-b border-line pb-5" aria-label="Import preview">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[14px] font-semibold text-fg">{parsing ? "Separating people..." : `${drafts.length} people ready to review`}</h3><button type="button" className={BUTTON} disabled={parsing || busy || !drafts.length || drafts.some((d) => d.fullName.trim().length < 2)} onClick={async () => {
              if (await mutate({ action: "add", people: drafts.map((p) => ({ fullName: p.fullName, organization: p.organization, title: p.title, bio: p.bio, email: p.email, session: p.session })) })) { setDrafts([]); setText(""); }
            }}><Save size={14} />Save people</button></div>
            {parsing ? <Loader2 size={20} className="animate-spin text-muted" /> : <div className="grid gap-3 xl:grid-cols-2">{drafts.map((d) => <div key={d.key} className="rounded-lg border border-line bg-card-solid p-3"><div className="mb-2 flex justify-between text-[11px] text-muted"><span>Unsaved profile</span><button type="button" title="Discard draft" aria-label={`Discard ${d.fullName || "draft"}`} onClick={() => setDrafts((rows) => rows.filter((r) => r.key !== d.key))}><Trash2 size={14} /></button></div><PersonFields person={d} onChange={(p) => setDrafts((rows) => rows.map((r) => r.key === d.key ? { ...r, ...p } : r))} /><select className={`${INPUT} mt-2`} aria-label={`Session for ${d.fullName || "draft"}`} value={d.session} onChange={(e) => setDrafts((rows) => rows.map((r) => r.key === d.key ? { ...r, session: e.target.value as PlanSession } : r))}>{Object.entries(PLAN_SESSIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>)}</div>}
          </section>}
          <div className="grid gap-5 xl:grid-cols-2">
            {Object.entries(PLAN_SESSIONS).map(([id, title]) => {
              const people = snapshot.people.filter((p) => visible(p) && p.session === id);
              return <section key={id} aria-label={title} onDragOver={(e) => { if (dragging && !busy) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragging && !busy) void mutate({ action: "assign", id: dragging, session: id as PlanSession }); setDragging(null); }} className={`min-w-0 border-t-4 pt-3 ${id === "networking" ? "border-teal-600" : "border-amber-600"} ${dragging ? "bg-elevated/60" : ""}`}>
                <h3 className="min-h-12 text-[15px] font-bold text-fg">{title}<span className="ml-2 text-[12px] font-normal text-muted">{people.length}</span></h3>
                <div className="mt-3 min-h-32 space-y-2">{people.map(card)}{!people.length && <p className="border border-dashed border-line p-6 text-center text-[12px] text-muted">No people assigned</p>}</div>
              </section>;
            })}
          </div>
          {snapshot.people.some((p) => visible(p) && !p.session && p.source !== "2025") && <section><h3 className="mb-2 text-[14px] font-semibold text-fg">Unassigned</h3><div className="grid gap-2 xl:grid-cols-2">{snapshot.people.filter((p) => visible(p) && !p.session && p.source !== "2025").map(card)}</div></section>}
        </div>
      </div>
      {showArchive && <section><h3 className="mb-2 text-[14px] font-semibold text-fg">Archived profiles</h3>{snapshot.people.filter((p) => p.archived).map((p) => <div key={p.id} className="flex items-center justify-between border-b border-line py-2 text-[13px] text-fg"><span>{p.fullName}</span><button type="button" disabled={busy} className={BUTTON} onClick={() => void mutate({ action: "archive", id: p.id, archived: false })}><RefreshCw size={14} />Restore</button></div>)}</section>}</>
    )}
    <Dialog.Root open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-card-solid p-5">
      <div className="mb-4 flex justify-between"><Dialog.Title className="font-bold text-fg">Planning details</Dialog.Title><Dialog.Close aria-label="Close editor"><X size={18} /></Dialog.Close></div>
      <Dialog.Description className="mb-3 text-[12px] text-muted">Submitted details remain unchanged.</Dialog.Description>
      {editing && <><PersonFields person={editing} onChange={(p) => setEditing({ ...editing, ...p })} /><TagEditor key={editing.id} tags={editing.tags ?? []} onChange={(tags) => setEditing({ ...editing, tags })} />{error && <p role="alert" className="mt-2 text-[12px] text-fg">{error}</p>}<button type="button" className={`${BUTTON} mt-4`} disabled={busy} onClick={async () => { if (await mutate({ action: "edit", id: editing.id, person: editing }, editVersion.current)) setEditing(null); }}><Save size={14} />Save profile</button></>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

function PersonFields({ person, onChange }: { person: PersonInput; onChange: (value: Partial<PersonInput>) => void }) {
  return <div className="space-y-2">{([["fullName", "Name", 120], ["organization", "Company", 160], ["title", "Title / role", 160], ["email", "Email for matching", 254]] as const).map(([key, label, max]) => <label key={key} className="block text-[11px] text-muted">{label}<input className={INPUT} type={key === "email" ? "email" : "text"} maxLength={max} value={person[key]} onChange={(e) => onChange({ [key]: e.target.value })} /></label>)}<label className="block text-[11px] text-muted">Biography / notes<textarea className={`${INPUT} min-h-24`} maxLength={10000} value={person.bio} onChange={(e) => onChange({ bio: e.target.value })} /></label></div>;
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [value, setValue] = useState(tags.join(", "));
  return <label className="mt-3 block text-[11px] text-muted">Tags (comma-separated)
    <input className={INPUT} value={value} maxLength={2400} placeholder="Potential moderator, 2027 Symposium"
      onChange={(e) => { setValue(e.target.value); onChange([...new Set(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))]); }} />
  </label>;
}

function PersonCard({ person: p, match, speakers, disabled, onChange, onEdit, onDrag }: {
  person: PlanPerson; match: Match; speakers: PlanSnapshot["speakers"]; disabled: boolean;
  onChange: (change: PlanAction) => Promise<boolean>; onEdit: () => void; onDrag: (id: string | null) => void;
}) {
  const s = match.speaker;
  const [linkOpen, setLinkOpen] = useState(false);
  const [candidate, setCandidate] = useState("");
  const photo = s?.photoUrl || p.photoUrl;
  return <article className="min-w-0 rounded-lg border border-line bg-card-solid p-3 [overflow-wrap:anywhere]" draggable={!disabled} onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; onDrag(p.id); }} onDragEnd={() => onDrag(null)}>
    <div className="flex items-start gap-2">
      {/* Historical source photos and uploaded headshots use their original hosts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-md object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-elevated text-sm font-bold text-fg" aria-hidden>{p.fullName.split(/\s+/).map((n) => n[0]).slice(0, 2).join("")}</div>}
      <div className="min-w-0 flex-1"><h4 className="break-words text-[14px] font-semibold text-fg">{s?.fullName || p.fullName}</h4><p className="break-words text-[12px] text-muted">{s?.title || p.title}</p><p className="break-words text-[12px] text-fg">{s?.organization || p.organization}</p></div>
      <GripVertical size={15} className="shrink-0 cursor-grab text-muted" aria-label="Drag profile" />
    </div>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">{personEvents(p).map((event) => <span key={event} className="border-l-2 border-teal-600 pl-1.5">{ROSTER_EVENTS[event as keyof typeof ROSTER_EVENTS] ?? event}</span>)}{p.tags?.map((tag) => <span key={tag} className="border-l-2 border-amber-600 pl-1.5">{tag}</span>)}</div>
    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">{s ? <><Check size={12} />{s.submittedAt ? "Submission matched" : "Event profile linked"}{match.kind === "manual" ? " manually" : ""}</> : match.kind === "review" ? "Possible submission match: review needed" : "Awaiting submission"}</p>
    {p.source === "2025" && <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-muted underline">2025 profile · verify current details</a>}
    {p.source !== "2025" && p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-muted underline">Official event source</a>}
    <label className="mt-2 block text-[11px] text-muted">Session<select className={INPUT} aria-label={`Session for ${p.fullName}`} value={p.session ?? ""} disabled={disabled} onChange={(e) => void onChange({ action: "assign", id: p.id, session: e.target.value as PlanSession || null })}><option value="">Unassigned</option>{Object.entries(PLAN_SESSIONS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
    <details className="mt-2 text-[12px] text-muted"><summary className="cursor-pointer font-medium text-fg">Profile details</summary><p className="mt-2 whitespace-pre-wrap break-words">{s?.bio || p.bio || "No biography yet."}</p>{s?.sessionTitle && <p className="mt-2">Session title: {s.sessionTitle}</p>}{s?.submittedAt && <p className="mt-2">Submitted {new Date(s.submittedAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}</p>}{p.email && <p className="mt-2 break-all">{p.email}</p>}{s && p.bio && <details className="mt-2"><summary>Original planning notes</summary><p className="whitespace-pre-wrap break-words">{p.bio}</p></details>}</details>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button className={BUTTON} type="button" disabled={disabled} title="Edit planning details" aria-label={`Edit ${p.fullName}`} onClick={onEdit}><Pencil size={13} /></button><button className={BUTTON} type="button" disabled={disabled} title="Archive profile" aria-label={`Archive ${p.fullName}`} onClick={() => void onChange({ action: "archive", id: p.id, archived: true })}><Archive size={13} /></button>{s ? <button className={BUTTON} type="button" disabled={disabled} onClick={() => void onChange({ action: "link", id: p.id, speakerId: null })}><Unlink size={13} />Unlink</button> : <button className={BUTTON} type="button" onClick={() => setLinkOpen(!linkOpen)}>Match submission</button>}</div>
    {linkOpen && !s && <div className="mt-3 space-y-2 border-t border-line pt-2"><label className="block text-[11px] text-muted">Existing submission<select className={INPUT} value={candidate} onChange={(e) => setCandidate(e.target.value)}><option value="">Choose a person</option>{speakers.filter((s) => s.submittedAt).map((s) => <option value={s.id} key={s.id}>{s.fullName} · {s.organization} · {s.contactEmail || new Date(s.submittedAt!).toLocaleDateString("en-CA")}</option>)}</select></label><button className={BUTTON} type="button" disabled={!candidate || disabled} onClick={async () => { if (await onChange({ action: "link", id: p.id, speakerId: candidate })) setLinkOpen(false); }}><Check size={13} />Confirm match</button></div>}
  </article>;
}
