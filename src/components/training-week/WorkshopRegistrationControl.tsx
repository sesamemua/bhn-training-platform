"use client";

import { useState, useTransition } from "react";
import { DoorOpen, Pause, X, Loader2 } from "lucide-react";
import { STATE_LABEL, type WorkshopState } from "@/lib/training-week/workshop-status";

export type SaveWorkshopRegistration = (slug: string, state: string) => Promise<{ ok: boolean; problem?: string }>;
const choices = [{ state: "open", label: "Open", Icon: DoorOpen }, { state: "paused", label: "Pause", Icon: Pause }, { state: "closed", label: "Close", Icon: X }] as const;

export function WorkshopRegistrationControl({ slug, title, initial, save }: {
  slug: string; title: string; initial: WorkshopState; save: SaveWorkshopRegistration;
}) {
  const [state, setState] = useState(initial);
  const [armed, setArmed] = useState<WorkshopState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // Legacy Full blocks registration just like Pause; keep its capacity reason.
  const selected = state === "full" ? "paused" : state;
  return <div className="text-[11px]">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted">Registration: <strong className="text-fg">{STATE_LABEL[selected]}</strong>{state === "full" && <span> · Capacity reached</span>}</span>
      <div role="group" aria-label={`Registration for ${title}`} className="inline-flex rounded-md border border-line p-0.5">
        {choices.map(({ state: next, label, Icon }) => <button key={next} type="button" aria-pressed={selected === next} disabled={busy} onClick={() => { setProblem(null); setArmed(next === selected ? null : next); }} className={`inline-flex items-center gap-1 rounded px-2 py-1.5 font-semibold disabled:opacity-50 ${selected === next ? "bg-teal-700 text-white" : "text-muted hover:bg-elevated"}`}><Icon size={12} />{label}</button>)}
      </div>
    </div>
    {armed && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated p-2" role="group" aria-label={`Confirm registration change for ${title}`}>
      <p className="basis-full text-fg">Set {title} registration to {STATE_LABEL[armed].toLowerCase()}? Existing registrations and approvals stay unchanged.</p>
      <button type="button" disabled={busy} className="inline-flex items-center gap-1 rounded bg-brand-600 px-2 py-1.5 font-semibold text-white disabled:opacity-50" onClick={() => start(async () => {
        try {
          const result = await save(slug, armed);
          if (!result.ok) { setProblem(result.problem ?? "Not saved. Please try again."); return; }
          setState(armed); setArmed(null); setProblem(null);
        } catch { setProblem("Not saved. Please try again."); }
      })}>{busy && <Loader2 size={12} className="animate-spin" />}Confirm</button>
      <button type="button" disabled={busy} onClick={() => setArmed(null)} className="px-2 py-1.5 text-muted">Cancel</button>
    </div>}
    {problem && <p role="alert" className="mt-1 text-rose-600">{problem}</p>}
  </div>;
}
