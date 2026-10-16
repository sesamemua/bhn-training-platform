"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { PLAN_SESSIONS, type PlanSession, type PlanSnapshot } from "@/lib/events/people-plan";
import type { PublicationState } from "@/lib/events/people-publication";
import { speakerSessionActions, type WebsitePeople } from "@/lib/events/speaker-session-actions";

type Data = { roster: PlanSnapshot; state: PublicationState; website: WebsitePeople };
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg hover:bg-elevated disabled:opacity-40";

export default function SpeakerSessionActions({ onReview, reviewDisabled = false, framed = false, chooseSession = true }: {
  onReview: (id: string, session: PlanSession | null) => void; reviewDisabled?: boolean; framed?: boolean;
  /** Off on the dashboard: there each person is just a way into the speaker screen, which has every session option. */
  chooseSession?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [choices, setChoices] = useState<Record<string, PlanSession | "">>({});
  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const load = async () => {
      if (loading || busyRef.current) return;
      loading = true;
      try {
        const publication = await fetch("/api/admin/symposium-people/publication", { cache: "no-store" });
        const body = await publication.json();
        if (!publication.ok) throw new Error(body.error || "Couldn't load submissions.");
        const response = await fetch("/api/admin/symposium-people/website-status", { cache: "no-store" });
        const website = await response.json();
        if (!response.ok) throw new Error(website.error);
        if (!cancelled && !busyRef.current) { setData({ ...body, website }); setError(""); }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Couldn't check the website."); setData(null); }
      } finally { loading = false; }
    };
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [retry]);

  async function review(id: string, session: PlanSession | null, savedDraft: boolean) {
    if (!data || busyRef.current || reviewDisabled) return;
    busyRef.current = true; setBusy(id); setError("");
    try {
      if (session && !savedDraft) {
        const response = await fetch("/api/admin/symposium-people", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: data.roster.version, change: { action: "assign", id, session } }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Couldn't save the session. Refresh and try again.");
      }
      onReview(id, savedDraft ? null : session);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the session."); }
    finally { busyRef.current = false; setBusy(""); }
  }
  const actions = data ? speakerSessionActions(data.roster, data.state, data.website) : [];
  return <section aria-label="Speaker action items" className={framed ? "aero-frame [overflow-wrap:anywhere]" : "mb-5 border-l-4 border-brand bg-elevated/50 p-4 [overflow-wrap:anywhere]"}><div className={framed ? "aero-card" : ""}>
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-bold text-fg">Headshots &amp; bios action items{data ? ` (${actions.length})` : ""}</h2>
      <button type="button" className={BUTTON} title="Check website again" aria-label="Check website again" disabled={!!busy} onClick={() => setRetry((n) => n + 1)}><RefreshCw size={16} /></button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-fg">{error}</p>}
    {reviewDisabled && <p role="status" className="mt-2 text-sm text-muted">A website profile has unsaved changes. Save or discard it in Website publishing before reviewing another person.</p>}
    {!data && !error && <p role="status" className="mt-2 text-sm text-muted">Checking submissions against the symposium website...</p>}
    {data && actions.length === 0 && <p className="mt-2 text-sm text-muted">No submitted speakers need a website session review.</p>}
    <div className="divide-y divide-line">{actions.map(({ person, speaker, draft, awaitingSync }) => {
      const choice = choices[person.id] ?? person.session ?? "";
      return <div key={person.id} className="grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0"><p className="font-semibold text-fg">{speaker.fullName}</p><p className="text-sm text-muted">{[speaker.title, speaker.organization].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-sm text-fg">{awaitingSync ? "Approved; waiting for the website to update." : "Submitted, but not listed on the symposium website."}</p>
        </div>
        {!awaitingSync && <div className="min-w-0 space-y-2">
          {!draft && chooseSession && <label className="block text-sm font-medium text-fg" htmlFor={`speaker-session-${person.id}`}>Choose a session
            <select id={`speaker-session-${person.id}`} className="mt-1 w-full min-w-0 rounded-md border border-line bg-card-solid px-2 py-2 text-sm text-fg" disabled={!!busy} value={choice} onChange={(e) => setChoices((p) => ({ ...p, [person.id]: e.target.value as PlanSession | "" }))}>
              <option value="">Select a session</option>{Object.entries(PLAN_SESSIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>}
          {chooseSession || draft
            ? <button type="button" className={BUTTON} disabled={reviewDisabled || !!busy || (!draft && !choice)} onClick={() => void review(person.id, choice || null, !!draft)}><ArrowRight size={16} />{busy === person.id ? "Saving..." : draft ? "Review website draft" : "Save session & review profile"}</button>
            // Nothing saved from here: the next screen is where the session is chosen.
            : <button type="button" className={BUTTON} disabled={reviewDisabled || !!busy} onClick={() => onReview(person.id, null)}><ArrowRight size={16} />Choose a session &amp; review profile</button>}
        </div>}
      </div>;
    })}</div>
  </div></section>;
}
