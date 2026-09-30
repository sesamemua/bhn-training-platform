"use client";

/**
 * The public sign-up form for a filming slot: name, email, a time picked
 * on the day's chart (preparation included), and whether they need
 * parking. After sending, it shows their times back to them.
 */
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { clockOf } from "@/lib/video/filming";
import type { Offer, Span } from "@/lib/video/signup";
import { signUpForFilming } from "@/lib/video/signup-actions";
import { SlotChart } from "@/components/workspace/SlotChart";

const INPUT = "w-full rounded-lg border border-line bg-card-solid px-3 py-2 text-[14px] text-fg focus:border-brand-400 focus:outline-none";

export function FilmSignupForm({ token, from, to, slot, prep, taken, offers, where, when }: {
  token: string; from: string; to: string; slot: number; prep: number;
  taken: Span[]; offers: Offer[]; where: string; when: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [start, setStart] = useState<number | null>(null);
  const [parking, setParking] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (done != null) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <p className="inline-flex items-center gap-2 text-[16px] font-bold text-fg"><Check size={18} className="text-emerald-600" /> You&apos;re on the schedule, {name.split(" ")[0]}.</p>
        <ul className="mt-2 space-y-1 text-[14px] text-fg">
          <li><strong>{when}</strong>{where && <> · {where}</>}</li>
          <li>Arrive for preparation at <strong>{clockOf(done)}</strong> — make-up and going through the questions.</li>
          <li>On camera <strong>{clockOf(done + prep)}–{clockOf(done + slot)}</strong>.</li>
          {parking && <li>We&apos;ve noted that you need a parking spot.</li>}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">The team will be in touch to confirm. Need to change your time? Reply to them rather than signing up again.</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (start == null) return setError("Pick a time on the chart.");
    if (parking == null) return setError("Tell us whether you need parking.");
    setBusy(true); setError(null);
    try {
      const r = await signUpForFilming(token, { name, email, start, parking });
      if (r.ok) setDone(start);
      else setError(r.error);
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  };

  const free = offers.filter((o) => o.ok);
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[13px] font-semibold text-fg">Your name
          <input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" className={`${INPUT} mt-1`} />
        </label>
        <label className="block text-[13px] font-semibold text-fg">Email
          <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={160} autoComplete="email" className={`${INPUT} mt-1`} />
        </label>
      </div>

      <fieldset>
        <legend className="text-[13px] font-semibold text-fg">Your time</legend>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Each slot is {slot} minutes: {prep} minutes of preparation (make-up, going through the questions), then {slot - prep} on camera.
          Grey is already taken. Click the chart or a time below.
        </p>
        <div className="mt-2"><SlotChart from={from} to={to} taken={taken} pick={start} slot={slot} prep={prep} offers={offers} onPick={setStart} /></div>
        {free.length === 0 ? (
          <p className="mt-2 text-[13px] font-semibold text-rose-600">Every time has been taken.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {offers.map((o) => (
              <button
                key={o.start}
                type="button"
                disabled={!o.ok}
                onClick={() => setStart(o.start)}
                aria-pressed={start === o.start}
                className={`rounded-md border px-2 py-1 text-[12.5px] font-semibold tabular-nums ${
                  start === o.start ? "border-brand-600 bg-brand-600 text-white" : o.ok ? "border-line text-fg hover:border-brand-400" : "border-transparent text-subtle line-through opacity-50"
                }`}
              >
                {clockOf(o.start)}
              </button>
            ))}
          </div>
        )}
        {start != null && (
          <p className="mt-2 text-[13px] text-fg">
            Preparation from <strong>{clockOf(start)}</strong>, on camera <strong>{clockOf(start + prep)}–{clockOf(start + slot)}</strong>.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-semibold text-fg">Do you need a parking spot?</legend>
        <div className="mt-1.5 flex gap-2">
          {[["Yes", true], ["No", false]].map(([label, v]) => (
            <label key={String(v)} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${parking === v ? "border-brand-600 bg-brand-500/10 text-fg" : "border-line text-muted"}`}>
              <input id={`signup-parking-${label}`} type="radio" name="parking" checked={parking === v} onChange={() => setParking(v as boolean)} className="accent-brand-600" />
              {label as string}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-[13px] font-semibold text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {busy && <Loader2 size={15} className="animate-spin" />} Sign me up
      </button>
    </form>
  );
}
