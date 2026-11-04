"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, MessageSquareText, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import { LINKEDIN_ACTIVITY_URL, LINKEDIN_FEEDBACK_PATH, LinkedinFeedbackProfile, canPublishLinkedinQuote, publicLinkedinTestimonials, linkedinEmbedUrl, type LinkedinAction, type LinkedinEntry, type LinkedinSnapshot } from "@/lib/events/linkedin";
import { CopyFeedback } from "@/components/events/CopyFeedback";

const API = "/api/admin/symposium-linkedin";
const statuses = { pending: "Needs reply", replied: "Replied", no_reply: "No reply needed" };
const kinds = { mention: "Mention", comment: "Comment", repost: "Repost", reaction: "Reactions", message: "Message" };
const topics = { symposium: "Symposium", training_week: "Training Week", both: "Symposium + Training Week" };
const emptyProfile = { title: "", affiliation: "", photoUrl: "", profileUrl: "" };
const inputClass = "w-full min-w-0 rounded-md border border-line bg-card px-3 py-2 text-sm text-fg";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold hover:bg-elevated disabled:opacity-50";
const stamp = (value: string) => new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SymposiumLinkedin() {
  const [snapshot, setSnapshot] = useState<LinkedinSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState("all"), [topic, setTopic] = useState("all"), [search, setSearch] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(true), [dirty, setDirty] = useState(false), [adding, setAdding] = useState(false);
  async function load() {
    try {
      const response = await fetch(API, { cache: "no-store" }), result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load interactions.");
      setSnapshot(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load interactions."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    fetch(API, { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load interactions.");
      if (!cancelled) setSnapshot(result);
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load interactions."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  async function save(change: LinkedinAction) {
    if (!snapshot) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: snapshot.version, change }) });
      const result = await response.json();
      if (result.snapshot) setSnapshot(result.snapshot);
      if (!response.ok) throw new Error(result.conflict ? "A colleague changed the queue. Your draft is retained. Review the latest saved reply before saving again." : result.error || "Could not save.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }
  function choose(id: string) {
    if (dirty) { setError("Save or discard your current changes before switching interactions."); return; }
    setSelected(id); setError("");
  }
  const entries = snapshot?.board.entries ?? [];
  const visible = entries.filter(e => (status === "all" || e.status === status) && (topic === "all" || e.topic === topic || e.topic === "both") && `${e.author} ${e.sourceText} ${e.reply}`.toLowerCase().includes(search.toLowerCase()));
  const active = entries.find(e => e.id === selected) ?? visible[0];
  return <section className="min-w-0 space-y-5 pb-8" aria-label="Symposium LinkedIn interactions">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-muted">2026 Symposium + Training Week</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><MessageSquareText size={24} />LinkedIn</h1>
        <p className="mt-2 text-xs text-muted">{snapshot?.board.checkedAt ? `Browser checked ${stamp(snapshot.board.checkedAt)} ET` : "Not yet checked"} · No background sync · Replies not sent from here</p></div>
      <div className="flex flex-wrap gap-1">
        <a href={LINKEDIN_ACTIVITY_URL} target="_blank" rel="noopener noreferrer" className={buttonClass}><ExternalLink size={16} />BioHubNet activity</a>
        <button type="button" className={buttonClass} disabled={busy || dirty} onClick={() => { setBusy(true); setError(""); void load(); }} title="Reload saved platform records"><RefreshCw size={16} />Reload queue</button>
        <button type="button" className={`${buttonClass} bg-brand-600 text-white hover:bg-brand-700`} disabled={dirty || busy} onClick={() => setAdding(!adding)}><Plus size={16} />Add interaction</button>
      </div>
    </header>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span><strong className="text-xl">{entries.length}</strong> tracked</span><span className="text-amber-700 dark:text-amber-300"><strong className="text-xl">{entries.filter(e => e.status === "pending").length}</strong> needs reply</span><span className="text-emerald-700 dark:text-emerald-300"><strong className="text-xl">{entries.filter(e => e.status === "replied").length}</strong> replied</span><span className="text-muted"><strong className="text-xl">{entries.filter(e => e.status === "no_reply").length}</strong> no reply needed</span></div>
    {snapshot && <details className="text-xs text-muted"><summary className="cursor-pointer">Coverage</summary><p className="mt-2 max-w-3xl whitespace-pre-wrap">{snapshot.board.coverage}</p></details>}
    {snapshot && <div className="flex flex-wrap items-center gap-3 border-y border-line py-3 text-sm"><a href={LINKEDIN_FEEDBACK_PATH} target="_blank" rel="noopener noreferrer" className={buttonClass}><Globe size={16} />Public feedback page<ExternalLink size={14} /></a><span className="text-muted">{publicLinkedinTestimonials(snapshot.board).length} published quotes</span><CopyFeedback quotes={publicLinkedinTestimonials(snapshot.board)} all /></div>}
    {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {adding && <NewInteraction busy={busy} close={() => setAdding(false)} save={async entry => { if (await save({ action: "add", entry })) setAdding(false); }} />}
    <div className="flex flex-wrap items-center gap-3 border-y border-line py-3">
      <label className="relative min-w-48 flex-1"><span className="sr-only">Search interactions</span><Search className="absolute left-3 top-3 text-muted" size={16} /><input className={`${inputClass} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people or posts" /></label>
      <label className="flex items-center gap-2 text-sm text-muted">Status<select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm text-muted">Event<select className={inputClass} value={topic} onChange={e => setTopic(e.target.value)}><option value="all">Both events</option><option value="symposium">Symposium</option><option value="training_week">Training Week</option></select></label>
    </div>
    {busy && !snapshot ? <p role="status">Loading interactions...</p> : !entries.length ? <p className="py-8 text-muted">No interactions recorded yet.</p> : <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Interactions" className="min-w-0">
        {!visible.length && <p className="py-4 text-sm text-muted">No matches.</p>}
        {visible.map(e => <button type="button" key={e.id} aria-current={active?.id === e.id ? "true" : undefined} onClick={() => choose(e.id)} className={`block w-full border-b border-line px-3 py-3 text-left ${active?.id === e.id ? "bg-brand-500/10" : "hover:bg-elevated"}`}>
          <span className="block break-words text-sm font-bold">{e.author}</span><span className="mt-1 block text-xs text-muted">{kinds[e.kind]} · {statuses[e.status]}</span><span className="mt-1 line-clamp-2 break-words text-xs text-muted">{e.sourceText}</span>
        </button>)}
      </nav>
      {active && <ReplyEditor key={active.id} entry={active} busy={busy} save={save} onDirty={setDirty} />}
    </div>}
  </section>;
}

function ReplyEditor({ entry, busy, save, onDirty }: { entry: LinkedinEntry; busy: boolean; save: (action: LinkedinAction) => Promise<boolean>; onDirty: (dirty: boolean) => void }) {
  const [reply, setReply] = useState(entry.reply), [status, setStatus] = useState(entry.status), [notes, setNotes] = useState(entry.notes), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState("");
  const [quote, setQuote] = useState(entry.testimonial?.quote ?? "");
  const [profile, setProfile] = useState(entry.testimonial?.profile ?? emptyProfile);
  const profileInput = LinkedinFeedbackProfile.safeParse(profile);
  const dirty = reply !== entry.reply || status !== entry.status || notes !== entry.notes;
  const quoteDirty = quote !== (entry.testimonial?.quote ?? "") || (["title", "affiliation", "photoUrl", "profileUrl"] as const).some(key => profile[key] !== (entry.testimonial?.profile ?? emptyProfile)[key]);
  useEffect(() => { onDirty(dirty || quoteDirty); }, [dirty, quoteDirty, onDirty]);
  async function copy() {
    try { await navigator.clipboard.writeText(reply); setCopied(true); setCopyError(""); }
    catch { setCopyError("Could not copy. Select the reply text to copy it."); }
  }
  return <article className="@container min-w-0 space-y-4" aria-label={`Interaction with ${entry.author}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="break-words text-xl font-bold">{entry.author}</h2><p className="mt-1 text-xs text-muted">{kinds[entry.kind]} · {topics[entry.topic]} · Observed {stamp(entry.observedAt)} ET{entry.occurredLabel ? ` · LinkedIn showed ${entry.occurredLabel}` : ""}</p></div>
      <a className={`${buttonClass} text-brand-700 dark:text-brand-300`} href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open on LinkedIn</a></div>
    <div className="grid min-w-0 items-start gap-5 @[680px]:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.88fr)]">
    <OriginalLinkedinPost entry={entry} />
    <div className="min-w-0 space-y-6">
    <form className="min-w-0 space-y-3" aria-label="Reply draft" onSubmit={async e => { e.preventDefault(); await save({ action: "edit", id: entry.id, reply, status, notes }); }}>
      {entry.kind === "comment" && <details open className="text-sm"><summary className="cursor-pointer font-semibold">Comment by {entry.author}</summary><div role="region" aria-label="Captured comment context" tabIndex={0} className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-elevated/50 p-3 text-sm leading-relaxed">{entry.sourceText}</div></details>}
      <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="linkedin-reply" className="text-sm font-bold">Draft reply as BioHubNet</label><button type="button" className={buttonClass} disabled={!reply.trim()} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy reply"}</button></div>
      <textarea id="linkedin-reply" className={`${inputClass} min-h-36 resize-y leading-relaxed`} maxLength={3000} value={reply} onChange={e => { setReply(e.target.value); setCopied(false); }} />
      {copyError && <p role="alert" className="text-sm text-rose-700">{copyError}</p>}
      <label className="block text-sm font-semibold">Status<select className={`${inputClass} mt-1 max-w-xs`} value={status} onChange={e => setStatus(e.target.value as LinkedinEntry["status"])}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block text-sm font-semibold">Internal note<textarea className={`${inputClass} mt-1 resize-y`} rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {dirty && entry.updatedAt && <details className="text-xs text-muted"><summary className="cursor-pointer">Latest saved reply · {entry.updatedBy} · {stamp(entry.updatedAt)} ET</summary><p className="mt-2 whitespace-pre-wrap">{entry.reply || "No reply drafted."}</p></details>}
      <div className="flex flex-wrap items-center gap-2"><button type="submit" className={`${buttonClass} bg-brand-600 text-white hover:bg-brand-700`} disabled={busy || !dirty}><Save size={16} />{busy ? "Saving..." : "Save changes"}</button>
        {dirty && <button type="button" className={buttonClass} disabled={busy} onClick={() => { setReply(entry.reply); setStatus(entry.status); setNotes(entry.notes); }}>Discard changes</button>}
        <span role="status" className="text-xs text-muted">{dirty ? "Unsaved changes" : `Saved · ${entry.updatedBy} · ${stamp(entry.updatedAt)} ET`}</span></div>
    </form>
    {!["message", "reaction"].includes(entry.kind) && linkedinEmbedUrl(entry.sourceUrl) && <section aria-label="Public feedback" className="space-y-3 border-t border-line pt-5">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Globe size={16} />Showcase this feedback</h3>
      <p className="text-xs leading-relaxed text-muted">Select a positive excerpt from the saved post. Published quotes are visible to everyone, with the author’s name and original link. Reply drafts and internal notes stay private.</p>
      <label className="block text-sm font-semibold">Public quote<textarea className={`${inputClass} mt-1 min-h-28 resize-y font-normal leading-relaxed`} maxLength={1200} value={quote} onChange={e => setQuote(e.target.value)} placeholder="Paste a verbatim excerpt from the original post" /></label>
      <details open className="space-y-3"><summary className="cursor-pointer text-sm font-semibold">Attribution &amp; headshot</summary>
        <label className="block text-sm">Title / role<input className={`${inputClass} mt-1`} maxLength={240} value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} /></label>
        <label className="block text-sm">Affiliation<input className={`${inputClass} mt-1`} maxLength={240} value={profile.affiliation} onChange={e => setProfile({ ...profile, affiliation: e.target.value })} /></label>
        <label className="block text-sm">Headshot or logo URL<input className={`${inputClass} mt-1`} maxLength={2048} value={profile.photoUrl} onChange={e => setProfile({ ...profile, photoUrl: e.target.value })} /></label>
        <label className="block text-sm">Public profile link<input className={`${inputClass} mt-1`} type="url" maxLength={2048} value={profile.profileUrl} onChange={e => setProfile({ ...profile, profileUrl: e.target.value })} /></label>
        {!profileInput.success && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Use HTTPS links, or a saved /feedback/2026/ image path.</p>}
      </details>
      {!!quote.trim() && !canPublishLinkedinQuote(entry, quote) && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Use an exact excerpt from the saved source text, without rewriting it.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${buttonClass} bg-brand-600 text-white hover:bg-brand-700`} disabled={busy || !profileInput.success || !canPublishLinkedinQuote(entry, quote) || (!!entry.testimonial && !quoteDirty)} onClick={async () => { if (profileInput.success && await save({ action: "testimonial", id: entry.id, quote, publish: true, profile: profileInput.data })) { setQuote(quote.trim()); setProfile(profileInput.data); } }}><Globe size={16} />{entry.testimonial ? "Update public quote" : "Show on public page"}</button>
        {entry.testimonial && <button type="button" className={buttonClass} disabled={busy} onClick={async () => { if (await save({ action: "testimonial", id: entry.id, quote: "", publish: false })) { setQuote(""); setProfile(emptyProfile); } }}>Remove from public page</button>}
        {quoteDirty && <button type="button" className={buttonClass} disabled={busy} onClick={() => { setQuote(entry.testimonial?.quote ?? ""); setProfile(entry.testimonial?.profile ?? emptyProfile); }}>Discard quote changes</button>}
      </div>
      {entry.testimonial && <p role="status" className="text-xs text-muted">{canPublishLinkedinQuote(entry, entry.testimonial.quote) ? "Published" : "Hidden: source text changed"} · {entry.testimonial.publishedBy} · {stamp(entry.testimonial.publishedAt)} ET</p>}
    </section>}
    </div>
    </div>
  </article>;
}

function OriginalLinkedinPost({ entry }: { entry: LinkedinEntry }) {
  const embed = entry.kind === "message" ? null : linkedinEmbedUrl(entry.sourceUrl);
  const [saved, setSaved] = useState(false);
  return <section className="min-w-0 space-y-3" aria-label="Original LinkedIn post">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{entry.kind === "message" ? "Original message" : "Original post"}</h3>
      {embed && <div role="group" aria-label="Post view" className="flex gap-1 rounded-md bg-elevated/60 p-1">
        <button type="button" aria-pressed={!saved} onClick={() => setSaved(false)} className={`rounded px-3 py-1.5 text-xs font-semibold ${!saved ? "bg-brand-600 text-white" : "text-fg"}`}>LinkedIn</button>
        <button type="button" aria-pressed={saved} onClick={() => setSaved(true)} className={`rounded px-3 py-1.5 text-xs font-semibold ${saved ? "bg-brand-600 text-white" : "text-fg"}`}>Saved text</button>
      </div>}
    </div>
    {embed && !saved ? <iframe title="Original LinkedIn post" src={embed} loading="eager" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" onError={() => setSaved(true)} className="block h-[78vh] min-h-[480px] w-full rounded-lg border-0 bg-white" />
      : <div data-theme="light" className="overflow-hidden rounded-lg border border-line bg-card-solid font-sans text-fg [color-scheme:light]">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{entry.kind === "reaction" ? "BioHubNet" : entry.author}</p><p className="mt-0.5 text-xs text-muted">{entry.kind === "message" ? "Private message · Saved capture" : "Saved interaction capture"}</p></div><a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open original on LinkedIn" className="shrink-0 text-brand-700"><ExternalLink size={18} /></a></header>
        <div role="region" aria-label="LinkedIn source text" tabIndex={0} className="max-h-[78vh] overflow-y-auto whitespace-pre-wrap break-words p-4 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-brand-500">{entry.sourceText}</div>
      </div>}
  </section>;
}

function NewInteraction({ busy, save, close }: { busy: boolean; save: (entry: Extract<LinkedinAction, { action: "add" }>["entry"]) => Promise<void>; close: () => void }) {
  const [author, setAuthor] = useState(""), [url, setUrl] = useState(""), [sourceText, setSourceText] = useState("");
  const [kind, setKind] = useState<LinkedinEntry["kind"]>("mention"), [topic, setTopic] = useState<LinkedinEntry["topic"]>("symposium");
  return <form aria-label="Add LinkedIn interaction" className="space-y-3 border-y border-line py-4" onSubmit={e => { e.preventDefault(); void save({ sourceUrl: url, author, kind, topic, sourceText, reply: "", status: "pending", occurredLabel: "" }); }}>
    <div className="flex items-center justify-between"><h2 className="font-bold">Add interaction</h2><button type="button" onClick={close} disabled={busy} className={buttonClass} aria-label="Close new interaction"><X size={18} /></button></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Person or organization<input className={`${inputClass} mt-1`} required maxLength={240} value={author} onChange={e => setAuthor(e.target.value)} /></label><label className="text-sm">LinkedIn source link<input className={`${inputClass} mt-1`} type="url" required maxLength={2000} value={url} onChange={e => setUrl(e.target.value)} /></label>
      <label className="text-sm">Interaction<select className={`${inputClass} mt-1`} value={kind} onChange={e => setKind(e.target.value as LinkedinEntry["kind"])}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Event<select className={`${inputClass} mt-1`} value={topic} onChange={e => setTopic(e.target.value as LinkedinEntry["topic"])}>{Object.entries(topics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <label className="block text-sm">Post, comment or message<textarea required className={`${inputClass} mt-1`} rows={4} maxLength={16000} value={sourceText} onChange={e => setSourceText(e.target.value)} /></label>
    <button type="submit" className={`${buttonClass} bg-brand-600 text-white hover:bg-brand-700`} disabled={busy}><Plus size={16} />Add to queue</button>
  </form>;
}
