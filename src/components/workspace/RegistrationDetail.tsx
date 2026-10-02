"use client";

/**
 * One registration, opened: what they answered on the left, and each seat
 * they asked for with its four decisions on the right. The Registrants
 * table opens this under a row; registrations that asked for no seat at
 * all (so have no row in that table) are listed on their own below it.
 */
import { placeOf } from "@/lib/formbuilder/origin";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Mail } from "lucide-react";
import { LaunchSwitch } from "@/components/ui/LaunchSwitch";
import { decideSeat, deleteSubmission, draftDistanceCheck, loadDistanceChecks, loadSubmissions, sendDistanceCheck, sendLetterForRegistration } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { AnchoredCard } from "@/components/ui/AnchoredCard";
import { lettersChanged, queueLetterFx } from "./LetterMailbox";
import type { SubmissionRow } from "@/lib/allocation/admin-types";
import { DECISION_LABEL, type Decision } from "@/lib/allocation/decisions";
import { receiptLine } from "@/lib/formbuilder/receipt";
import { ordinal } from "./SessionCalendar";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
import { institutionOf } from "@/lib/travel/far-email";

const BAND_TONE: Record<string, string> = {
  local: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  borderline: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  far: "border-orange-500/60 bg-orange-500/15 text-orange-700 font-bold",
};

/**
 * How far they are coming from, three ways: the postal code they gave,
 * the institution their email address belongs to, and what they said.
 * Local reads green; over two hours says how many.
 */
function GettingHere({ postcode, email, said }: { postcode: string; email: string; said: string }) {
  const byPostcode = postcode ? travelFromPostcode(postcode) : null;
  const byEmail = institutionOf(email);
  const say = (band: string, words: string) => (band === "local" ? `Local · ${words}` : words);
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
      <span className="font-semibold text-subtle">Getting here</span>
      {byPostcode ? (
        <span className={`rounded-md border px-2 py-0.5 ${BAND_TONE[byPostcode.band]}`} title={`${byPostcode.place} — typical one-way travel to 144 College Street`}>
          <span className="font-mono">{postcode}</span> · {say(byPostcode.band, travelWords(byPostcode))}
        </span>
      ) : (
        <span className="rounded-md border border-line px-2 py-0.5 text-subtle">{postcode ? `${postcode} · not a postal code we know` : "No postal code"}</span>
      )}
      {byEmail && (
        <span
          className={`rounded-md border px-2 py-0.5 ${BAND_TONE[byEmail.band]} ${byEmail.band !== "local" ? "ring-2 ring-orange-400/40" : ""}`}
          title="Where the institution in their email address is — a hint, not proof of where they live"
        >
          Email: {byEmail.school}, {byEmail.city} · {say(byEmail.band, travelWords({ fsa: "", place: byEmail.city, ...byEmail }))}
        </span>
      )}
      <span className="text-subtle">· they said {said === "far" ? "over two hours" : said === "near" ? "local" : "nothing"}</span>
    </div>
  );
}

