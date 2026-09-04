"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GOOGLE_ADS_PILOT } from "@/lib/campaign/google-ads-pilot";
import { getGoogleAdsPlanWarnings, googleAdsPlanSchema, type GoogleAdsPlan, type GoogleAdsWorkspaceState } from "@/lib/campaign/google-ads-workspace";
import styles from "./GoogleAdsWorkspace.module.css";

type Program = GoogleAdsPlan["programs"][number];
type Keyword = Program["keywords"][number];
type Negative = GoogleAdsPlan["campaignNegatives"][number];
type Ad = Program["ads"][number];
type RecoveryDraft = { baseRevision: number; plan: GoogleAdsPlan; summary: string; feedbackSection: string; feedbackBody: string };
const endpoint = "/api/admin/google-ads/workspace";
const sections = ["Keywords", "Negative keywords", "Audiences", "Ad copy", "Settings", "Notes", "General"];
const newId = () => crypto.randomUUID();
const dateLabel = (value: string) => new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });

function Field({ label, value, onChange, editing, multiline = false, limit, type = "text" }: {
  label: string; value: string | number; onChange: (value: string) => void; editing: boolean;
  multiline?: boolean; limit?: number; type?: "text" | "number";
}) {
  const id = useId();
  return <div className={styles.field}>
    <label htmlFor={editing ? id : undefined}>{label}{limit && <span className={String(value).length > limit ? styles.overLimit : styles.counter}>{String(value).length}/{limit}</span>}</label>
    {editing ? (multiline
      ? <textarea id={id} value={value} rows={3} onChange={e => onChange(e.target.value)} />
      : <input id={id} type={type} step={type === "number" ? "0.01" : undefined} min={type === "number" ? "0" : undefined} value={value} onChange={e => onChange(e.target.value)} />)
      : <p className={styles.fieldValue}>{value || "—"}</p>}
  </div>;
}

function Section({ id, number, title, detail, children }: { id: string; number: string; title: string; detail: string; children: ReactNode }) {
  return <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
    <header className={styles.sectionHeading}><span>{number}</span><div><h2 id={`${id}-title`}>{title}</h2><p>{detail}</p></div></header>
    {children}
  </section>;
}

