"use client";

/**
 * The team's side of filming sign-ups: open or close the public link,
 * copy it, set the slot (length, preparation, the hours people can pick
 * from), see the chart as trainees see it, and the list of who signed up.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, X } from "lucide-react";
import { clockOf } from "@/lib/video/filming";
import type { Offer, Span } from "@/lib/video/signup";
import { newSignupLink, removeSignup, saveSignupSettings, setSignupsOpen } from "@/lib/video/signup-actions";
import { SlotChart } from "@/components/workspace/SlotChart";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

export interface SignupRow { id: string; name: string; email: string; parking: boolean; signedUpAt: string; start: number | null; end: number | null }
const INPUT = "rounded-md border border-line bg-card-solid px-2 py-1 text-[12.5px] text-fg focus:border-brand-400 focus:outline-none";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12.5px] font-semibold text-fg hover:border-brand-400 disabled:opacity-50";

export function SignupAdmin({ scheduleId, link, isOpen, settings, taken, offers, rows }: {
  scheduleId: string; link: string | null; isOpen: boolean;
  settings: { openFrom: string; openTo: string; slotMinutes: number; prepMinutes: number };
  taken: Span[]; offers: Offer[]; rows: SignupRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "That didn't save.");
    router.refresh();
  });
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const free = offers.filter((o) => o.ok).length;

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${isOpen ? "bg-emerald-500/15 text-emerald-700" : "bg-elevated text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${isOpen ? "bg-emerald-500" : "bg-subtle"}`} aria-hidden />
          {isOpen ? "Sign-ups open" : "Sign-ups closed"}
        </span>
        <button type="button" disabled={pending} onClick={() => run(() => setSignupsOpen(scheduleId, !isOpen))} className={BTN}>
          {pending && <Loader2 size={12} className="animate-spin" />}{isOpen ? "Close sign-ups" : link ? "Open sign-ups" : "Create the link and open sign-ups"}
        </button>
        {link && (
          <>
            <code className="min-w-0 max-w-full flex-1 truncate rounded-md bg-elevated/60 px-2 py-1 text-[12px] text-fg">{link}</code>
            <button type="button" className={BTN} onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? <><Check size={12} className="text-emerald-600" /> Copied</> : <><Copy size={12} /> Copy link</>}
            </button>
            <a href={link} target="_blank" rel="noreferrer" className={BTN}>Open as a trainee</a>
            <ConfirmPopover message="Make a new link?" detail="The current link stops working; anyone who has it will need the new one." confirmLabel="New link" onConfirm={() => run(() => newSignupLink(scheduleId))}>
              {(open) => <button type="button" onClick={open} className={BTN}>New link</button>}
            </ConfirmPopover>
          </>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-end gap-3 text-[12px] text-muted">
          <label className="flex flex-col gap-0.5">Slots from<input id="signup-from" type="time" step={900} value={s.openFrom} onChange={(e) => setS({ ...s, openFrom: e.target.value })} className={INPUT} /></label>
          <label className="flex flex-col gap-0.5">until<input id="signup-to" type="time" step={900} value={s.openTo} onChange={(e) => setS({ ...s, openTo: e.target.value })} className={INPUT} /></label>
          <label className="flex flex-col gap-0.5">Slot length (min)<input id="signup-slot" type="number" min={10} max={240} step={5} value={s.slotMinutes} onChange={(e) => setS({ ...s, slotMinutes: Number(e.target.value) })} className={`${INPUT} w-24`} /></label>
          <label className="flex flex-col gap-0.5">of which preparation (min)<input id="signup-prep" type="number" min={0} max={120} step={5} value={s.prepMinutes} onChange={(e) => setS({ ...s, prepMinutes: Number(e.target.value) })} className={`${INPUT} w-24`} /></label>
          <button type="button" disabled={!dirty || pending} onClick={() => run(() => saveSignupSettings(scheduleId, s))} className="rounded-lg bg-brand-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Save</button>
          <span className="text-[12px]">{free} of {offers.length} start times free</span>
        </div>
        <SlotChart from={settings.openFrom} to={settings.openTo} taken={taken} pick={null} slot={settings.slotMinutes} prep={settings.prepMinutes} />
        <p className="text-[11.5px] text-muted">
          Grey is camera time on locked tasks — trainees can pick any start whose camera time misses them; preparation can overlap.
          Each sign-up lands on the Filming day as a locked interview, so nobody else can take it; unlock it there to move it. No email goes out — confirm people yourselves.
        </p>
        {error && <p role="alert" className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border border-line bg-card">
        <h2 className="border-b border-line px-3 py-2 text-[13px] font-bold text-fg">Signed up · {rows.length}{rows.some((r) => r.parking) && <span className="font-normal text-muted"> · {rows.filter((r) => r.parking).length} need parking</span>}</h2>
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-[12.5px] italic text-subtle">Nobody yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-subtle">
                <tr><th className="px-3 py-1.5 font-semibold">Name</th><th className="px-3 font-semibold">Email</th><th className="px-3 font-semibold">Preparation · on camera</th><th className="px-3 font-semibold">Parking</th><th className="px-3 font-semibold">Signed up</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-1.5 font-semibold text-fg">{r.name}</td>
                    <td className="px-3 text-muted">{r.email}</td>
                    <td className="px-3 tabular-nums text-fg">{r.start != null && r.end != null ? `${clockOf(r.start)} · ${clockOf(r.start + settings.prepMinutes)}–${clockOf(r.end)}` : <span className="italic text-amber-600">slot removed</span>}</td>
                    <td className="px-3">{r.parking ? <span className="font-semibold text-amber-700">Needs a spot</span> : <span className="text-subtle">No</span>}</td>
                    <td className="px-3 text-muted">{new Date(r.signedUpAt).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="px-2 text-right">
                      <ConfirmPopover message={`Remove ${r.name}?`} detail="Their slot comes off the Filming day too." confirmLabel="Remove" tone="danger" onConfirm={() => run(() => removeSignup(r.id))}>
                        {(open) => <button type="button" onClick={open} aria-label={`Remove ${r.name}`} className="rounded p-1 text-subtle hover:text-rose-500"><X size={13} /></button>}
                      </ConfirmPopover>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
