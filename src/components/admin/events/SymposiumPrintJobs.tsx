"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, CheckCheck, Copy, Download, FileUp, Loader2, Pencil, Plus, Printer, RefreshCw, Save, Search, X } from "lucide-react";
import { ATTENTION_LABELS, attentionItems, type AttentionKind, type BadgeEdit, type PrintAction, type PrintJob, type PrintPerson, type PrintWorkspace } from "@/lib/events/print-jobs";

const API = "/api/admin/symposium-print";
const HERE = "/admin/workspace/symposium-2026/print";
const INPUT = "w-full min-w-0 rounded-md border border-line bg-card-solid px-2.5 py-2 text-[13px] text-fg focus-visible:outline-2 focus-visible:outline-brand";
const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";
const PRIMARY = BUTTON + " bg-brand text-white hover:brightness-110";
const eligible = (p: PrintPerson) => ["approved", "going", "checked_in"].includes(p.status);
const blocked = (p: PrintPerson) => p.issues.some(issue => !issue.includes("additional guests"));
const date = (v: string) => new Date(v).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const printLabels = { unprinted: "Not printed", queued: "Queued", printed: "Printed", changed: "Changed since print" };
type View = "badges" | "tents" | "agenda" | "queue";
type Edit = { id: string | null; badge: BadgeEdit; email: string; version: string | null };

