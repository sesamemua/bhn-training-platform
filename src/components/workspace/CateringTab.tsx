"use client";

/**
 * Training admin → Catering & accessibility. Alison's tab: what the
 * caterer needs and what the venue needs, for the sessions still to come.
 *
 * Every session shows the exact text that gets copied, so what you read
 * is what the caterer gets — copy one session or a whole day. Tent cards
 * for the platters and a printed list of the people with needs come from
 * the same entries. Each print or copy is remembered per session, so an
 * allergy that turns up afterwards is flagged at the top.
 */
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Check, ClipboardCopy, ListChecks, Printer } from "lucide-react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import type { Entry } from "@/lib/allocation/catering";
import { currentEntries, dayKey, dayLabel, fullText, peopleListHtml, sessionText } from "@/lib/allocation/catering";
import { newSinceSent, type SentRecord } from "@/lib/allocation/catering-sent";
import { cardsFor, tentCards, tentCardsHtml, type TentCard } from "@/lib/allocation/tent-cards";
import { recordCateringSent } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { rowsFrom } from "./RegistrantViews";

const tz = "America/Toronto";
const clock = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-brand-500/60 hover:bg-brand-500/10";

const TIP = {
  cards:
    "Fold-over cards for the lunch table, one per dish label, on letter paper. Diets name the dish that fits them (Halal, Vegetarian); allergies print in red as “Contains kiwi”, “Contains lactose” for the dish that has it. No names on the cards.",
  list: "Prints the people in this session who have a dietary or accessibility need, allergies first in red — for the caterer to check against, or for the lunch table.",
  copy: "Copies this text for an email to the caterer.",
};

/** A short explanation that shows above a button on hover or keyboard focus. */
function Tip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 w-64 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[11.5px] font-normal leading-snug text-fg opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

const cardName = (c: TentCard) => (c.contains ? `Contains ${c.label.toLowerCase()}` : c.label);

