"use client";

/**
 * Open, Full or Closed for each session — what the registration form
 * lets people pick, and what biohubnet.ca shows. A Full or Closed
 * session stays on the form's calendar with its message, but cannot be
 * chosen. Each change saves straight away.
 */
import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { DEFAULT_MESSAGE, STATES, STATE_LABEL, statusOf, type StatusMap, type WorkshopState } from "@/lib/training-week/workshop-status";
import { saveWorkshopStatus } from "@/app/(dashboard)/admin/workspace/training-admin/actions";

const TONE: Record<WorkshopState, string> = {
  open: "bg-emerald-600 text-white",
  full: "bg-amber-500 text-white",
  closed: "bg-rose-600 text-white",
};

export function WorkshopSwitches({ initial, sessions, feedUrl, formUrl }: {
  initial: StatusMap;
  sessions: { slug: string; title: string; option: string }[];
  feedUrl: string;
  formUrl: string;
}) {
  const [map, setMap] = useState(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [, start] = useTransition();

  const save = (next: StatusMap) => {
    setMap(next);
    setSaved("saving");
    start(async () => {
      const r = await saveWorkshopStatus(next);
      setSaved(r.ok ? "saved" : "error");
      setProblem(r.ok ? null : r.problem);
    });
  };
  const set = (slug: string, patch: Partial<{ state: WorkshopState; message: string }>) =>
    save({ ...map, [slug]: { ...statusOf(map, slug), ...patch } });

  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-bold text-fg">Registration, per session</h2>
        <span className="text-[12px] text-subtle" role="status">
          {saved === "saving" ? <><Loader2 size={11} className="inline animate-spin" /> Saving…</>
            : saved === "saved" ? <><Check size={11} className="inline text-emerald-600" /> Saved — the form and biohubnet.ca update within a minute</>
            : saved === "error" ? <span className="text-rose-600">{problem ?? "Not saved"}</span> : null}
        </span>
      </div>
      <p className="mt-1 max-w-3xl text-[12.5px] text-muted">
        <strong className="text-fg">Full</strong> or <strong className="text-fg">Closed</strong> keeps the session on the form&apos;s calendar with your message, but nobody can pick it, and a submission that asks for it is refused.
        Seats already given out are not touched. The same status and message go to biohubnet.ca.
      </p>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {sessions.map((s) => {
          const e = statusOf(map, s.slug);
          return (
            <li key={s.slug} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-[14rem] flex-1">
                <p className="text-[13.5px] font-semibold text-fg">{s.title}</p>
                <p className="text-[11.5px] text-subtle">{s.option.split(" · ").slice(0, 2).join(" · ")}</p>
              </div>
              <div role="radiogroup" aria-label={`Registration for ${s.title}`} className="inline-flex overflow-hidden rounded-lg border border-line">
                {STATES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={e.state === st}
                    onClick={() => e.state !== st && set(s.slug, { state: st })}
                    className={`px-3 py-1 text-[12.5px] font-semibold transition-colors ${e.state === st ? TONE[st] : "text-muted hover:bg-elevated hover:text-fg"}`}
                  >
                    {STATE_LABEL[st]}
                  </button>
                ))}
              </div>
              {e.state !== "open" && (
                <label className="basis-full text-[11.5px] text-muted">
                  Message people see
                  <input
                    id={`ws-msg-${s.slug}`}
                    defaultValue={e.message}
                    placeholder={DEFAULT_MESSAGE[e.state]}
                    maxLength={300}
                    onBlur={(ev) => ev.target.value.trim() !== e.message && set(s.slug, { message: ev.target.value.trim() })}
                    onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                    className="mt-0.5 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg outline-none focus-visible:border-brand-500"
                  />
                  <span className="text-[11px] text-subtle">Left empty, it says: &ldquo;{DEFAULT_MESSAGE[e.state]}&rdquo;</span>
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">See the registration form <ExternalLink size={11} /></a>
        <a href={feedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">The feed biohubnet.ca reads <ExternalLink size={11} /></a>
      </p>
    </section>
  );
}
