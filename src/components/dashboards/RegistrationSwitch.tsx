"use client";

/**
 * The Training Week registration switch, on the admin dashboard.
 *
 * Drawn as a switch rather than three buttons, because that is what it
 * is: one control, three positions, and only one of them true at a
 * time. The lever sits on the position the form is actually in, so the
 * state is read at a glance instead of inferred from which button is
 * highlighted.
 *
 * Beside it, what the switch is holding: people registered, how many
 * this week, how many are on no programme list, and when the last one
 * came in. Closing at 4 and closing at 140 are different decisions.
 *
 * Moving it asks first — this is the one control on the dashboard that
 * changes what the public sees.
 */
import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Loader2, PauseCircle, Power, XCircle } from "lucide-react";
import {
  REGISTRATION_STATES, STATE_COPY, type RegistrationState,
} from "@/lib/registration/state";

interface Stats {
  people: number;
  lastWeek: number;
  notOnList: number;
  latest: string | null;
}

interface Switch {
  state: RegistrationState;
  at: string | null;
  by: string | null;
  forms: { slug: string; active: boolean }[];
  stats: Stats;
}

const ICON = { open: DoorOpen, paused: PauseCircle, closed: XCircle } as const;

/** One palette per position, used by the lever, the lamp and the rail. */
const TONE: Record<RegistrationState, { rail: string; knob: string; lamp: string; text: string; chip: string }> = {
  open: {
    rail: "bg-emerald-500/15",
    knob: "bg-emerald-600 text-white shadow-[0_2px_10px_rgba(5,150,105,.45)]",
    lamp: "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.25)]",
    text: "text-emerald-800",
    chip: "border-emerald-400 bg-emerald-50 text-emerald-800",
  },
  paused: {
    rail: "bg-amber-500/15",
    knob: "bg-amber-500 text-white shadow-[0_2px_10px_rgba(217,119,6,.45)]",
    lamp: "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,.25)]",
    text: "text-amber-800",
    chip: "border-amber-400 bg-amber-50 text-amber-800",
  },
  closed: {
    rail: "bg-rose-500/15",
    knob: "bg-rose-600 text-white shadow-[0_2px_10px_rgba(225,29,72,.45)]",
    lamp: "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,.25)]",
    text: "text-rose-800",
    chip: "border-rose-400 bg-rose-50 text-rose-800",
  },
};

/** "today", "yesterday", "3 days ago" — how alive the form is, without arithmetic. */
function ago(iso: string | null): string {
  if (!iso) return "none yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

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
  const tone = TONE[state ?? "closed"];
  const at = REGISTRATION_STATES.indexOf(state ?? "closed");

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
                  ? `${STATE_COPY[data.state].gist}${data.at ? ` Moved ${new Date(data.at).toLocaleString("en-CA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${data.by ? ` by ${data.by}` : ""}.` : ""}`
                  : "Reading the switch…"}
            </p>
          </div>
          {state && (
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-bold ${tone.chip}`}>
              <span className={`h-2 w-2 rounded-full ${tone.lamp}`} aria-hidden />
              {STATE_COPY[state].label}
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center">
          {/* ── the switch ─────────────────────────────────────────── */}
          <div
            role="radiogroup"
            aria-label="Training Week registration"
            className={`relative rounded-2xl border border-line-strong p-1.5 transition-colors ${tone.rail}`}
          >
            {/* The lever: one knob that travels to the position it is in,
                so the state is a place rather than a highlight. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-y-1.5 left-1.5 rounded-xl transition-transform duration-200 ease-out ${tone.knob} ${data ? "" : "opacity-40"}`}
              style={{ width: "calc((100% - 0.75rem) / 3)", transform: `translateX(${at * 100}%)` }}
            />
            <div className="relative grid grid-cols-3">
              {REGISTRATION_STATES.map((s) => {
                const Icon = ICON[s];
                const now = s === state;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={now}
                    disabled={!data || busy || now}
                    onClick={() => setArmed(s)}
                    title={STATE_COPY[s].gist}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11.5px] font-bold uppercase tracking-wide transition-colors disabled:cursor-default ${
                      now ? "text-white" : "text-muted hover:text-fg"
                    }`}
                  >
                    <Icon size={16} />
                    {STATE_COPY[s].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── what it is holding ─────────────────────────────────── */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="Registered" value={data ? data.stats.people.toLocaleString() : "—"} />
            <Stat label="This week" value={data ? data.stats.lastWeek.toLocaleString() : "—"} />
            <Stat
              label="Not on a list"
              value={data ? data.stats.notOnList.toLocaleString() : "—"}
              tone={data && data.stats.notOnList > 0 ? "text-amber-700" : undefined}
            />
            <Stat label="Last one" value={data ? ago(data.stats.latest) : "—"} small />
          </dl>
        </div>

        {armed && (
          <div className="rounded-xl border-2 border-line-strong bg-elevated/50 p-3">
            <p className="text-[13px] font-semibold text-fg">
              {armed === "open"
                ? "Open registration to the public?"
                : armed === "paused"
                  ? "Pause registration? Nobody can register until you open it again."
                  : "Close registration? The form will say registration has closed."}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {STATE_COPY[armed].gist}{" "}
              {data ? `The ${data.stats.people.toLocaleString()} already registered are untouched.` : ""}
            </p>
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

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className={`${small ? "text-[15px]" : "text-[22px]"} font-bold leading-tight tabular-nums ${tone ?? "text-fg"}`}>
        {value}
      </dd>
    </div>
  );
}
