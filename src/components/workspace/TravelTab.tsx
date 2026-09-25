"use client";

/**
 * Training admin → Travel follow-up. Everyone who said their one-way trip
 * to downtown Toronto is over 2 hours: they need a separate follow-up
 * (travel support). Just the list for now — copy it, or download a CSV.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ClipboardCopy, Download, Loader2, Mail } from "lucide-react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import { TRAVEL_HEAD, travellerCells, travellers } from "@/lib/allocation/registrant-views";
import { toCsv } from "@/lib/formbuilder/csv";
import { downloadText, fileDate } from "@/lib/download";
import { rowsFrom } from "./RegistrantViews";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
import { loadTravelChecks, sendTravelCheck } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { receiptLine } from "@/lib/formbuilder/receipt";

const TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-600",
  waitlist: "bg-amber-500/12 text-amber-600",
  cancelled: "bg-rose-500/10 text-rose-600",
  pending: "bg-brand-500/12 text-brand-500",
};
const LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";

export function TravelTab({ workshops }: { workshops: AdminWorkshop[] }) {
  const list = useMemo(() => travellers(rowsFrom(workshops)), [workshops]);
  /* Said over two hours, gave a postal code that is nowhere near it.
     Worth seeing at the top rather than finding at approval time. */
  const doubtful = list.filter((t) => travelFromPostcode(t.postcode)?.band === "local").length;

  /* Who has already been written to. Read once on mount rather than
     passed down: it is one small query, and it is the only thing on
     this page that is not derived from the bookings. */
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { loadTravelChecks().then((rows) => setAsked(new Set(rows))).catch(() => {}); }, []);

  function ask(t: { bookingId: string; name: string; email: string }) {
    if (!confirm(`Email ${t.name} at ${t.email} to ask about their travel time?\n\nIt says what the postal code works out at, says the estimate may be wrong, and asks them to reply if their journey really is over two hours. Their place is not affected.`)) return;
    setBusy(t.bookingId);
    start(async () => {
      const r = await sendTravelCheck(t.bookingId);
      setBusy(null);
      if (!r.ok) { setSaid(r.problem ?? "That did not send."); return; }
      setSaid(receiptLine(r.receipt));
      if (r.receipt?.state === "sent" || r.receipt?.state === "sent-to-you") {
        setAsked((s) => new Set(s).add(t.email.toLowerCase()));
      }
    });
  }
  const [said, setSaid] = useState<string | null>(null);
  const table = [TRAVEL_HEAD, ...list.map(travellerCells)];

  async function copy() {
    // Tab-separated, so it pastes into a spreadsheet as columns and into an email as a list.
    const text = table.map((r) => r.join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); setSaid(`Copied ${list.length} ${list.length === 1 ? "person" : "people"}.`); }
    catch { setSaid("Your browser blocked copying — use Download CSV instead."); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fg">Travelling more than 2 hours · {list.length}</p>
          <p className="text-[12.5px] text-muted">Everyone who said their one-way trip to downtown Toronto is over 2 hours. They need a separate follow-up about travel.</p>
          {doubtful > 0 && (
            <p className="mt-1 text-[12.5px] font-semibold text-amber-700">
              {doubtful} of them gave a postal code that is under two hours from 144 College Street — check the travel time column before approving support.
            </p>
          )}
        </div>
        <button type="button" onClick={copy} disabled={!list.length} className={BTN}><ClipboardCopy size={14} /> Copy list</button>
        <button type="button" onClick={() => downloadText(`training-week-travel-follow-up-${fileDate()}.csv`, toCsv(table))} disabled={!list.length} className={BTN}>
          <Download size={14} /> Download CSV
        </button>
        {said && <p role="status" className="basis-full text-[12px] text-fg">{said}</p>}
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          Nobody has said they are travelling more than 2 hours yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-elevated text-left">
                {["Name", "Email", "Postcode", "Travel time", "Sessions", "Registered", "Ask"].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-subtle">{h === "Ask" ? "" : h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.personKey} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-semibold text-fg">{t.name}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-muted">{t.email}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-muted">{t.postcode || "—"}</td>
                  <td className="px-3 py-2"><TravelCell postcode={t.postcode} /></td>
                  <td className="px-3 py-2">
                    <ul className="space-y-1">
                      {t.sessions.map((s, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-1.5 text-muted">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TONE[s.status] ?? "bg-elevated text-subtle"}`}>{LABEL[s.status] ?? s.status}</span>
                          {s.dayLabel} · {s.workshop}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-subtle">{new Date(t.appliedAt).toLocaleDateString("en-CA")}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {/* Offered only where there is a question to ask: the
                        postal code is well inside two hours and the
                        registration says otherwise. */}
                    {travelFromPostcode(t.postcode)?.band === "local" && (
                      asked.has(t.email.toLowerCase()) ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted"><Check size={13} /> Asked</span>
                      ) : (
                        <button type="button" onClick={() => ask(t)} disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-50">
                          {busy === t.bookingId ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Ask them to clarify
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * What the postal code says about the journey they claimed.
 *
 * An estimate from the Forward Sortation Area, not a route — good
 * enough to separate "downtown" from "Barrie", which is the question
 * this list has actually been getting wrong.
 */
function TravelCell({ postcode }: { postcode: string }) {
  const e = travelFromPostcode(postcode);
  if (!e) return <span className="text-subtle">—</span>;
  const tone =
    e.band === "far" ? "bg-emerald-500/12 text-emerald-700"
    : e.band === "borderline" ? "bg-amber-500/12 text-amber-700"
    : "bg-rose-500/10 text-rose-700";
  const note = e.band === "far" ? "over 2 h" : e.band === "borderline" ? "close to 2 h" : "under 2 h";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{note}</span>
      <span className="text-muted">{e.place} · {travelWords(e)}</span>
    </span>
  );
}
