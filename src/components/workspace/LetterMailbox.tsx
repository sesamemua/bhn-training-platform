"use client";

/**
 * The letters waiting to go out, as a mailbox that floats at the top of
 * Training Week admin. Every approve / waitlist / decline sends an
 * envelope flying into it and the count goes up; nothing is emailed
 * until the coordinator opens it and presses Send.
 *
 * One letter per PERSON, however many of their sessions were decided —
 * the list shows what each person's letter will say, and its preview.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Mail, RotateCcw, Send, X } from "lucide-react";
import { holdLetters, lettersOwed, sendAllPersonLetters, sendPersonLetterFor, type OwedLetter } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { AnchoredCard, currentAnchor } from "@/components/ui/AnchoredCard";
import { receiptLine } from "@/lib/formbuilder/receipt";

const QUEUED = "bhn:letter-queued";
const CHANGED = "bhn:letters-changed";

/** Call after a decision that now owes a letter: an envelope flies from the button just pressed. */
export function queueLetterFx() {
  window.dispatchEvent(new CustomEvent(QUEUED, { detail: { from: currentAnchor() } }));
}
/** Call after letters were sent elsewhere, so the count follows. */
export function lettersChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED));
}

const ENVELOPE = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;

const TONE: Record<string, string> = {
  Approved: "bg-emerald-500/12 text-emerald-700",
  Waitlisted: "bg-amber-500/12 text-amber-700",
  Released: "bg-rose-500/10 text-rose-700",
  Declined: "bg-rose-500/10 text-rose-700",
};

