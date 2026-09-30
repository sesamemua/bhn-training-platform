"use client";

/**
 * One registration, opened: what they answered on the left, and each seat
 * they asked for with its four decisions on the right. The Registrants
 * table opens this under a row; registrations that asked for no seat at
 * all (so have no row in that table) are listed on their own below it.
 */
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, Mail } from "lucide-react";
import { LaunchSwitch } from "@/components/ui/LaunchSwitch";
import { decideSeat, deleteSubmission, loadSubmissions, sendSeatLetter } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
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
  return (
    <div className="grid gap-4 bg-elevated/30 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0">
        {where && <GettingHere {...where} />}
        <p className="mb-1.5 text-[11px] text-subtle">
          Registered {new Date(sub.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          {" · "}
          <span title={sub.form === "v1" ? "The original registration form" : `Version ${sub.form.replace(/^v/, "")} of the registration form`}>form {sub.form}</span>
          {sub.isTest && <span className="ml-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-600">test</span>}
        </p>
        <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
          {Object.entries(sub.answers).map(([q, a]) => (
            <div key={q} className="contents">
              <dt className="truncate text-[11px] font-semibold text-subtle" title={q}>{q}</dt>
              <dd className="break-words text-[12px] text-fg">{a || "—"}</dd>
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
            <Seat key={s.id} seat={s} who={who} onDone={onChanged} />
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
        Nobody hears anything until you press <strong>Send letter</strong>, which asks you first. Change your mind as often as you like before then.
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
function Seat({ seat, who, onDone }: { seat: SubmissionRow["seats"][number]; who: string; onDone: () => void }) {
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
        : r.letterOwed ? `${r.said ?? "Saved"} — saved. Nobody has been emailed.`
        : `${r.said ?? "Saved"} — saved. Nothing to send: it matches what they were last told.`,
      );
      setMail(null);
      onDone();
    });
  const letterLabel = seat.status === "pending" ? "Not decided" : DECISION_LABEL[seat.status as Decision] ?? seat.status;
  const send = () => {
    start(async () => {
      const r = await sendSeatLetter(seat.id);
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
            <ConfirmPopover message={`Email ${who} now?`} detail={`They get the “${letterLabel}” letter for ${seat.workshop}.`} confirmLabel="Send" align="start" onConfirm={send}>
              {(open) => (
                <button type="button" onClick={open} disabled={pending}
                  className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-semibold text-fg hover:bg-elevated disabled:opacity-40">
                  <Mail size={11} /> Send letter
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