/** Their answers beside the decisions on their seats — read one, act on the other. */
export function RegistrationDetail({ sub, onChanged, where }: {
  sub: SubmissionRow;
  onChanged: () => void;
  /** From the Registrants row: what to work out how far they are coming from. */
  where?: { postcode: string; email: string; said: string };
}) {
  const [, start] = useTransition();
  const who = sub.name || sub.email || "them";
  // Said local (or nothing) from a university address over two hours away.
  const school = where ? institutionOf(where.email) : null;
  const farCheck = school && school.band === "far" && where?.said !== "far" && sub.seats[0]
    ? { bookingId: sub.seats[0].id, who, email: where!.email, said: where!.said, school }
    : null;
  const travelQuestion = Object.keys(sub.answers).find((q) => /travel time|more than 2 hours|one[- ]way|door to door/i.test(q));
  return (
    <div className="grid gap-4 bg-elevated/30 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0">
        {where && <GettingHere {...where} />}
        <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="font-semibold text-subtle">Registered from</span>
          {sub.origin ? (
            <span
              className={`rounded-md border px-2 py-0.5 ${sub.origin.country && sub.origin.country !== "CA" ? "border-orange-400/60 bg-orange-500/10 text-fg ring-2 ring-orange-400/30" : "border-line text-fg"}`}
              title="Where their internet connection was when they registered — a VPN, mobile data or a campus network can place someone elsewhere"
            >
              {placeOf(sub.origin) ?? "Unknown area"}{sub.origin.ip && <span className="font-mono text-subtle"> · {sub.origin.ip}</span>}
            </span>
          ) : (
            <span className="text-subtle">not recorded (registered before 2 Oct)</span>
          )}
        </p>
        <p className="mb-1.5 text-[11px] text-subtle">
          Registered {new Date(sub.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          {" · "}
          <span title={sub.form === "v1" ? "The original registration form" : `Version ${sub.form.replace(/^v/, "")} of the registration form`}>form {sub.form}</span>
          {sub.isTest && <span className="ml-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-600">test</span>}
        </p>
        {farCheck && !travelQuestion && <DistanceWarning {...farCheck} />}
        <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
          {Object.entries(sub.answers).map(([q, a]) => (
            <div key={q} className="contents">
              <dt className="truncate text-[11px] font-semibold text-subtle" title={q}>{q}</dt>
              <dd className="break-words text-[12px] text-fg">{a || "—"}</dd>
              {/* Right under what they said about the journey. */}
              {farCheck && q === travelQuestion && <div style={{ gridColumn: "1 / -1" }}><DistanceWarning {...farCheck} /></div>}
            </div>
          ))}
        </dl>
        {/* The same protected switch as deleting an EQUIP application: lift the
            cover, press, and a countdown that can still be stopped. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LaunchSwitch
            label="DELETE"
            ariaLabel={`Delete ${who}'s ${sub.isTest ? "test " : ""}registration and its ${sub.seats.length} seat request${sub.seats.length === 1 ? "" : "s"} — protected switch with a countdown`}
            onFire={() => start(async () => { await deleteSubmission(sub.id); onChanged(); })}
          />
          <span className="text-[10.5px] leading-snug text-subtle">
            Deletes the registration{sub.seats.length ? ` and its ${sub.seats.length} seat request${sub.seats.length === 1 ? "" : "s"}` : ""}. Can&apos;t be undone.
          </span>
        </div>
      </div>

      {sub.seats.length > 0 && (
        <div className="min-w-0 space-y-1.5">
          <NoMailPromise />
          {sub.seats.map((s) => (
            <Seat key={s.id} seat={s} who={who} registrationId={sub.id} onDone={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Registrations with no seat in the table above: they asked for no
 * session at all, so the Registrants table — which is one row per seat
 * or per person with a seat — has nowhere to show them. Hidden when
 * there are none, which is almost always.
 */
export function RegistrationsWithoutSeats() {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [, start] = useTransition();
  const reload = () => { start(async () => setRows((await loadSubmissions()).filter((r) => r.seats.length === 0))); };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows || rows.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Registered, but asked for no session</p>
        <span className="text-[11.5px] text-subtle">{rows.length}</span>
      </div>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {rows.map((r) => {
          const open = openId === r.id;
          const prog = programmeOf(r.status);
          return (
            <li key={r.id}>
              <button onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-elevated/50">
                <ChevronDown size={14} className={`shrink-0 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
                <span className="text-[13px] font-semibold text-fg">{r.name || r.email || "No name given"}</span>
                {prog && <span className={`rounded px-1.5 py-px text-[10px] font-bold ${prog.tone}`} title={r.status}>{prog.label}</span>}
                <span className="truncate text-[11px] text-subtle">{r.email}</span>
              </button>
              {open && <div className="border-t border-line"><RegistrationDetail sub={r} onChanged={reload} /></div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Question one's answer as a coloured word instead of a sentence. */
export function programmeOf(status: string): { label: string; tone: string } | null {
  if (!status) return null;
  if (/ENGAGE|EXPERIENCE/i.test(status)) return { label: "ENGAGE / EXPERIENCE", tone: "bg-brand-500/12 text-brand-600" };
  if (/EQUIP/i.test(status)) return { label: "EQUIP", tone: "bg-violet-500/12 text-violet-700" };
  if (/not been accepted|account/i.test(status)) return { label: "Account only", tone: "bg-amber-500/12 text-amber-700" };
  if (/not participated/i.test(status)) return { label: "No programme", tone: "bg-amber-500/12 text-amber-700" };
  return { label: status.length > 32 ? `${status.slice(0, 32)}…` : status, tone: "bg-elevated text-muted" };
}

/** How a decision reads at a glance. */
const TONE: Record<string, string> = {
  pending: "border-line bg-elevated text-muted",
  confirmed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-600",
  waitlist: "border-amber-500/50 bg-amber-500/10 text-amber-600",
  cancelled: "border-red-500/40 bg-red-500/[0.08] text-red-500",
};
const DOT: Record<string, string> = {
  confirmed: "bg-emerald-500", waitlist: "bg-amber-500", cancelled: "bg-red-500", pending: "bg-slate-400",
};
/** What each button means for the person, said where the button is. */
const MEANS: Record<string, string> = {
  confirmed: "gets a place",
  waitlist: "first in line if a place opens",
  cancelled: "no place in this session",
  pending: "back to waiting — silent",
};

/*
 * Said before anybody presses anything.
 *
 * The old line under these buttons read "approving, waitlisting or
 * declining writes to them", which was not true — a decision here is
 * saved and the letter waits — and it made the buttons feel like a send.
 * The truth is the reassuring part, so it goes first and in colour.
 */
function NoMailPromise() {
  return (
    <div className="rounded-lg border border-sky-500/35 bg-sky-500/[0.07] px-2.5 py-2 text-[11.5px] leading-snug text-sky-900">
      <p className="flex items-center gap-1.5 font-bold text-sky-800">
        <Check size={13} /> These buttons never email anyone.
      </p>
      <p className="mt-0.5">
        A decision is saved and the seat shows{" "}
        <span className="rounded bg-amber-500/15 px-1 font-semibold text-amber-700">Letter not sent</span>.
        Their letter waits in the <strong>mailbox</strong> at the top — one email per person, covering every session of theirs — and nobody hears anything until you send it. Change your mind as often as you like before then.
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-sky-900/80">
        {(["confirmed", "waitlist", "cancelled", "pending"] as const).map((d) => (
          <span key={d} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${DOT[d]}`} aria-hidden />
            <strong className="font-semibold">{d === "pending" ? "Not decided" : DECISION_LABEL[d]}</strong> {MEANS[d]}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * One seat, and the four things you can do to it.
 *
 * All four are always offered, including the one it is already on —
 * a decision that can only move forwards makes correcting a mistake a
 * database job, and coordinators change their minds for good reasons:
 * somebody drops out, a room grows, a name was misread.
 *
 * Two lines: the seat and its four buttons, then the letter and the
 * optional note side by side. The note used to take a full-width line
 * of its own on every seat, used by almost nobody.
 */
function Seat({ seat, who, registrationId, onDone }: { seat: SubmissionRow["seats"][number]; who: string; registrationId: string; onDone: () => void }) {
  const [note, setNote] = useState(seat.note ?? "");
  const [noteOpen, setNoteOpen] = useState(Boolean(seat.note));
  const [said, setSaid] = useState<string | null>(null);
  const [mail, setMail] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Deciding records the decision only; the letter waits (seat.letterOwed)
  // until it is sent here, per workshop, or all at once.
  const decide = (to: Decision) =>
    start(async () => {
      const r = await decideSeat(seat.id, to, note);
      setSaid(
        !r.ok ? r.problem ?? "Could not record that."
        : r.letterOwed ? `${r.said ?? "Saved"} — saved. Their letter waits in the mailbox; nobody has been emailed.`
        : `${r.said ?? "Saved"} — saved. Nothing to send: it matches what they were last told.`,
      );
      // A letter is now owed: it flies into the mailbox.
      if (r.ok && r.letterOwed) queueLetterFx(); else lettersChanged();
      setMail(null);
      onDone();
    });
  const send = () => {
    start(async () => {
      // Their ONE letter: every session of theirs with news, not just this one.
      const r = await sendLetterForRegistration(registrationId);
      lettersChanged();
      // What happened to the letter, said out loud. A coordinator told
      // it went out when it did not will never follow up.
      setMail(r.receipt ? receiptLine(r.receipt) : r.problem ?? "Nothing to send — they already know.");
      onDone();
    });
  };

  return (
    <div className="rounded-lg border border-line bg-card px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] font-bold text-brand-500">{ordinal(seat.rank)}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg" title={seat.workshop}>{seat.workshop}</span>
        <span className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label={`Decision for ${seat.workshop}`}>
          {(["confirmed", "waitlist", "cancelled", "pending"] as const).map((d, i) => {
            const on = seat.status === d;
            return (
              <button
                key={d}
                disabled={pending}
                onClick={() => decide(d)}
                aria-pressed={on}
                title={`${d === "pending" ? "Not decided" : DECISION_LABEL[d]}: ${MEANS[d]}. Does not email them.`}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                  i > 0 ? "border-l border-line" : ""
                } ${on ? TONE[d] : "text-muted hover:bg-elevated hover:text-fg"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[d]}`} aria-hidden />
                {d === "pending" ? "Not decided" : DECISION_LABEL[d]}
              </button>
            );
          })}
        </span>
      </div>

      {seat.withdrawnAt && (
        /* Their own doing, not ours — and the reason they gave, which is
           what a coordinator needs to judge a later no-show fairly. */
        <div className="mt-1.5 rounded-md border border-rose-400/40 bg-rose-500/[0.06] px-2 py-1.5 text-[11.5px] leading-snug text-rose-800">
          <p className="font-bold">
            Can&apos;t make it — told us {new Date(seat.withdrawnAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. The seat is free again.
          </p>
          {seat.withdrawReason && <p className="mt-0.5 whitespace-pre-wrap text-rose-900">&ldquo;{seat.withdrawReason}&rdquo;</p>}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {seat.letterOwed ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-amber-500/12 px-1.5 py-0.5 font-bold text-amber-600">Letter not sent</span>
            <ConfirmPopover message={`Email ${who} now?`} detail="One email covering every session of theirs with news — this one included." confirmLabel="Send" align="start" onConfirm={send}>
              {(open) => (
                <button type="button" onClick={open} disabled={pending}
                  className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-semibold text-fg hover:bg-elevated disabled:opacity-40">
                  <Mail size={11} /> Send their letter
                </button>
              )}
            </ConfirmPopover>
          </span>
        ) : seat.toldAt ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check size={11} /> Emailed {new Date(seat.toldAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        ) : (
          <span className="text-subtle">Nothing to send yet</span>
        )}

        {noteOpen ? (
          <input
            className="min-w-[12rem] flex-1 rounded border border-line bg-elevated px-2 py-0.5 text-[11.5px] text-fg outline-none focus-visible:border-brand-500"
            placeholder="A line added to their letter — saved with the next decision"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : (
          <button type="button" onClick={() => setNoteOpen(true)} className="font-semibold text-muted hover:text-fg">
            + Add a line to the letter
          </button>
        )}
      </div>

      {said && <p role="status" className="mt-1 text-[11px] text-fg">{said}</p>}
      {mail && <p className="mt-0.5 text-[11px] text-muted">{mail}</p>}
    </div>
  );
}


/**
 * The warning under their travel answer, and the next step: a short
 * letter asking where they will travel from. The letter opens in a card
 * beside the button, ready to edit; it goes only when Send is pressed,
 * and Send asks once more, in the card.
 */
function DistanceWarning({ bookingId, who, email, said, school }: {
  bookingId: string; who: string; email: string; said: string; school: NonNullable<ReturnType<typeof institutionOf>>;
}) {
  const [asked, setAsked] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [sure, setSure] = useState(false);
  const [said2, setSaid2] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { loadDistanceChecks().then((m) => setAsked(m[email.toLowerCase()] ?? null)).catch(() => {}); }, [email]);

  function open(e: React.MouseEvent<HTMLButtonElement>) {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setSaid2(null);
    setSure(false);
    start(async () => {
      const r = await draftDistanceCheck(bookingId);
      if (r.ok) setDraft({ to: r.to ?? "", subject: r.subject ?? "", body: r.body ?? "" });
      else { setAnchor(null); setSaid2(r.problem ?? "That letter could not be written."); }
    });
  }
  function send() {
    if (!draft) return;
    start(async () => {
      const r = await sendDistanceCheck(bookingId, { subject: draft.subject, body: draft.body });
      if (!r.ok) { setSaid2(r.problem ?? "Not sent."); return; }
      setSaid2(r.receipt ? receiptLine(r.receipt) : "Sent.");
      if (r.receipt?.state === "sent" || r.receipt?.state === "sent-to-you") setAsked(new Date().toISOString());
      setDraft(null); setAnchor(null); setSure(false);
    });
  }

  return (
    <div className="my-1.5 rounded-lg border border-orange-500/50 bg-orange-500/[0.08] px-2.5 py-2 text-[12px] leading-snug text-fg">
      <p className="font-bold text-orange-700">May be over two hours away</p>
      <p className="mt-0.5">
        They said {said === "near" ? "they are local" : "nothing about distance"}, but registered with a <strong>{school.school}</strong> address —
        {" "}{school.city} is {travelWords({ fsa: "", place: school.city, ...school })} from 144 College Street.
      </p>
      <p className="mt-1 text-muted"><strong className="text-fg">Next step:</strong> send a short email asking where they will be travelling from on the day.</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={open} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/50 bg-card-solid px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-orange-500/10 disabled:opacity-50">
          <Mail size={12} /> See sample email
        </button>
        {asked && <span className="text-[11.5px] text-emerald-700">Asked {new Date(asked).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
        {said2 && <span role="status" className="text-[11.5px] text-muted">{said2}</span>}
      </div>

      {draft && (
        <AnchoredCard anchor={anchor} width={520} label={`Email to ${who}`} onDismiss={() => { if (!pending) { setDraft(null); setSure(false); } }}>
          <div className="space-y-2 p-3">
            <p className="text-[12.5px] font-semibold text-fg">Email to {who}</p>
            <p className="text-[11.5px] text-muted">To <span className="font-mono">{draft.to}</span> — from BioHubNet, with the usual signature. Change anything before sending.</p>
            <input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              aria-label="Subject"
              className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12.5px] font-semibold text-fg focus:border-brand-400 focus:outline-none"
            />
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={13}
              aria-label="Message"
              className="w-full resize-y rounded-md border border-line bg-card px-2 py-1.5 text-[12.5px] leading-relaxed text-fg focus:border-brand-400 focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {sure ? (
                <>
                  <span className="mr-auto text-[12px] font-semibold text-fg">Email {draft.to} now?</span>
                  <button type="button" onClick={() => setSure(false)} className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-elevated">Back</button>
                  <button type="button" onClick={send} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                    {pending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Send now
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setDraft(null); setSure(false); }} className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-elevated">Close</button>
                  <button type="button" onClick={() => setSure(true)} disabled={!draft.subject.trim() || !draft.body.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                    <Mail size={12} /> Send…
                  </button>
                </>
              )}
            </div>
          </div>
        </AnchoredCard>
      )}
    </div>
  );
}
