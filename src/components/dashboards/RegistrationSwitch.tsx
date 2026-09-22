"use client";

/**
 * The Training Week registration switch, on the admin dashboard.
 *
 * Three words rather than a toggle, because "off" was doing two jobs:
 * a coordinator pausing for ten minutes and a programme that has
 * finished taking people both showed a registrant "Registration is
 * closed." Pressing a state asks first — this is the one control here
 * that changes what the public sees.
 */
import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Loader2, PauseCircle, Power, XCircle } from "lucide-react";
import {
  REGISTRATION_STATES, STATE_COPY, type RegistrationState,
} from "@/lib/registration/state";

interface Switch {
  state: RegistrationState;
  at: string | null;
  by: string | null;
  forms: { slug: string; active: boolean }[];
}

const ICON = { open: DoorOpen, paused: PauseCircle, closed: XCircle } as const;
const TONE: Record<RegistrationState, string> = {
  open: "border-emerald-400 bg-emerald-50 text-emerald-800",
  paused: "border-amber-400 bg-amber-50 text-amber-800",
  closed: "border-rose-400 bg-rose-50 text-rose-800",
};

export function RegistrationSwitch() {
  const [data, setData] = useState<Switch | null>(null);
  const [armed, setArmed] = useState<RegistrationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/registration-state", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Switch);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const move = async (state: RegistrationState) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/registration-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Switch);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setArmed(null);
    }
  };

  const state = data?.state;
  const Now = state ? ICON[state] : Power;

  return (
    <article className="aero-frame">
      <div className="aero-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="aero-h"><Power size={14} /> Training Week registration</h3>
            <p className="aero-gloss">
              {failed
                ? "Couldn’t reach the switch just now."
                : data
                  ? `${STATE_COPY[data.state].gist}${data.at ? ` Last moved ${new Date(data.at).toLocaleString("en-CA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${data.by ? ` by ${data.by}` : ""}.` : ""}`
                  : "Reading the switch…"}
            </p>
          </div>
          {state && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold ${TONE[state]}`}>
              <Now size={13} /> {STATE_COPY[state].label}
            </span>
          )}
        </div>

        {armed ? (
          <div className="rounded-xl border-2 border-line-strong bg-elevated/50 p-3">
            <p className="text-[13px] font-semibold text-fg">
              {armed === "open"
                ? "Open registration to the public?"
                : armed === "paused"
                  ? "Pause registration? Nobody will be able to register until you open it again."
                  : "Close registration? The form will say registration has closed."}
            </p>
            <p className="mt-1 text-[12px] text-muted">{STATE_COPY[armed].gist} Registrations already in are untouched.</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void move(armed)}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : null} Yes, {STATE_COPY[armed].doing.toLowerCase()}
              </button>
              <button type="button" disabled={busy} onClick={() => setArmed(null)} className="px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-fg">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {REGISTRATION_STATES.map((s) => {
              const Icon = ICON[s];
              const now = s === state;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!data || busy || now}
                  onClick={() => setArmed(s)}
                  title={STATE_COPY[s].gist}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${
                    now ? TONE[s] : "border-line text-fg hover:bg-elevated"
                  }`}
                >
                  <Icon size={13} /> {now ? `${STATE_COPY[s].label} now` : STATE_COPY[s].doing}
                </button>
              );
            })}
          </div>
        )}

        {data && data.forms.length > 0 && (
          <p className="text-[11.5px] text-muted">
            {data.forms.length === 1 ? "The form it holds: " : "Both versions move together: "}
            {data.forms.map((f, i) => (
              <span key={f.slug}>
                {i > 0 && ", "}
                <a href={`/apply/${f.slug}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                  /apply/{f.slug}
                </a>{" "}
                <span className={f.active ? "text-emerald-700" : "text-muted"}>({f.active ? "taking registrations" : "not taking registrations"})</span>
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}