export function CateringTab({ workshops, sent: initialSent }: { workshops: AdminWorkshop[]; sent: SentRecord }) {
  const rows = useMemo(() => rowsFrom(workshops), [workshops]);
  // Before anybody is approved there is nothing to show, so the tab opens
  // in planning mode then: it counts the requests still waiting, and every
  // copy says so. Once seats are approved it opens on the real list.
  const noneApproved = useMemo(() => currentEntries(rows).length === 0, [rows]);
  const [planning, setPlanning] = useState(noneApproved);
  const [copied, setCopied] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const [sent, setSent] = useState(initialSent);
  const [, start] = useTransition();

  const entries = useMemo(() => currentEntries(rows, new Date(), { includePending: planning }), [rows, planning]);
  const days = useMemo(() => {
    const sessions = new Map<string, Entry[]>();
    for (const e of entries) sessions.set(e.workshopId, [...(sessions.get(e.workshopId) ?? []), e]);
    const byDay = new Map<string, Entry[][]>();
    for (const list of sessions.values()) {
      const k = dayKey(list[0].start);
      byDay.set(k, [...(byDay.get(k) ?? []), list]);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, lists]) => lists);
  }, [entries]);
  const fresh = useMemo(() => newSinceSent(sent, entries), [sent, entries]);

  // Remember what the caterer was given, per session.
  function remember(list: Entry[], how: "print" | "copy") {
    start(async () => {
      const r = await recordCateringSent(list, how);
      if (r.ok && r.sent) setSent(r.sent);
    });
  }

  async function copy(id: string, list: Entry[], scope: string) {
    const text = fullText(list, new Date().toISOString(), { scope, pending: planning });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // No clipboard access: show the text to copy by hand, not a browser prompt.
      setManual(text);
    }
    remember(list, "copy");
  }

  function open(html: string, list: Entry[]) {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    w.document.write(html);
    w.document.close();
    remember(list, "print");
  }
  const printCards = (list: Entry[], scope: string) => open(tentCardsHtml(tentCards(list), `Tent cards — ${scope}`), list);
  const printList = (list: Entry[], scope: string) =>
    open(
      peopleListHtml(list, {
        title: `Dietary & accessibility — ${scope}`,
        asOf: new Date().toISOString(),
        pending: planning,
        warns: (e) => [...e.dietary, e.dietaryOther].some((d) => d && cardsFor(d).some((c) => c.contains)),
      }),
      list,
    );

  const copyLabel = (id: string, label: string) => (copied === id ? <><Check size={13} className="text-emerald-500" /> Copied</> : <><ClipboardCopy size={13} /> {label}</>);
  const sessionById = new Map(days.flat().map((list) => [list[0].workshopId, list]));

  return (
    <div className="space-y-5">
      {fresh.length > 0 && (
        <section role="alert" className="rounded-xl border-2 border-rose-500/50 bg-rose-500/[0.07] p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold text-fg">
            <AlertTriangle size={17} className="text-rose-500" /> New since the caterer was last given these sessions
          </p>
          <ul className="mt-2 space-y-1.5">
            {fresh.map((f) => {
              const list = sessionById.get(f.workshopId) ?? [];
              const scope = `${f.workshop}, ${dayLabel(f.start)}`;
              return (
                <li key={f.workshopId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                  <strong className="text-fg">{f.workshop}</strong>
                  <span className="text-muted">{dayLabel(f.start)}:</span>
                  {f.cards.map((c) => (
                    <span key={cardName(c)} className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${c.contains ? "bg-rose-500/15 text-rose-600" : "bg-elevated text-fg"}`}>
                      {cardName(c)}
                    </span>
                  ))}
                  <span className="text-subtle">
                    · last {f.since.how === "print" ? "printed" : "copied"} {stamp(f.since.at)}{f.since.by ? ` by ${f.since.by}` : ""}
                  </span>
                  <button type="button" className={`${BTN} ml-auto`} onClick={() => printCards(list, scope)}>
                    <Printer size={13} /> Reprint tent cards
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <label
        className={`flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
          planning ? "border-amber-500/50 bg-amber-500/10 text-fg" : "border-line text-muted"
        }`}
      >
        <input id="catering-planning" type="checkbox" className="accent-amber-500" checked={planning} onChange={(e) => setPlanning(e.target.checked)} />
        <span>
          <strong>Include requests not yet approved</strong>
          <span className="text-subtle"> — for planning{noneApproved ? "; nobody is approved yet" : ""}. Copies say the numbers are not final.</span>
        </span>
      </label>
      {manual && (
        <div className="rounded-lg border border-line bg-card p-3">
          <p className="flex items-center justify-between text-[12.5px] font-semibold text-fg">
            Your browser blocked copying — select this and copy it by hand
            <button type="button" onClick={() => setManual(null)} className="text-[11.5px] text-muted hover:text-fg">Close</button>
          </p>
          <textarea readOnly autoFocus onFocus={(e) => e.currentTarget.select()} value={manual} rows={8} className="mt-2 w-full rounded-md border border-line bg-elevated p-2 font-mono text-[11.5px] text-fg" />
        </div>
      )}
      {blocked && (
        <p role="alert" className="text-[12.5px] font-semibold text-amber-600">
          Your browser blocked the print window. Allow pop-ups for this site, then press the button again.
        </p>
      )}

      {days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          {planning
            ? "No requests for upcoming sessions."
            : "No approved attendees for upcoming sessions yet. Tick the box above to plan with the requests still waiting."}
        </p>
      ) : (
        days.map((sessions) => {
          const dayEntries = sessions.flat();
          const day = dayLabel(sessions[0][0].start);
          const dayId = dayKey(sessions[0][0].start);
          return (
            <section key={dayId}>
              <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
                <h3 className="text-[15px] font-bold text-fg">{day}</h3>
                <span className="text-[12.5px] text-muted">
                  {sessions.length} session{sessions.length === 1 ? "" : "s"} · <strong className="text-fg">{dayEntries.length}</strong> attending
                </span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  <Tip text={TIP.copy}>
                    <button type="button" className={BTN} onClick={() => copy(dayId, dayEntries, day)}>{copyLabel(dayId, "Copy the day")}</button>
                  </Tip>
                  <Tip text={TIP.cards}>
                    <button type="button" className={BTN} onClick={() => printCards(dayEntries, day)}><Printer size={13} /> Tent cards for the day</button>
                  </Tip>
                </span>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {sessions.map((list) => {
                  const s = list[0];
                  const scope = `${s.workshop}, ${day}`;
                  const isNew = fresh.find((f) => f.workshopId === s.workshopId);
                  return (
                    <article
                      key={s.workshopId}
                      className={`flex min-w-0 flex-col rounded-lg border bg-card p-3 ${isNew ? "border-rose-500/60" : "border-line"}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h4 className="min-w-0 flex-1 text-[13.5px] font-bold text-fg">{s.workshop}</h4>
                        <span className="text-[12px] text-muted">{clock(s.start)} · <strong className="text-fg">{list.length}</strong> attending</span>
                      </div>
                      {isNew && (
                        <p className="mt-1 text-[11.5px] font-semibold text-rose-600">
                          New since last {isNew.since.how === "print" ? "print" : "copy"}: {isNew.cards.map(cardName).join(", ")}
                        </p>
                      )}
                      <pre className="mt-2 flex-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-elevated/60 p-2.5 font-mono text-[11.5px] leading-relaxed text-fg">
                        {sessionText(list)}
                      </pre>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Tip text={TIP.copy}>
                          <button type="button" className={BTN} onClick={() => copy(s.workshopId, list, scope)}>{copyLabel(s.workshopId, "Copy this session")}</button>
                        </Tip>
                        <Tip text={TIP.list}>
                          <button type="button" className={BTN} onClick={() => printList(list, scope)}><ListChecks size={13} /> Print list</button>
                        </Tip>
                        <Tip text={TIP.cards}>
                          <button type="button" className={BTN} onClick={() => printCards(list, scope)}><Printer size={13} /> Tent cards</button>
                        </Tip>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
