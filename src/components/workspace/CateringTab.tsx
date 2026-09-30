"use client";

/**
 * Training admin → Catering & accessibility. Alison's tab: what the
 * caterer needs and what the venue needs, for the sessions still to come.
 *
 * Every session shows the exact text that gets copied, so what you read
 * is what the caterer gets — copy one session, a whole day, or (in the
 * panel at the top) everything and only what changed. Tent cards for the
 * lunch table print per day or per session.
 */
import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Printer } from "lucide-react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import type { Entry, Snapshot } from "@/lib/allocation/catering";
import { currentEntries, dayKey, dayLabel, fullText, sessionText } from "@/lib/allocation/catering";
import { tentCards, tentCardsHtml } from "@/lib/allocation/tent-cards";
import { CateringPanel, rowsFrom } from "./RegistrantViews";

const tz = "America/Toronto";
const clock = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-brand-500/60 hover:bg-brand-500/10";

export function CateringTab({ workshops, catering }: { workshops: AdminWorkshop[]; catering: Snapshot | null }) {
  const rows = useMemo(() => rowsFrom(workshops), [workshops]);
  // Before anybody is approved there is nothing to show; planning mode
  // counts the requests still waiting, clearly marked in what is copied.
  const [planning, setPlanning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const days = useMemo(() => {
    const sessions = new Map<string, Entry[]>();
    for (const e of currentEntries(rows, new Date(), { includePending: planning })) {
      sessions.set(e.workshopId, [...(sessions.get(e.workshopId) ?? []), e]);
    }
    const byDay = new Map<string, Entry[][]>();
    for (const list of sessions.values()) {
      const k = dayKey(list[0].start);
      byDay.set(k, [...(byDay.get(k) ?? []), list]);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, lists]) => lists);
  }, [rows, planning]);

  async function copy(id: string, entries: Entry[], scope: string) {
    const text = fullText(entries, new Date().toISOString(), { scope, pending: planning });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      window.prompt("Copy this text:", text);
    }
  }

  function print(entries: Entry[], scope: string) {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    w.document.write(tentCardsHtml(tentCards(entries), `Tent cards — ${scope}`));
    w.document.close();
  }

  const copyLabel = (id: string, label: string) => (copied === id ? <><Check size={13} className="text-emerald-500" /> Copied</> : <><ClipboardCopy size={13} /> {label}</>);

  return (
    <div className="space-y-5">
      <CateringPanel rows={rows} initial={catering} />

      <label className="flex w-fit cursor-pointer items-center gap-2 text-[12.5px] text-muted">
        <input id="catering-planning" type="checkbox" className="accent-brand-600" checked={planning} onChange={(e) => setPlanning(e.target.checked)} />
        Include requests not yet approved <span className="text-subtle">(for planning — copies say so)</span>
      </label>
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
                  <button type="button" className={BTN} onClick={() => copy(dayId, dayEntries, day)}>{copyLabel(dayId, "Copy the day")}</button>
                  <button type="button" className={BTN} onClick={() => print(dayEntries, day)}><Printer size={13} /> Tent cards for the day</button>
                </span>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {sessions.map((list) => {
                  const s = list[0];
                  const scope = `${s.workshop}, ${day}`;
                  return (
                    <article key={s.workshopId} className="flex min-w-0 flex-col rounded-lg border border-line bg-card p-3">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h4 className="min-w-0 flex-1 text-[13.5px] font-bold text-fg">{s.workshop}</h4>
                        <span className="text-[12px] text-muted">{clock(s.start)} · <strong className="text-fg">{list.length}</strong> attending</span>
                      </div>
                      <pre className="mt-2 flex-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-elevated/60 p-2.5 font-mono text-[11.5px] leading-relaxed text-fg">
                        {sessionText(list)}
                      </pre>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button type="button" className={BTN} onClick={() => copy(s.workshopId, list, scope)}>{copyLabel(s.workshopId, "Copy this session")}</button>
                        <button type="button" className={BTN} onClick={() => print(list, scope)}><Printer size={13} /> Tent cards</button>
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
