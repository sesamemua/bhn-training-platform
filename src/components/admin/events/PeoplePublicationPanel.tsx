"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Eye, Globe, Loader2, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { WEBSITE_SESSIONS, type PublicProfileInput, type PublicationState, type PublicationAction } from "@/lib/events/people-publication";
import { matchPlanPeople, type PlanPerson, type PlanSnapshot } from "@/lib/events/people-plan";

const API = "/api/admin/symposium-people/publication";
const INPUT = "w-full min-w-0 rounded-md border border-line bg-card-solid px-3 py-2 text-sm text-fg";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg hover:bg-elevated disabled:opacity-40";
type Data = { state: PublicationState; version: string | null; hashes: Record<string, string>; roster: PlanSnapshot };
type Confirmation = { action: "approve" | "unpublish" | "initialize"; id?: string };

async function readPublication(): Promise<Data> {
  const response = await fetch(API, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

export function sourcePublicProfile(person: PlanPerson, roster: PlanSnapshot): PublicProfileInput {
  const source = matchPlanPeople(roster.people, roster.speakers).get(person.id)?.speaker;
  return {
    fullName: source?.fullName || person.fullName, title: source?.title || person.title,
    organization: source?.organization || person.organization,
    // Freeform roster biographies can be internal planning notes. Never prefill those.
    bio: source?.bio ?? (person.source === "2025" ? person.bio : ""),
    photoUrl: source?.photoUrl || person.photoUrl || null, linkedinUrl: null, links: [], placements: [],
  };
}

export default function PeoplePublicationPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState("");
  const [editor, setEditor] = useState<PublicProfileInput | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [consent, setConsent] = useState(false);
  const saved = data?.state.drafts.find((p) => p.id === selected);
  const approved = data?.state.approved.find((p) => p.id === selected);
  const dirty = Boolean(editor && JSON.stringify(editor) !== JSON.stringify(saved?.profile));

  async function load() {
    try {
      const body = await readPublication();
      setData(body); setSelected(""); setEditor(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load website publishing."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    readPublication().then((body) => { if (!cancelled) setData(body); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load website publishing."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  async function mutate(change: PublicationAction) {
    if (!data || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: data.version, change }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save.");
      setData({ ...data, ...body });
      if (change.action === "save") setEditor(body.state.drafts.find((p: { id: string }) => p.id === change.id).profile);
      setConfirmation(null); setConsent(false);
      setNotice(change.action === "save" ? "Public draft saved. Nothing new has been published." : change.action === "approve" ? (body.state.initialized ? "Approved snapshot published to the website feed." : "Profile approved. Website feed remains inactive.") : change.action === "unpublish" ? "Profile removed from the approved feed." : "Approved website feed activated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  function select(person: PlanPerson) {
    setSelected(person.id); setError(""); setNotice("");
    setEditor(structuredClone(data!.state.drafts.find((p) => p.id === person.id)?.profile ?? sourcePublicProfile(person, data!.roster)));
  }
  function confirm(value: Confirmation) { setConsent(false); setConfirmation(value); }
  const update = (values: Partial<PublicProfileInput>) => setEditor((p) => p ? { ...p, ...values } : p);

  return <section className="space-y-5 [overflow-wrap:anywhere]" aria-label="Website publishing">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-fg">Website publishing</h2><p className="mt-1 text-sm text-muted">{data?.state.initialized ? `Feed active · Revision ${data.state.revision}` : "Feed inactive · Existing website content is unchanged"}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={busy || dirty} onClick={() => { setBusy(true); setError(""); void load(); }}><RefreshCw size={15} />Reload</button>
        {data && !data.state.initialized && <button type="button" className={BUTTON} disabled={busy || dirty || !data.state.approved.length} onClick={() => confirm({ action: "initialize" })}><Globe size={15} />Activate approved list</button>}</div>
    </div>
    {error && <p role="alert" className="border-l-2 border-rose-600 pl-3 text-sm text-fg">{error}</p>}
    <p role="status" className="min-h-5 text-sm text-muted">{busy ? "Working..." : notice}</p>
    {!data ? <p className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" />Loading website drafts...</p> :
      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
          <label className="flex items-center gap-2"><Search size={16} className="text-muted" /><input className={INPUT} aria-label="Search website profiles" placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <p className="text-xs text-muted">{data.state.approved.length} approved · {data.state.drafts.length} saved drafts</p>
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-line">
            {data.roster.people.filter((p) => !p.archived || data.state.approved.some((a) => a.id === p.id)).filter((p) => `${p.fullName} ${p.organization}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.fullName.localeCompare(b.fullName)).map((p) => {
              const live = data.state.approved.find((a) => a.id === p.id);
              const draft = data.state.drafts.find((a) => a.id === p.id);
              const changed = live && draft && JSON.stringify(live.profile) !== JSON.stringify(draft.profile);
              return <button key={p.id} type="button" disabled={busy || (dirty && selected !== p.id)} className={`block w-full px-3 py-3 text-left disabled:opacity-40 ${selected === p.id ? "bg-elevated" : "hover:bg-elevated/50"}`} aria-current={selected === p.id ? "true" : undefined} onClick={() => select(p)}>
                <span className="block text-sm font-semibold text-fg">{p.fullName}{p.archived ? " (archived)" : ""}</span><span className="block text-xs text-muted">{p.organization}</span>
                <span className="mt-1 block text-xs text-muted">{live ? (data.state.initialized ? "Published" : "Approved, awaiting activation") : draft ? "Draft, not approved" : "Not prepared"}{changed ? " · Changes awaiting approval" : ""}</span>
              </button>;
            })}
          </div>
        </aside>
        {!editor ? <p className="py-6 text-sm text-muted">No profile selected.</p> : <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-fg">Public profile draft</h3><button type="button" className={BUTTON} disabled={busy} onClick={() => { setSelected(""); setEditor(null); }}><X size={14} />Close / discard unsaved</button></div>
          <p className="text-xs text-muted">Only the public fields below are eligible for approval. Emails and planning notes are excluded.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["fullName", "Name", 120], ["title", "Title / role", 160], ["organization", "Organization", 160]] as const).map(([key, label, max]) => <label key={key} className="block text-xs text-muted">{label}<input className={INPUT} maxLength={max} value={editor[key]} disabled={busy} onChange={(e) => update({ [key]: e.target.value })} /></label>)}
            <label className="block text-xs text-muted">LinkedIn URL<input className={INPUT} value={editor.linkedinUrl ?? ""} disabled={busy} onChange={(e) => update({ linkedinUrl: e.target.value || null })} /></label>
            <label className="block text-xs text-muted sm:col-span-2">Headshot URL<input className={INPUT} value={editor.photoUrl ?? ""} disabled={busy} onChange={(e) => update({ photoUrl: e.target.value || null })} /></label>
            <label className="block text-xs text-muted sm:col-span-2">Public biography<textarea className={`${INPUT} min-h-40`} maxLength={10000} value={editor.bio} disabled={busy} onChange={(e) => update({ bio: e.target.value })} /></label>
          </div>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-fg">Website sessions</legend>{Object.entries(WEBSITE_SESSIONS).map(([id, label]) => {
            const placement = editor.placements.find((p) => p.sessionId === id);
            return <div key={id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2"><label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" disabled={busy} checked={!!placement} onChange={(e) => update({ placements: e.target.checked ? [...editor.placements, { sessionId: id as keyof typeof WEBSITE_SESSIONS, order: 0 }] : editor.placements.filter((p) => p.sessionId !== id) })} />{label}</label>{placement && <label className="flex items-center gap-2 text-xs text-muted">Order<input aria-label={`Display order in ${label}`} type="number" min={0} max={999} className={`${INPUT} max-w-20`} value={placement.order} disabled={busy} onChange={(e) => update({ placements: editor.placements.map((p) => p.sessionId === id ? { ...p, order: Number(e.target.value) } : p) })} /></label>}</div>;
          })}</fieldset>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-fg">Public organization / reference links</legend>
            {editor.links.map((link, index) => <div key={index} className="flex flex-wrap gap-2"><input aria-label={`Link ${index + 1} label`} className={`${INPUT} sm:flex-1`} value={link.label} disabled={busy} onChange={(e) => update({ links: editor.links.map((l, i) => i === index ? { ...l, label: e.target.value } : l) })} /><input aria-label={`Link ${index + 1} URL`} className={`${INPUT} sm:flex-1`} value={link.url} disabled={busy} onChange={(e) => update({ links: editor.links.map((l, i) => i === index ? { ...l, url: e.target.value } : l) })} /><button type="button" className={BUTTON} disabled={busy} title="Remove link" aria-label={`Remove link ${index + 1}`} onClick={() => update({ links: editor.links.filter((_, i) => i !== index) })}><Trash2 size={14} /></button></div>)}
            <button type="button" className={BUTTON} disabled={busy || editor.links.length >= 12} onClick={() => update({ links: [...editor.links, { label: "", url: "" }] })}><Plus size={14} />Add link</button>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} disabled={busy || !dirty || !editor.placements.length || editor.fullName.trim().length < 2} onClick={() => void mutate({ action: "save", id: selected, profile: editor })}><Save size={15} />Save public draft</button>
            <button type="button" className={BUTTON} disabled={busy || dirty || !saved} onClick={() => confirm({ action: "approve", id: selected })}><Eye size={15} />Preview & approve</button>
            {approved && <button type="button" className={BUTTON} disabled={busy || dirty} onClick={() => confirm({ action: "unpublish", id: selected })}><X size={15} />{data.state.initialized ? "Unpublish" : "Withdraw approval"}</button>}
            <button type="button" className={BUTTON} disabled={busy} onClick={() => {
              const person = data.roster.people.find((p) => p.id === selected);
              if (person) setEditor({ ...sourcePublicProfile(person, data.roster), placements: editor.placements, links: editor.links, linkedinUrl: editor.linkedinUrl });
            }}><RefreshCw size={14} />Use loaded submission</button>
          </div>
          {approved && <details className="border-t border-line pt-4"><summary className="cursor-pointer text-sm font-semibold text-fg">{data.state.initialized ? "Current published snapshot" : "Current approved snapshot"} · Revision {approved.approvedRevision}</summary><PublicProfilePreview profile={approved.profile} /></details>}
        </div>}
      </div>}
    <Dialog.Root open={!!confirmation} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%_-_2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-card-solid p-5 [overflow-wrap:anywhere]">
      <div className="flex justify-between gap-4"><Dialog.Title className="text-lg font-bold text-fg">{confirmation?.action === "approve" ? "Approve public profile" : confirmation?.action === "initialize" ? "Activate website list" : "Remove public profile"}</Dialog.Title><Dialog.Close disabled={busy} aria-label="Close publication preview"><X size={18} /></Dialog.Close></div>
      <Dialog.Description className="my-3 text-sm text-muted">{confirmation?.action === "initialize" ? "This replaces the website's current managed speaker lists with the approved people below. Review the complete initial list before activating." : confirmation?.action === "unpublish" ? "This removes the approved profile from every website session. The draft remains available." : "Approval applies to this saved snapshot only. Future edits need a new approval."}</Dialog.Description>
      {confirmation?.action === "approve" && saved && <PublicProfilePreview profile={saved.profile} />}
      {confirmation?.action === "initialize" && <ul className="space-y-2 text-sm text-fg">{data?.state.approved.map((p) => <li key={p.id}><strong>{p.profile.fullName}</strong> · {p.profile.placements.map((v) => WEBSITE_SESSIONS[v.sessionId]).join(", ")}</li>)}</ul>}
      {confirmation?.action === "unpublish" && <p className="font-semibold text-fg">{approved?.profile.fullName}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-fg">{error}</p>}
      <label className="my-4 flex items-start gap-2 text-sm text-fg"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />{confirmation?.action === "initialize" ? "I have reviewed the full initial list and approve replacing the website list." : confirmation?.action === "unpublish" ? "I approve removing this person from the website." : "I have reviewed these public details, headshot and placements and approve them."}</label>
      <button type="button" className={BUTTON} disabled={busy || !consent} onClick={() => {
        if (!confirmation || !data) return;
        if (confirmation.action === "initialize") void mutate({ action: "initialize", confirm: true });
        else if (confirmation.action === "unpublish") void mutate({ action: "unpublish", id: confirmation.id! });
        else void mutate({ action: "approve", id: confirmation.id!, draftHash: data.hashes[confirmation.id!] });
      }}><Check size={15} />{confirmation?.action === "initialize" ? "Activate approved list" : confirmation?.action === "unpublish" ? "Confirm removal" : "Approve for website"}</button>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}

export function PublicProfilePreview({ profile }: { profile: PublicProfileInput }) {
  return <div className="my-4 space-y-3 border-t border-line pt-4 text-fg">
    {/* Approved snapshots use content-addressed headshots on the existing R2 host. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {profile.photoUrl && <img src={profile.photoUrl} alt={profile.fullName} className="h-32 w-32 rounded-md object-cover" />}
    <h3 className="text-lg font-bold">{profile.fullName}</h3><p className="text-sm">{profile.title} · {profile.organization}</p>
    <p className="whitespace-pre-wrap text-sm">{profile.bio || "No biography."}</p>
    {profile.linkedinUrl && <a className="block text-sm underline" href={profile.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>}
    {profile.links.map((link, i) => <a key={i} className="block text-sm underline" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}
    <ul className="text-sm">{profile.placements.map((p) => <li key={p.sessionId}>{WEBSITE_SESSIONS[p.sessionId]} · Order {p.order}</li>)}</ul>
  </div>;
}