export function SymposiumPrintJobs() {
  const [snapshot, setSnapshot] = useState<PrintWorkspace | null>(null), current = useRef<PrintWorkspace | null>(null);
  const [busy, setBusy] = useState(false), working = useRef(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("badges");
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [allStatuses, setAllStatuses] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [editing, setEditing] = useState<Edit | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null), [printIds, setPrintIds] = useState<string[]>([]);
  const [label, setLabel] = useState(""), [assignedTo, setAssignedTo] = useState(""), [notes, setNotes] = useState("");
  const [copies, setCopies] = useState(22), [allowReprint, setAllowReprint] = useState(false);
  const [skip, setSkip] = useState(0), [offsetX, setOffsetX] = useState(0), [offsetY, setOffsetY] = useState(0);
  const [documents, setDocuments] = useState<{ tentText: string; agendaText: string; version: string | null } | null>(null);
  const csvInput = useRef<HTMLInputElement>(null), designInput = useRef<HTMLInputElement>(null);

  function accept(next: PrintWorkspace) { current.current = next; setSnapshot(next); }
  function chooseJob(job: PrintJob) {
    setActiveJob(job.id); setPrintIds(job.badges.filter(b => !job.printedIds.includes(b.id)).map(b => b.id));
  }
  async function mutate(change: PrintAction, version = current.current?.version ?? null) {
    if (working.current) return false;
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, change }) });
      const body = await response.json();
      if (body.snapshot) accept(body.snapshot);
      if (response.status === 409) throw new Error("A colleague changed Print Jobs. Their changes are loaded; reopen your draft before saving it.");
      if (!response.ok) throw new Error(body.error ?? "Could not save. Please retry.");
      if (body.jobId) {
        chooseJob(body.snapshot.board.jobs.find((j: PrintJob) => j.id === body.jobId));
        setView("queue"); setSelected([]); setLabel("");
      }
      setNotice(change.action === "sync" ? "Luma guest list updated." : change.action === "import" ? "Luma CSV imported. Badge edits and print history are preserved." : change.action === "printed" ? "Print confirmation saved." : change.action === "create" ? "PDF saved to the shared print queue." : "Saved.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { working.current = false; setBusy(false); }
  }
  async function load() {
    if (working.current) return;
    working.current = true;
    try {
      const response = await fetch(API, { cache: "no-store" }), body = await response.json();
      setError("");
      if (!response.ok) throw new Error(body.error ?? "Could not load Print Jobs.");
      accept(body);
      const id = new URLSearchParams(window.location.search).get("job");
      const job = body.board.jobs.find((j: PrintJob) => j.id === id);
      if (job) { chooseJob(job); setView("queue"); }
      working.current = false;
      if (!body.board.syncedAt && body.autoSyncAvailable) await mutate({ action: "sync" }, body.version);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Print Jobs."); }
    finally { working.current = false; setBusy(false); }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load awaits the network before updating state.
    void load();
    const timer = setInterval(() => { if (!document.hidden && !working.current && current.current?.autoSyncAvailable) void mutate({ action: "sync" }); }, 300000);
    return () => clearInterval(timer);
    // Requests use the latest version through current, not the initial render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(file: File) {
    if (working.current || !snapshot || (view !== "tents" && view !== "agenda")) return;
    if (file.size > 2_000_000) { setError("Choose a PDF smaller than 2 MB."); return; }
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const data = new FormData(); data.set("file", file); data.set("kind", view); data.set("version", snapshot.version ?? "null");
      const response = await fetch(API, { method: "POST", body: data }), body = await response.json();
      if (body.snapshot) accept(body.snapshot);
      if (!response.ok) throw new Error(body.error ?? (response.status === 409 ? "A colleague changed this design. Review it before uploading again." : "Could not upload the PDF."));
      setNotice("Design saved. Existing batch PDFs are unchanged.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload the PDF."); }
    finally { working.current = false; setBusy(false); }
  }
  if (!snapshot) return <div className="py-8 text-fg">{error ? <><p role="alert" className="mb-3 text-red-700 dark:text-red-300">{error}</p><button type="button" className={BUTTON} onClick={() => void load()}>Retry</button></> : <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading Print Jobs</span>}</div>;

  const { board, people } = snapshot;
  const approved = people.filter(eligible);
  const filtered = people.filter(p => (allStatuses || eligible(p)) && (!query || [p.name, p.email, p.organization, p.extra, p.sourceName].join(" ").toLowerCase().includes(query.toLowerCase())) && (filter === "all" || (filter === "review" ? p.issues.length > 0 : p.printStatus === filter)));
  const job = board.jobs.find(j => j.id === activeJob);
  const documentDraft = documents ?? { tentText: board.tentText, agendaText: board.agendaText, version: snapshot.version };
  const template = view === "tents" ? board.tentTemplate : board.agendaTemplate;
  const kind = view === "tents" ? "tents" : view === "agenda" ? "agenda" : "badges";
  const draftPerson = editing ? people.find(p => p.id === editing.id) : null;
  function openPerson(p?: PrintPerson) {
    setEditing({ id: p?.id ?? null, badge: { name: p?.name ?? "", organization: p?.organization ?? "", extra: p?.extra ?? "", reviewed: !!(p && !blocked(p)) }, email: p?.email ?? "", version: snapshot!.version });
  }
  const makeJob = () => mutate({ action: "create", kind, label: label.trim() || (kind === "badges" ? "Badge" : kind === "tents" ? "Table tent" : "Agenda") + " batch " + (board.jobs.length + 1), ids: selected, copies, assignedTo, notes, allowReprint, skip, offsetX, offsetY });
  async function copyLink(id: string) {
    try { await navigator.clipboard.writeText(location.origin + HERE + "?job=" + id); setNotice("Admin print-job link copied."); }
    catch { setError("Could not copy the link."); }
  }

  const batchControls = <form className="space-y-3 border-t border-line pt-4" onSubmit={e => { e.preventDefault(); void makeJob(); }}>
    <h3 className="text-sm font-semibold">New {kind === "badges" ? "badge" : kind === "tents" ? "table tent" : "agenda"} batch</h3>
    <label className="block text-xs">Batch name<input className={INPUT + " mt-1"} value={label} onChange={e => setLabel(e.target.value)} placeholder={"Batch " + (board.jobs.length + 1)} maxLength={120} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs">Print colleague<input className={INPUT + " mt-1"} value={assignedTo} onChange={e => setAssignedTo(e.target.value)} maxLength={200} /></label>
      <label className="text-xs">{kind === "badges" ? "Skip used positions" : "Copies"}<input className={INPUT + " mt-1"} type="number" min={kind === "badges" ? 0 : 1} max={kind === "badges" ? 5 : 500} value={kind === "badges" ? skip : copies} onChange={e => kind === "badges" ? setSkip(Number(e.target.value)) : setCopies(Number(e.target.value))} /></label>
    </div>
    {kind === "badges" && <>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">Horizontal offset (mm)<input className={INPUT + " mt-1"} type="number" min={-5} max={5} step={0.5} value={offsetX} onChange={e => setOffsetX(Number(e.target.value))} /></label>
        <label className="text-xs">Vertical offset (mm)<input className={INPUT + " mt-1"} type="number" min={-5} max={5} step={0.5} value={offsetY} onChange={e => setOffsetY(Number(e.target.value))} /></label>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={allowReprint} onChange={e => setAllowReprint(e.target.checked)} /> Reprint printed or queued badges</label>
    </>}
    <label className="block text-xs">Print notes<textarea className={INPUT + " mt-1"} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} /></label>
    <div className="text-xs text-muted">{kind === "badges" ? "Avery 5393 · Letter · 100% actual size · " + selected.length + " selected" : "Letter · " + copies + " copies"}</div>
    <button className={PRIMARY} disabled={busy || (kind === "badges" && !selected.length)} type="submit">{busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Create PDF batch</button>
  </form>;

  return <div className="mx-auto w-full max-w-[1600px] pb-12 text-fg">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Print materials" className="flex flex-wrap gap-1 border-b border-line">{([["badges", "Name badges"], ["tents", "Table tents"], ["agenda", "Agenda"], ["queue", "Print queue (" + board.jobs.filter(j => j.status === "ready").length + ")"]] as [View, string][]).map(([key, title]) => <button type="button" key={key} aria-current={view === key ? "page" : undefined} className={"border-b-2 px-3 py-2 text-sm font-semibold " + (view === key ? "border-brand" : "border-transparent text-muted")} onClick={() => { setView(key); setLabel(""); if (key === "tents") setCopies(22); if (key === "agenda") setCopies(1); }}>{title}</button>)}</nav>
      <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted">{board.syncedAt ? (board.syncSource === "csv" || !snapshot.autoSyncAvailable ? "CSV imported " : "Luma synced ") + date(board.syncedAt) : "No guest list imported"}</span><button type="button" className={BUTTON} disabled={busy} onClick={() => snapshot.autoSyncAvailable ? void mutate({ action: "sync" }) : csvInput.current?.click()}>{snapshot.autoSyncAvailable ? <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> : <FileUp size={14} />} {snapshot.autoSyncAvailable ? "Sync Luma" : "Import Luma CSV"}</button></div>
    </div>
    {!snapshot.autoSyncAvailable && <p className="mb-4 border-l-2 border-amber-500 pl-3 text-sm">Automatic Luma sync is not connected. <a className="font-semibold underline underline-offset-2" href="https://luma.com/event/manage/evt-az4yQOZR33DBiid/guests" target="_blank" rel="noreferrer">Export the current guest list from Luma</a>, then import the CSV.</p>}
    {error && <p role="alert" className="mb-4 rounded-md border border-red-400/50 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">{error}</p>}
    {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
    <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" aria-label="Import Luma CSV" onChange={async e => { const file = e.target.files?.[0]; if (file) { if (file.size > 1000000) setError("Choose a CSV smaller than 1 MB."); else await mutate({ action: "import", csv: await file.text() }); } e.target.value = ""; }} />
    <input ref={designInput} type="file" accept=".pdf,application/pdf" className="hidden" aria-label="Upload print design PDF" onChange={async e => { const file = e.target.files?.[0]; if (file) await upload(file); e.target.value = ""; }} />
    {view === "badges" && <>
      <BadgeAttention people={people} busy={busy}
        onOpen={(id) => { const p = people.find((x) => x.id === id); if (p) openPerson(p); }}
        onReprint={(id) => { setAllowReprint(true); setSelected((s) => (s.includes(id) ? s : [...s, id])); }} />
      <div className="mb-4 flex flex-wrap gap-x-7 gap-y-2 border-b border-line pb-3 text-sm">
        {[["Approved registrations", approved.length], ["Not printed", approved.filter(p => p.printStatus === "unprinted").length], ["Needs review", approved.filter(blocked).length], ["Queued", approved.filter(p => p.printStatus === "queued").length], ["Printed", approved.filter(p => p.printStatus === "printed").length], ["Changed", approved.filter(p => p.printStatus === "changed").length], ["Additional unnamed tickets", approved.reduce((n, p) => n + Math.max(0, p.tickets - 1), 0)]].map(([label, count]) => <span key={String(label)}><strong className="mr-1.5 text-base">{count}</strong><span className="text-muted">{label}</span></span>)}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[180px] flex-1"><Search size={14} className="absolute left-2.5 top-3 text-muted" /><input aria-label="Search badge guests" className={INPUT + " pl-8"} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, email or organization" /></label>
            <select aria-label="Badge status filter" className={INPUT + " !w-auto"} value={filter} onChange={e => setFilter(e.target.value)}>{[["all", "All badges"], ["review", "Needs review"], ...Object.entries(printLabels)].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <button type="button" className={BUTTON} onClick={() => csvInput.current?.click()} disabled={busy}><FileUp size={14} /> Import CSV</button>
            <button type="button" className={BUTTON} onClick={() => openPerson()}><Plus size={14} /> Add person</button>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>{filtered.length} guests · {selected.length} selected</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={allStatuses} onChange={e => setAllStatuses(e.target.checked)} /> Include pending and cancelled</label>
              <button className="font-semibold underline underline-offset-2" type="button" onClick={() => setSelected(approved.filter(p => !blocked(p) && ["unprinted", "changed"].includes(p.printStatus)).map(p => p.id))}>Select unprinted / changed</button>
              <button type="button" onClick={() => setSelected([])}>Clear</button>
            </div>
          </div>
          <div className="overflow-auto border-y border-line">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead className="bg-elevated text-xs text-muted"><tr>
                <th className="w-9 p-2"><input aria-label="Select visible approved guests" type="checkbox" checked={filtered.some(eligible) && filtered.filter(eligible).every(p => selected.includes(p.id))} onChange={e => { const ids = filtered.filter(eligible).map(p => p.id); setSelected(e.target.checked ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id))); }} /></th>
                <th className="p-2">Print name / registration</th><th className="p-2">Organization / badge line</th><th className="p-2">Print status</th>
              </tr></thead>
              <tbody>{filtered.map(p => <tr key={p.id} className={"border-t border-line " + (editing?.id === p.id ? "bg-elevated" : "hover:bg-elevated/60")}>
                <td className="p-2 align-top"><input aria-label={"Select " + p.name} disabled={!eligible(p)} type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} /></td>
                <td className="max-w-[250px] p-2 align-top">
                  {editing?.id === p.id ? <>
                    <div className="flex min-w-0 items-center gap-1">
                      <input form="print-badge-editor" className={INPUT + " flex-1"} aria-label={"Print name for " + p.sourceName} aria-describedby={error ? "print-name-error" : undefined} autoFocus required minLength={2} maxLength={160} value={editing.badge.name} onChange={e => setEditing({ ...editing, badge: { ...editing.badge, name: e.target.value } })} />
                      <button type="submit" form="print-badge-editor" className={BUTTON + " size-8 shrink-0 !p-0"} disabled={busy} title="Save print name" aria-label={"Save print name for " + p.sourceName}><Save size={14} /></button>
                      <button type="button" className={BUTTON + " size-8 shrink-0 !p-0"} disabled={busy} title="Cancel name edit" aria-label={"Cancel name edit for " + p.sourceName} onClick={() => setEditing(null)}><X size={14} /></button>
                    </div>
                    {error && <p id="print-name-error" className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>}
                  </> : <div className="flex items-start gap-1">
                    <button className="min-w-0 flex-1 text-left font-semibold underline decoration-transparent underline-offset-2 hover:decoration-current" type="button" disabled={busy} onClick={() => openPerson(p)}>{p.name || "Name required"}</button>
                    <button type="button" className={BUTTON + " size-8 shrink-0 !p-0"} disabled={busy} title="Edit print name" aria-label={"Edit print name for " + p.name} onClick={() => openPerson(p)}><Pencil size={14} /></button>
                  </div>}
                  <div className="break-all text-[11px] text-muted">{p.email}</div>
                  {p.name !== p.sourceName && <div className="text-[11px] text-muted">Luma: {p.sourceName}</div>}
                  {!eligible(p) && <div className="text-[11px]">{p.status.replace(/_/g, " ")}</div>}
                  {p.issues.map(issue => <div className="mt-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200" key={issue}>{issue}</div>)}
                </td>
                <td className="max-w-[240px] p-2 align-top"><button type="button" className="text-left" onClick={() => openPerson(p)}>{p.organization || <span className="text-muted">Organization required</span>}</button>{p.extra && <div className="whitespace-pre-line text-[11px] text-muted">{p.extra}</div>}</td>
                <td className="p-2 align-top text-xs"><span className={"inline-block border-l-2 pl-2 " + (p.printStatus === "printed" ? "border-emerald-600" : p.printStatus === "queued" ? "border-sky-600" : p.printStatus === "changed" ? "border-amber-600" : "border-line")}>{printLabels[p.printStatus]}</span></td>
              </tr>)}</tbody>
            </table>
            {!filtered.length && <p className="py-10 text-center text-sm text-muted">No guests in this view.</p>}
          </div>
        </section>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-5">
          {editing ? <form id="print-badge-editor" className="space-y-3" onSubmit={async e => {
            e.preventDefault();
            const ok = await mutate(editing.id ? { action: "edit", id: editing.id, badge: editing.badge } : { action: "add", badge: editing.badge, email: editing.email }, editing.version);
            if (ok) setEditing(null);
          }}>
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{editing.id ? "Badge details" : "Add person"}</h2><button type="button" title="Close badge editor" aria-label="Close badge editor" className={BUTTON} onClick={() => setEditing(null)}><X size={14} /></button></div>
            {draftPerson && <p className="break-all text-xs text-muted">Source: {draftPerson.sourceName} · {draftPerson.email}</p>}
            {draftPerson && draftPerson.sourceOrganization !== draftPerson.organization && <p className="text-xs text-muted">Registration organization: {draftPerson.sourceOrganization || "Not supplied"}</p>}
            {([["name", "Full name"], ["organization", "Organization"], ["extra", "Additional badge line"]] as const).map(([key, label]) => <label key={key} className="block text-xs">{label}
              {key === "extra" ? <textarea className={INPUT + " mt-1"} rows={2} value={editing.badge[key]} maxLength={200} onChange={e => setEditing({ ...editing, badge: { ...editing.badge, [key]: e.target.value } })} /> : <input className={INPUT + " mt-1"} required={key === "name"} minLength={key === "name" ? 2 : undefined} maxLength={key === "name" ? 160 : 250} value={editing.badge[key]} onChange={e => setEditing({ ...editing, badge: { ...editing.badge, [key]: e.target.value } })} />}
            </label>)}
            {!editing.id && <label className="block text-xs">Email<input type="email" className={INPUT + " mt-1"} value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} /></label>}
            {draftPerson?.suggestion && blocked(draftPerson) && <button type="button" className={BUTTON} onClick={() => setEditing({ ...editing, badge: { ...editing.badge, name: draftPerson.suggestion! } })}>Use email suggestion: {draftPerson.suggestion}</button>}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.badge.extra.split("\n").includes("HQP Representative")} onChange={e => setEditing({ ...editing, badge: { ...editing.badge, extra: e.target.checked ? [editing.badge.extra, "HQP Representative"].filter(Boolean).join("\n") : editing.badge.extra.split("\n").filter(line => line !== "HQP Representative").join("\n") } })} /> HQP Representative</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.badge.reviewed} onChange={e => setEditing({ ...editing, badge: { ...editing.badge, reviewed: e.target.checked } })} /> Name and organization checked</label>
            <button type="submit" className={PRIMARY} disabled={busy}><Save size={14} /> Save badge</button>
            <div className="aspect-[4/3] overflow-hidden border border-line bg-white p-4 text-center text-black">
              <Image src="/biohubnet-logo.png" alt="BioHubNet" width={140} height={40} unoptimized className="mx-auto mb-5 h-8 max-w-[140px] object-contain" />
              <p className="break-words text-xl font-semibold leading-tight">{editing.badge.name || "Full name"}</p>
              <p className="mt-3 break-words text-[13px]">{editing.badge.organization}</p>
              <p className="mt-2 whitespace-pre-line break-words text-[12px] text-teal-800">{editing.badge.extra}</p>
            </div>
          </form> : <div className="border-b border-line pb-3"><h2 className="text-sm font-semibold">Avery 5393</h2><p className="mt-1 text-xs text-muted">4 × 3 inches · 6 per Letter sheet · Draft layout</p></div>}
          {batchControls}
        </aside>
      </div>
    </>}
    {(view === "tents" || view === "agenda") && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold">{view === "tents" ? "Table tent design" : "Symposium agenda"}</h2><p className="mt-1 text-xs text-muted">{template ? template.name : "Draft layout · final artwork pending"}</p></div>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => designInput.current?.click()}><FileUp size={14} /> {template ? "Replace PDF design" : "Upload PDF design"}</button>
        </div>
        {template ? <div className="border-y border-line py-5">
          <p className="text-sm">{template.name}</p>
          <button type="button" className={BUTTON + " mt-3"} disabled={busy} onClick={() => void mutate({ action: "documents", tentText: documentDraft.tentText, agendaText: documentDraft.agendaText, clearTemplate: view }, documentDraft.version)}><X size={14} /> Remove design from future batches</button>
        </div> : <label className="block text-xs">{view === "tents" ? "Card wording" : "Agenda text"}
          <textarea className={INPUT + " mt-2 font-mono leading-relaxed"} rows={view === "agenda" ? 22 : 8} value={view === "tents" ? documentDraft.tentText : documentDraft.agendaText} maxLength={view === "tents" ? 2000 : 30000} onChange={e => setDocuments({ ...documentDraft, [view === "tents" ? "tentText" : "agendaText"]: e.target.value })} />
        </label>}
        <div className="flex gap-2"><button className={PRIMARY} type="button" disabled={busy || !documents} onClick={async () => { if (await mutate({ action: "documents", tentText: documentDraft.tentText, agendaText: documentDraft.agendaText }, documentDraft.version)) setDocuments(null); }}><Save size={14} /> Save wording</button><button type="button" className={BUTTON} disabled={!documents} onClick={() => setDocuments(null)} title="Reset text draft" aria-label="Reset text draft"><X size={14} /></button></div>
      </section>
      <aside>{batchControls}</aside>
    </div>}
    {view === "queue" && <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.3fr)]">
      <section>{board.jobs.length ? board.jobs.map(j => <button key={j.id} type="button" onClick={() => chooseJob(j)} className={"block w-full border-b border-line px-3 py-4 text-left " + (activeJob === j.id ? "bg-elevated" : "hover:bg-elevated/60")}>
        <span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{j.label}</strong><span className="text-xs capitalize">{j.status}</span></span>
        <span className="mt-1 block text-xs text-muted">{j.kind === "badges" ? j.badges.length + " badges · " + j.printedIds.length + " printed" : j.copies + " copies · " + (j.kind === "tents" ? "table tents" : "agenda")} · {date(j.createdAt)}</span>
        {j.assignedTo && <span className="mt-1 block text-xs">Print colleague: {j.assignedTo}</span>}
      </button>) : <p className="py-10 text-sm text-muted">No print batches yet.</p>}</section>
      <section>{job ? <div className="space-y-4">
        <div><h2 className="text-base font-semibold">{job.label}</h2><p className="mt-1 text-xs text-muted">Prepared by {job.createdBy} · {date(job.createdAt)}</p></div>
        <div className="flex flex-wrap gap-2">
          <a className={PRIMARY} href={API + "/" + job.id + "/pdf"}><Download size={14} /> Download PDF</a>
          <button type="button" className={BUTTON} onClick={() => void copyLink(job.id)}><Copy size={14} /> Copy colleague link</button>
          {job.status === "ready" && <button type="button" className={BUTTON} disabled={busy} onClick={() => void mutate({ action: "cancel", jobId: job.id })}><X size={14} /> Cancel remaining print</button>}
        </div>
        <dl className="grid grid-cols-2 gap-3 border-y border-line py-3 text-xs">
          <div><dt className="text-muted">Stock</dt><dd className="mt-1">{job.kind === "badges" ? "Avery 5393 · Letter · 100% actual size" : "Letter · " + job.copies + " copies"}</dd></div>
          <div><dt className="text-muted">Print colleague</dt><dd className="mt-1">{job.assignedTo || "Unassigned"}</dd></div>
        </dl>
        {job.notes && <p className="whitespace-pre-wrap text-sm">{job.notes}</p>}
        {job.printedAt && <p className="text-xs text-muted">Last print confirmation: {job.printedBy} · {date(job.printedAt)}</p>}
        {job.kind === "badges" && <>
          <div className="flex items-center justify-between text-xs"><strong>{job.printedIds.length} / {job.badges.length} printed</strong>{job.status === "ready" && <button type="button" className="underline" onClick={() => setPrintIds(job.badges.filter(b => !job.printedIds.includes(b.id)).map(b => b.id))}>Select all remaining</button>}</div>
          <div className="max-h-[500px] overflow-auto border-y border-line">{job.badges.map(b => <label key={b.id} className="flex items-start gap-3 border-b border-line py-2 text-sm">
            {job.printedIds.includes(b.id) ? <Check size={16} className="mt-0.5 text-emerald-700 dark:text-emerald-300" /> : <input type="checkbox" disabled={job.status !== "ready"} className="mt-1" checked={printIds.includes(b.id)} onChange={e => setPrintIds(e.target.checked ? [...printIds, b.id] : printIds.filter(id => id !== b.id))} />}
            <span><strong>{b.name}</strong><span className="block text-xs text-muted">{b.organization}{b.extra ? " · " + b.extra : ""}</span></span>
          </label>)}</div>
        </>}
        {job.status === "ready" && <button className={PRIMARY} type="button" disabled={busy || (job.kind === "badges" && !printIds.some(id => !job.printedIds.includes(id)))} onClick={() => void mutate({ action: "printed", jobId: job.id, ids: printIds.filter(id => !job.printedIds.includes(id)) })}>
          <CheckCheck size={14} /> {job.kind === "badges" ? "Confirm selected badges printed" : "Confirm " + job.copies + " copies printed"}
        </button>}
      </div> : <p className="py-10 text-sm text-muted">Choose a batch.</p>}</section>
    </div>}
  </div>;
}