export function LetterMailbox() {
  const router = useRouter();
  const box = useRef<HTMLButtonElement>(null);
  const [owed, setOwed] = useState<OwedLetter[] | null>(null);
  const [bump, setBump] = useState(0);
  const [open, setOpen] = useState<DOMRect | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { lettersOwed().then(setOwed).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  // An envelope flies from the decision button into the box; then the count catches up.
  useEffect(() => {
    const fly = (e: Event) => {
      const from = (e as CustomEvent<{ from: DOMRect | null }>).detail?.from;
      const to = box.current?.getBoundingClientRect();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!from || !to || reduced) { load(); setBump((b) => b + 1); return; }
      const el = document.createElement("div");
      el.innerHTML = ENVELOPE;
      Object.assign(el.style, {
        position: "fixed", left: "0px", top: "0px", zIndex: "80", pointerEvents: "none",
        color: "#fff", background: "#1f7a8c", borderRadius: "8px", padding: "5px", boxShadow: "0 6px 18px rgba(0,0,0,.25)",
      });
      document.body.appendChild(el);
      const x0 = from.left + from.width / 2 - 16, y0 = from.top + from.height / 2 - 16;
      const x1 = to.left + to.width / 2 - 16, y1 = to.top + to.height / 2 - 16;
      const midX = (x0 + x1) / 2, midY = Math.min(y0, y1) - 90;
      const anim = el.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(1) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${midX}px, ${midY}px) scale(1.15) rotate(-12deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${x1}px, ${y1}px) scale(.35) rotate(0deg)`, opacity: 0.3 },
      ], { duration: 800, easing: "cubic-bezier(.45,0,.2,1)" });
      const done = () => { el.remove(); load(); setBump((b) => b + 1); };
      anim.onfinish = done;
      anim.oncancel = done;
    };
    const changed = () => load();
    window.addEventListener(QUEUED, fly);
    window.addEventListener(CHANGED, changed);
    return () => { window.removeEventListener(QUEUED, fly); window.removeEventListener(CHANGED, changed); };
  }, [load]);

  // In the box: people with something left to tell them. Taken out: seats removed from this round.
  const waiting = (owed ?? []).filter((o) => o.seats.length);
  const removed = (owed ?? []).filter((o) => o.removed.length);
  const count = waiting.length;
  async function hold(ids: string[], on: boolean) {
    setBusy("hold");
    await holdLetters(ids, on);
    setBusy(null);
    load();
  }

  async function sendOne(o: OwedLetter) {
    setBusy(o.key); setSaid(null);
    const r = await sendPersonLetterFor(o.key);
    setBusy(null); setSure(null);
    setSaid(r.problem ?? (r.receipt ? `${o.name}: ${receiptLine(r.receipt)}` : `Nothing to send to ${o.name}.`));
    load(); router.refresh();
  }
  async function sendAll() {
    setBusy("all"); setSaid(null);
    const r = await sendAllPersonLetters();
    setBusy(null); setSure(null);
    setSaid(`Sent ${r.sent} letter${r.sent === 1 ? "" : "s"}.${r.notSent ? ` ${r.notSent} did not go out — they stay here; open one to see why.` : ""}`);
    load(); router.refresh();
  }

  return (
    <>
      <button
        ref={box}
        type="button"
        onClick={(e) => setOpen(open ? null : e.currentTarget.getBoundingClientRect())}
        aria-expanded={!!open}
        aria-label={`${count} letter${count === 1 ? "" : "s"} waiting to be sent`}
        className={`fixed right-5 top-5 z-40 inline-flex items-center gap-2.5 rounded-2xl border-2 px-4 py-2.5 shadow-lg transition-colors ${
          count ? "border-brand-400 bg-card-solid text-fg" : "border-line bg-card-solid text-muted"
        }`}
      >
        <span key={bump} className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white animate-[mailbox-bump_.5s_ease-out]">
          <Mail size={19} />
          {count > 0 && (
            <span className="absolute -right-2 -top-2 grid min-w-[1.4rem] place-items-center rounded-full bg-rose-500 px-1 text-[11.5px] font-extrabold leading-[1.4rem] text-white shadow">
              {count}
            </span>
          )}
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[13.5px] font-bold">{count ? `${count} letter${count === 1 ? "" : "s"} to send` : "No letters waiting"}</span>
          <span className="block text-[11px] text-subtle">One per person · nothing goes until you send</span>
        </span>
      </button>
      <style>{`@keyframes mailbox-bump { 0% { transform: scale(1) } 35% { transform: scale(1.25) } 100% { transform: scale(1) } }`}</style>

      {open && (
        <AnchoredCard anchor={open} width={620} label="Letters waiting" onDismiss={() => { if (!busy) { setOpen(null); setSure(null); } }}>
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[14px] font-bold text-fg">Letters waiting · {count}</p>
              <p className="text-[11px] text-subtle">One email per person, covering every session of theirs just decided.</p>
            </div>
            {said && <p role="status" className="mt-2 rounded-md bg-elevated px-2 py-1 text-[12px] text-fg">{said}</p>}
            {count === 0 ? (
              <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-emerald-700"><Check size={14} /> Everybody has been told where they stand.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {waiting.map((o) => (
                  <li key={o.key} className="px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-fg">{o.name}</span>
                      <span className="font-mono text-[11px] text-subtle">{o.email || "no email address"}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        <button type="button" onClick={() => setPreview(preview === o.key ? null : o.key)} aria-expanded={preview === o.key} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-muted hover:bg-elevated hover:text-fg">
                          <ChevronDown size={12} className={preview === o.key ? "rotate-180" : ""} /> {preview === o.key ? "Hide email" : "Show email"}
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => hold(o.seats.map((x) => x.bookingId), true)} title="Take their letter out of this round — nothing is sent to them" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-muted hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40">
                          <X size={12} /> Remove
                        </button>
                        {sure === o.key ? (
                          <>
                            <button type="button" onClick={() => setSure(null)} className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-muted hover:bg-elevated">Back</button>
                            <button type="button" disabled={!!busy} onClick={() => sendOne(o)} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                              {busy === o.key ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Email {o.name.split(/\s+/)[0]} now
                            </button>
                          </>
                        ) : (
                          <button type="button" disabled={!!busy || !o.email} onClick={() => setSure(o.key)} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40">
                            <Send size={12} /> Send…
                          </button>
                        )}
                      </span>
                    </div>
                    {/* What their one email covers — each session removable on its own. */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.seats.map((x) => (
                        <span key={x.bookingId} className={`inline-flex items-center gap-1 rounded py-0.5 pl-1.5 pr-0.5 text-[11px] font-semibold ${TONE[x.change] ?? "bg-elevated text-fg"}`}>
                          {x.change}: {x.session}
                          {o.seats.length > 1 && (
                            <button type="button" disabled={!!busy} onClick={() => hold([x.bookingId], true)} aria-label={`Leave ${x.session} out of ${o.name}'s letter`} title="Leave this session out of the letter" className="rounded px-0.5 opacity-60 hover:opacity-100 disabled:opacity-30">
                              <X size={11} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {preview === o.key && (
                      <div className="mt-2 rounded-md border border-line bg-elevated/40 p-2">
                        <p className="text-[11.5px] font-semibold text-fg">{o.subject}</p>
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed text-fg">{o.body}</pre>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {removed.length > 0 && (
              <details className="mt-3 rounded-lg border border-dashed border-line px-2.5 py-2">
                <summary className="cursor-pointer text-[12px] font-semibold text-muted">Taken out of this round · {removed.reduce((n, o) => n + o.removed.length, 0)}</summary>
                <p className="mt-1 text-[11px] text-subtle">Not in any letter. A new decision on one of these seats puts it back in the mailbox by itself.</p>
                <ul className="mt-1.5 space-y-1">
                  {removed.map((o) => (
                    <li key={o.key} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                      <span className="font-semibold text-fg">{o.name}</span>
                      {o.removed.map((x) => <span key={x.bookingId} className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted">{x.change}: {x.session}</span>)}
                      <button type="button" disabled={!!busy} onClick={() => hold(o.removed.map((x) => x.bookingId), false)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-muted hover:bg-elevated hover:text-fg disabled:opacity-40">
                        <RotateCcw size={11} /> Put back
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {count > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {sure === "all" ? (
                  <>
                    <span className="mr-auto text-[12.5px] font-semibold text-fg">Email all {count} people now?</span>
                    <button type="button" onClick={() => setSure(null)} className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-elevated">Back</button>
                    <button type="button" disabled={!!busy} onClick={sendAll} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                      {busy === "all" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send all {count}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={!!busy} onClick={() => setSure("all")} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                    <Send size={13} /> Send all {count} letters…
                  </button>
                )}
              </div>
            )}
          </div>
        </AnchoredCard>
      )}
    </>
  );
}