function TermList({ terms, onChange, editing, negative = false }: {
  terms: (Keyword | Negative)[]; onChange: (terms: (Keyword | Negative)[]) => void; editing: boolean; negative?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [bulk, setBulk] = useState("");
  const [match, setMatch] = useState<"phrase" | "exact" | "broad">("phrase");
  const [message, setMessage] = useState("");
  function update(id: string, values: Partial<Keyword & Negative>) { onChange(terms.map(t => t.id === id ? { ...t, ...values } : t)); }
  function addTerms() {
    const incoming = bulk.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    const seen = new Set(terms.map(t => `${t.text.toLowerCase()}|${t.matchType}`));
    const additions: (Keyword | Negative)[] = [];
    for (const text of incoming) {
      const parsedMatch = text.startsWith("[") && text.endsWith("]") ? "exact" : text.startsWith('"') && text.endsWith('"') ? "phrase" : match;
      const clean = text.replace(/^\[(.*)\]$/, "$1").replace(/^"(.*)"$/, "$1").trim();
      if (!clean || seen.has(`${clean.toLowerCase()}|${parsedMatch}`)) continue;
      seen.add(`${clean.toLowerCase()}|${parsedMatch}`);
      additions.push(negative
        ? { id: newId(), text: clean, matchType: parsedMatch, reason: "Added for review" }
        : { id: newId(), text: clean, matchType: parsedMatch === "broad" ? "phrase" : parsedMatch, competition: "Not verified", costNote: "Check Keyword Planner" });
    }
    onChange([...terms, ...additions]); setBulk(""); setMessage(`${additions.length} added to your draft.`);
  }
  return <div>
    <div className={styles.termToolbar}><input aria-label={negative ? "Filter negative keywords" : "Filter keywords"} placeholder="Find a keyword…" value={query} onChange={e => setQuery(e.target.value)} /><span>{terms.length} terms</span></div>
    <div className={negative ? styles.negativeList : styles.termList}>
      {terms.filter(t => t.text.toLowerCase().includes(query.toLowerCase())).map(term => <article key={term.id} className={negative ? styles.negativeRow : styles.termRow}>
        {editing ? <>
          <input aria-label={`Keyword: ${term.text || "new term"}`} value={term.text} onChange={e => update(term.id, { text: e.target.value })} />
          <select aria-label={`Match type: ${term.text}`} value={term.matchType} onChange={e => update(term.id, { matchType: e.target.value as Keyword["matchType"] })}>
            <option value="phrase">Phrase</option><option value="exact">Exact</option>{negative && <option value="broad">Broad</option>}
          </select>
          <button className={styles.remove} onClick={() => onChange(terms.filter(t => t.id !== term.id))} aria-label={`Remove ${term.text}`}>Remove</button>
        </> : <><strong>{term.text}</strong><span className={styles.match}>{term.matchType}</span></>}
        <div className={styles.termDetails}>
          {"reason" in term ? <Field label="Reason" value={term.reason} onChange={reason => update(term.id, { reason })} editing={editing} /> : <>
            <Field label="Competition" value={term.competition} onChange={competition => update(term.id, { competition })} editing={editing} />
            <Field label="Cost per click" value={term.costNote} onChange={costNote => update(term.id, { costNote })} editing={editing} />
          </>}
        </div>
      </article>)}
      {terms.length === 0 && <p className={styles.empty}>No keywords yet. Add the first terms below.</p>}
    </div>
    {editing && <div className={styles.addTerms}>
      <label> Add {negative ? "negative " : ""}keywords <textarea aria-label={negative ? "New negative keywords" : "New keywords"} value={bulk} onChange={e => setBulk(e.target.value)} placeholder="One keyword per line" rows={3} /></label>
      <div className={styles.actions}><select aria-label="Match type for new keywords" value={match} onChange={e => setMatch(e.target.value as typeof match)}><option value="phrase">Phrase match</option><option value="exact">Exact match</option>{negative && <option value="broad">Broad match</option>}</select><button onClick={addTerms} disabled={!bulk.trim()}>Add keywords</button><span role="status">{message}</span></div>
    </div>}
  </div>;
}

export function GoogleAdsWorkspace({ viewerId }: { viewerId: string }) {
  const [state, setState] = useState<GoogleAdsWorkspaceState | null>(null);
  const [plan, setPlan] = useState<GoogleAdsPlan | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("engage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [feedbackSection, setFeedbackSection] = useState("Keywords");
  const [feedbackBody, setFeedbackBody] = useState("");
  const [copiedText, setCopiedText] = useState("");
  const [baseRevision, setBaseRevision] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryDraft | null>(null);
  const [conflict, setConflict] = useState(false);
  const requestInFlight = useRef(false);
  const storageKey = `bhn-google-ads-draft:${viewerId}`;
  const dirty = !!(state && plan && JSON.stringify(plan) !== JSON.stringify(state.plan));
  const hasUnsavedInput = dirty || !!summary.trim() || !!feedbackBody.trim();

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load the campaign plan.");
      setState(result); setPlan(result.plan); setBaseRevision(result.revision);
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw);
          const parsed = googleAdsPlanSchema.safeParse(saved.plan);
          if (parsed.success && Number.isSafeInteger(saved.baseRevision) && saved.baseRevision >= 0
            && typeof saved.summary === "string" && typeof saved.feedbackBody === "string" && typeof saved.feedbackSection === "string") {
            setRecovery({ baseRevision: saved.baseRevision, plan: parsed.data, summary: saved.summary.slice(0, 1000), feedbackBody: saved.feedbackBody.slice(0, 5000), feedbackSection: sections.includes(saved.feedbackSection) ? saved.feedbackSection : "General" });
          }
        }
      } catch { /* Browser storage may be unavailable. The editor still works. */ }
    }).catch(err => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [storageKey]);
  useEffect(() => {
    if (!hasUnsavedInput) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedInput]);
  useEffect(() => {
    if (!state || !plan || recovery) return;
    try {
      if (hasUnsavedInput) sessionStorage.setItem(storageKey, JSON.stringify({ baseRevision, plan, summary, feedbackSection, feedbackBody } satisfies RecoveryDraft));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Download a draft backup if browser storage is unavailable. */ }
  }, [state, plan, recovery, storageKey, baseRevision, summary, feedbackSection, feedbackBody, hasUnsavedInput]);

  function downloadDraft() {
    if (!plan) return false;
    try {
      const content = JSON.stringify({ documentType: "Unsaved BioHubNet Google Ads draft backup", savedAt: new Date().toISOString(), baseRevision, plan, summary, feedbackSection, feedbackBody }, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "biohubnet-google-ads-unsaved-draft.json"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Draft backup downloaded. Keep it to recover edits or share with Codex.");
      return true;
    } catch { setError("Could not download your draft. Your edits are still here."); return false; }
  }

  async function reloadLatest() {
    if (requestInFlight.current) return;
    if (hasUnsavedInput) {
      if (!window.confirm("Download a backup of your unsaved input, then replace this draft with the latest saved plan?")) return;
      if (!downloadDraft()) return;
    }
    requestInFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load the latest plan. Your edits are still here.");
      setState(result); setPlan(result.plan); setBaseRevision(result.revision); setSummary(""); setFeedbackBody(""); setRecovery(null); setConflict(false); setCopiedText("");
      setMessage(hasUnsavedInput ? "Latest plan loaded. Your previous input is in the downloaded backup." : "Latest saved plan loaded.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load the latest plan. Your edits are still here."); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  async function mutate(method: "PATCH" | "POST", body: unknown) {
    if (requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409 && method === "PATCH") setConflict(true); throw new Error(result.error || "Could not save. Your edits are still here."); }
      setState(result); setPlan(result.plan); setBaseRevision(result.revision); setConflict(false); setCopiedText(""); return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save. Your edits are still here."); return false; }
    finally { requestInFlight.current = false; setBusy(false); }
  }
  async function save() {
    if (!state || !plan) return;
    if (await mutate("PATCH", { revision: baseRevision, plan, summary: summary.trim() || "Updated campaign draft" })) {
      setSummary(""); setMessage("Saved to the training platform. Ready for Codex review.");
    }
  }
  async function exportHandoff(download: boolean) {
    if (hasUnsavedInput || requestInFlight.current || recovery) return;
    requestInFlight.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}?format=handoff`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not prepare the handoff. Please try again.");
      const content = await response.text();
      if (download) {
        const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = "biohubnet-google-ads-codex-handoff.md"; anchor.click(); URL.revokeObjectURL(url);
        setMessage("Handoff downloaded with the saved plan, history and feedback.");
      } else {
        try { await navigator.clipboard.writeText(content); setMessage("Copied. Paste into the BHN Training PLT task in Codex."); }
        catch { setCopiedText(content); setMessage("Select and copy the handoff below, then paste it into Codex."); }
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Export failed."); }
    finally { requestInFlight.current = false; setBusy(false); }
  }
  async function loadMoreHistory() {
    if (!state?.historyNextCursor || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}?historyCursor=${encodeURIComponent(state.historyNextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load older changes.");
      const next = await response.json() as GoogleAdsWorkspaceState;
      setState(previous => previous ? { ...previous, history: [...previous.history, ...next.history], historyNextCursor: next.historyNextCursor } : previous);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load older changes."); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  if (!plan || !state) return <div className={styles.workspace}><div className={styles.loading} role={error ? "alert" : "status"}>{error || "Loading campaign workspace…"}{error && <button onClick={() => window.location.reload()}>Try again</button>}</div></div>;
  const program = plan.programs.find(p => p.id === selected) ?? plan.programs[0];
  function updateProgram(id: string, patch: Partial<Program>) { setPlan(p => p ? { ...p, programs: p.programs.map(item => item.id === id ? { ...item, ...patch } : item) } : p); }
  function updateAd(programId: string, adId: string, patch: Partial<Ad>) {
    const target = plan?.programs.find(p => p.id === programId);
    if (target) updateProgram(programId, { ads: target.ads.map(a => a.id === adId ? { ...a, ...patch } : a) });
  }
  const warnings = getGoogleAdsPlanWarnings(plan);
  const totalKeywords = plan.programs.reduce((n, p) => n + p.keywords.length, 0);
  const totalNegatives = plan.campaignNegatives.length + plan.programs.reduce((n, p) => n + p.negatives.length, 0);
  const switcher = <div className={styles.programTabs} role="group" aria-label="Choose program">{plan.programs.map(p => <button key={p.id} aria-pressed={p.id === program?.id} onClick={() => setSelected(p.id)}>{p.name}</button>)}</div>;

  return <div className={styles.workspace}>
    <div className={styles.topbar}><span>BioHubNet <span className={styles.slash}>/</span> Marketing workspace</span><span>Draft · Revision {state.revision}</span></div>
    <header className={styles.hero}><div><p className={styles.eyebrow}>Plan · Review · Improve</p><h1>Google Ads</h1><p>Manage the plan. Keep every change in one place.</p></div><div className={styles.heroFacts}><span><strong>CA${plan.settings.monthlyBudgetCad}</strong> monthly plan</span><span><strong>{totalKeywords} / {totalNegatives}</strong> keywords / negatives</span><span><strong>{plan.settings.language}</strong>{plan.settings.locations}</span></div></header>
    <div className={styles.toolbar}>
      <div className={styles.actions}><button className={editing ? styles.secondary : styles.primary} onClick={() => setEditing(!editing)} disabled={busy || !!recovery}>{editing ? "View plan" : "Edit plan"}</button><button className={styles.primary} onClick={save} disabled={!dirty || busy || conflict || !!recovery}>{busy ? "Working…" : "Save changes"}</button>{(dirty || summary) && <button onClick={() => { if (window.confirm("Discard your unsaved plan edits and return to the version originally loaded?")) { setPlan(state.plan); setBaseRevision(state.revision); setSummary(""); setError(""); } }} disabled={busy || !!recovery}>Discard edits</button>}<span className={dirty ? styles.unsaved : styles.saved}>{dirty ? "Unsaved changes" : "Saved draft"}</span></div>
      <div className={styles.actions}>{hasUnsavedInput && <button onClick={downloadDraft} disabled={busy || !!recovery}>Back up unsaved draft</button>}<button onClick={() => exportHandoff(false)} disabled={hasUnsavedInput || busy || !!recovery}>Copy for Codex</button><button onClick={() => exportHandoff(true)} disabled={hasUnsavedInput || busy || !!recovery}>Download handoff</button></div>
    </div>
    <div className={styles.content}>
      <div className={styles.notice}><strong>Planning workspace.</strong> Saving here updates this plan. Google Ads changes are a separate step. Last recorded account check: {GOOGLE_ADS_PILOT.lastVerifiedOn} · {GOOGLE_ADS_PILOT.status}.<br />After saving, copy the handoff into <strong>BHN Training PLT</strong> in Codex to review and apply campaign changes.</div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {conflict && <div className={styles.warning} role="status"><p>The saved plan changed. Back up your edits, then load the latest plan before saving again.</p><div className={styles.actions}><button onClick={downloadDraft} disabled={busy}>Download my draft</button><button onClick={reloadLatest} disabled={busy}>{hasUnsavedInput ? "Back up edits & load latest" : "Load latest saved plan"}</button></div></div>}
      {recovery && <div className={styles.warning} role="status"><p>Unsaved input from your previous visit is available.</p><div className={styles.actions}><button disabled={busy} onClick={() => {
        setPlan(recovery.plan); setBaseRevision(recovery.baseRevision); setSummary(recovery.summary); setFeedbackSection(recovery.feedbackSection); setFeedbackBody(recovery.feedbackBody); setEditing(true);
        setConflict(recovery.baseRevision !== state.revision); setRecovery(null); setMessage("Recovered your unsaved input.");
      }}>Restore my draft</button><button disabled={busy} onClick={() => { if (window.confirm("Discard the unsaved draft from your previous visit?")) setRecovery(null); }}>Discard recovered draft</button></div></div>}
      {message && <div className={styles.success} role="status">{message}</div>}
      <fieldset className={styles.editorFields} disabled={busy || !!recovery}>
      {editing && <Field label="What changed? (optional save note)" value={summary} onChange={setSummary} editing />}
      {copiedText && <label className={styles.field}>Codex handoff<textarea readOnly value={copiedText} rows={8} onFocus={e => e.target.select()} /></label>}
      <nav className={styles.nav} aria-label="Campaign sections"><a href="#keywords">Keywords</a><a href="#negatives">Negatives</a><a href="#audiences">Audiences</a><a href="#ad-copy">Ad copy</a><a href="#settings">Settings</a><a href="#notes">Notes</a><a href="#feedback">Feedback & history</a></nav>

      <Section id="keywords" number="01" title="Keywords" detail="Add, remove and refine the searches we want to reach.">
        {switcher}
        {program && <TermList key={`kw-${program.id}`} terms={program.keywords} onChange={terms => updateProgram(program.id, { keywords: terms as Keyword[] })} editing={editing} />}
        <p className={styles.helper}>Phrase and exact match keep the pilot focused. Cost and competition need Keyword Planner data; overlapping providers are not proof of paid advertising.</p>
      </Section>

      <Section id="negatives" number="02" title="Negative keywords" detail="Block irrelevant searches. Keep useful training, internship and founder intent.">
        <details className={styles.scope} open><summary>Across the campaign <span>{plan.campaignNegatives.length} terms</span></summary><TermList terms={plan.campaignNegatives} onChange={terms => setPlan({ ...plan, campaignNegatives: terms as Negative[] })} editing={editing} negative /></details>
        {switcher}
        {program && <details className={styles.scope} open key={`neg-${program.id}`}><summary>{program.name} only <span>{program.negatives.length} terms</span></summary><TermList terms={program.negatives} onChange={terms => updateProgram(program.id, { negatives: terms as Negative[] })} editing={editing} negative /></details>}
        <p className={styles.helper}>Use specific exclusions. Do not block “free,” “funded,” “student,” “jobs,” “internship” or university names across the campaign. Negative keywords do not automatically cover spelling variants.</p>
      </Section>

      <Section id="audiences" number="03" title="Audiences & intent" detail="Speak directly to the people each program can help.">
        <div className={styles.cards}>{plan.programs.map(p => <article className={styles.card} key={p.id}>
          <Field label="Program" value={p.name} onChange={name => updateProgram(p.id, { name })} editing={editing} />
          <Field label="Audience" value={p.audience} onChange={audience => updateProgram(p.id, { audience })} editing={editing} multiline />
          <Field label="What they are looking for" value={p.intent} onChange={intent => updateProgram(p.id, { intent })} editing={editing} multiline />
          <Field label="Goal" value={p.objective} onChange={objective => updateProgram(p.id, { objective })} editing={editing} />
          <Field label="Landing page" value={p.landingUrl} onChange={landingUrl => updateProgram(p.id, { landingUrl })} editing={editing} />
          <Field label="Eligibility & campaign notes" value={p.notes} onChange={notes => updateProgram(p.id, { notes })} editing={editing} multiline />
          {editing && <button className={styles.remove} onClick={() => { if (window.confirm(`Remove ${p.name} and its keywords and ads from this draft?`)) setPlan({ ...plan, programs: plan.programs.filter(item => item.id !== p.id) }); }}>Remove program from draft</button>}
        </article>)}</div>
        {editing && <button onClick={() => { const id = newId(); setPlan({ ...plan, programs: [...plan.programs, { id, name: "New program", audience: "", intent: "", objective: "", landingUrl: "https://biohubnet.ca/", notes: "Proposed — verify eligibility and intake before use.", keywords: [], negatives: [], ads: [] }] }); setSelected(id); }}>Add program</button>}
      </Section>

      <Section id="ad-copy" number="04" title="Sample ad copy" detail="University-specific options, ready to edit and review.">
        {switcher}
        <p className={styles.helper}>Keep each university in its own ad variant and use matching searches. Location targeting alone does not confirm someone studies there. Internship placement and funding remain subject to eligibility.</p>
        {program && <div className={styles.cards}>{program.ads.map(ad => <article className={`${styles.card} ${styles.adCard}`} key={ad.id}>
          <div className={styles.adPreview}><span>Ad preview · {ad.institution}</span><small>{program.landingUrl}</small><h3>{ad.headlines.filter(Boolean).slice(0, 3).join(" | ") || "Add your headlines"}</h3><p>{ad.descriptions.filter(Boolean).join(" ")}</p></div>
          <Field label="Variant name" value={ad.label} onChange={label => updateAd(program.id, ad.id, { label })} editing={editing} />
          <Field label="Institution / audience" value={ad.institution} onChange={institution => updateAd(program.id, ad.id, { institution })} editing={editing} />
          {ad.headlines.map((headline, index) => <div key={index} className={styles.asset}><Field label={`Headline ${index + 1}`} value={headline} onChange={value => updateAd(program.id, ad.id, { headlines: ad.headlines.map((h, i) => i === index ? value : h) })} editing={editing} limit={30} />{editing && <button className={styles.remove} aria-label={`Remove headline ${index + 1} from ${ad.label}`} onClick={() => updateAd(program.id, ad.id, { headlines: ad.headlines.filter((_, i) => i !== index) })}>Remove</button>}</div>)}
          {editing && <button disabled={ad.headlines.length >= 15} onClick={() => updateAd(program.id, ad.id, { headlines: [...ad.headlines, ""] })}>Add headline</button>}
          {ad.descriptions.map((description, index) => <div key={index} className={styles.asset}><Field label={`Description ${index + 1}`} value={description} onChange={value => updateAd(program.id, ad.id, { descriptions: ad.descriptions.map((d, i) => i === index ? value : d) })} editing={editing} limit={90} multiline />{editing && <button className={styles.remove} aria-label={`Remove description ${index + 1} from ${ad.label}`} onClick={() => updateAd(program.id, ad.id, { descriptions: ad.descriptions.filter((_, i) => i !== index) })}>Remove</button>}</div>)}
          {editing && <button disabled={ad.descriptions.length >= 4} onClick={() => updateAd(program.id, ad.id, { descriptions: [...ad.descriptions, ""] })}>Add description</button>}
          <Field label="Use this variant when…" value={ad.notes} onChange={notes => updateAd(program.id, ad.id, { notes })} editing={editing} multiline />
          {editing && <button className={styles.remove} onClick={() => updateProgram(program.id, { ads: program.ads.filter(a => a.id !== ad.id) })}>Remove ad variant</button>}
        </article>)}</div>}
        {editing && program && <button onClick={() => updateProgram(program.id, { ads: [...program.ads, { id: newId(), label: "New ad variant", institution: "", headlines: ["", "", ""], descriptions: ["", ""], notes: "Draft — verify eligibility and offer before use." }] })}>Add ad variant</button>}
      </Section>

      <Section id="settings" number="05" title="Campaign settings" detail="Plan changes to budget, targeting and bidding here.">
        <Field label="Campaign name" value={plan.name} onChange={name => setPlan({ ...plan, name })} editing={editing} />
        <Field label="Campaign structure & budget strategy" value={plan.strategy} onChange={strategy => setPlan({ ...plan, strategy })} editing={editing} multiline />
        <div className={styles.settingsGrid}>{([
          ["monthlyBudgetCad", "Monthly budget (CAD)"], ["dailyBudgetCad", "Average daily budget (CAD)"], ["maximumCpcCad", "Maximum CPC (CAD)"], ["locations", "Locations"], ["language", "Language"], ["network", "Network"], ["bidding", "Bidding"], ["locationMode", "Location targeting"], ["automation", "Automation"],
        ] as const).map(([key, label]) => <Field key={key} label={label} value={plan.settings[key]} editing={editing} type={typeof plan.settings[key] === "number" ? "number" : "text"} onChange={value => setPlan({ ...plan, settings: { ...plan.settings, [key]: typeof plan.settings[key] === "number" ? Number(value) : value } })} />)}</div>
      </Section>

      <Section id="notes" number="06" title="Notes & decisions" detail="Keep offers, sources, tracking checks and planning decisions together.">
        <div className={styles.cards}>{plan.notes.map(note => <article className={styles.card} key={note.id}>
          <Field label="Topic" value={note.title} onChange={title => setPlan({ ...plan, notes: plan.notes.map(n => n.id === note.id ? { ...n, title } : n) })} editing={editing} />
          <Field label="Details" value={note.body} onChange={body => setPlan({ ...plan, notes: plan.notes.map(n => n.id === note.id ? { ...n, body } : n) })} editing={editing} multiline />
          {editing && <button className={styles.remove} onClick={() => setPlan({ ...plan, notes: plan.notes.filter(n => n.id !== note.id) })}>Remove note</button>}
        </article>)}</div>
        {editing && <button onClick={() => setPlan({ ...plan, notes: [...plan.notes, { id: newId(), title: "New note", body: "" }] })}>Add note</button>}
        {warnings.length > 0 && <details className={styles.warning}><summary>{warnings.length} checks before using this plan in Google Ads</summary><ul>{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      </Section>

      <Section id="feedback" number="07" title="Feedback & change history" detail="Every saved edit and comment stays with the plan.">
        <div className={styles.feedbackLayout}>
          <div className={styles.card}><h3>Leave feedback</h3><label className={styles.field}>Section<select value={feedbackSection} onChange={e => setFeedbackSection(e.target.value)}>{sections.map(section => <option key={section}>{section}</option>)}</select></label><label className={styles.field}>Your feedback<textarea value={feedbackBody} onChange={e => setFeedbackBody(e.target.value)} placeholder="What should change, and why?" rows={4} maxLength={5000} /></label><button className={styles.primary} disabled={busy || dirty || conflict || !feedbackBody.trim()} onClick={async () => { if (await mutate("POST", { action: "feedback", section: feedbackSection, body: feedbackBody.trim() })) { setFeedbackBody(""); setMessage("Feedback saved and included in the Codex handoff."); } }}>Save feedback</button>{dirty && <p className={styles.helper}>Save your plan changes first.</p>}
            <div className={styles.handoffNote}><h3>Continue in Codex</h3><p>Save → Copy for Codex → paste into BHN Training PLT.</p><p>The handoff includes the plan, all feedback and saved changes. A copy or download does not send it automatically or change Google Ads.</p></div>
          </div>
          <div className={styles.feedbackList}>{state.feedback.length === 0 && <p className={styles.empty}>No feedback yet.</p>}{state.feedback.map(item => <article className={styles.card} key={item.id}><div className={styles.feedbackMeta}><strong>{item.section}</strong><span>{item.status}</span></div><p className={styles.feedbackBody}>{item.body}</p><small>{item.authorName} · {dateLabel(item.createdAt)}</small><button disabled={busy || dirty || conflict} onClick={async () => { if (await mutate("POST", { action: "feedback-status", feedbackId: item.id, status: item.status === "open" ? "resolved" : "open" })) setMessage("Feedback status saved. This does not mark any Google Ads change as applied."); }}>{item.status === "open" ? "Mark reviewed" : "Reopen"}</button></article>)}</div>
        </div>
        <h3 className={styles.historyHeading}>Saved changes</h3>
        {state.history.length === 0 && <p className={styles.empty}>History begins when you save a change or add feedback.</p>}
        {state.history.map(event => <details className={styles.historyEvent} key={event.id}><summary><strong>{event.summary}</strong><span>{event.actorName} · {dateLabel(event.createdAt)}</span></summary><p>Revision {event.revision} · {event.kind}</p>{event.changes.map((change, i) => <div key={i} className={styles.change}><strong>{change.path}</strong><div><span>Before</span><pre>{typeof change.before === "string" ? change.before : JSON.stringify(change.before, null, 2) || "—"}</pre></div><div><span>After</span><pre>{typeof change.after === "string" ? change.after : JSON.stringify(change.after, null, 2) || "—"}</pre></div></div>)}</details>)}
        {state.historyNextCursor && <button onClick={loadMoreHistory} disabled={busy}>Load older changes</button>}
      </Section>
      </fieldset>
    </div>
  </div>;
}