/**
 * Name badges that need someone before they print: details to check,
 * badges changed since printing, badges for people no longer registered,
 * and extra tickets without names — grouped, with the action for each.
 */
function BadgeAttention({ people, busy, onOpen, onReprint }: { people: PrintPerson[]; busy: boolean; onOpen: (id: string) => void; onReprint: (id: string) => void }) {
  const items = attentionItems(people);
  if (!items.length) {
    return <p className="mb-4 border-l-2 border-emerald-600 pl-3 text-sm">Nothing needs attention: every approved badge is ready to print.</p>;
  }
  const groups = (Object.keys(ATTENTION_LABELS) as AttentionKind[]).map((kind) => ({ kind, rows: items.filter((i) => i.kind === kind) })).filter((g) => g.rows.length);
  return <section aria-label="Badges that need attention" className="mb-5 border-l-2 border-amber-500 bg-amber-500/[0.06] p-4">
    <h2 className="text-sm font-semibold">Needs attention · {items.length}</h2>
    <div className="mt-2 grid gap-4 lg:grid-cols-2">
      {groups.map(({ kind, rows }) => <details key={kind} open={rows.length <= 8} className="min-w-0">
        <summary className="cursor-pointer text-[13px] font-semibold">{ATTENTION_LABELS[kind].title} ({rows.length})</summary>
        <ul className="mt-1.5 divide-y divide-line border-y border-line">
          {rows.map((r) => <li key={kind + r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
            <span className="min-w-0 flex-1"><strong>{r.name || "Name required"}</strong><span className="block text-xs text-amber-800 dark:text-amber-200">{r.detail}</span></span>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => (kind === "reprint" ? onReprint(r.id) : onOpen(r.id))}>
              {kind === "reprint" ? <Printer size={13} /> : <Pencil size={13} />} {ATTENTION_LABELS[kind].action}
            </button>
          </li>)}
        </ul>
      </details>)}
    </div>
  </section>;
}
