"use client";

/**
 * Training admin → Travel follow-up. Everyone who said their one-way trip
 * to downtown Toronto is over 2 hours: they need a separate follow-up
 * about travel support. Copy the list, download it as a CSV, or — where
 * the postal code they gave is nowhere near two hours away — write to
 * them about it.
 *
 * That last one never sends from the row. It opens the letter, filled
 * in and editable, and the send sits behind a confirmation a
 * coordinator can switch off once they trust it: a one-click send on a
 * table row is a message to a real person, in their name, posted by a
 * mis-click.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, ClipboardCopy, Download, Loader2, Mail, Send } from "lucide-react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import { TRAVEL_HEAD, travellerCells, travellers, type Traveller } from "@/lib/allocation/registrant-views";
import { toCsv } from "@/lib/formbuilder/csv";
import { downloadText, fileDate } from "@/lib/download";
import { rowsFrom } from "./RegistrantViews";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
import { draftTravelCheck, loadTravelChecks, sendTravelCheck } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { Modal } from "@/components/ui/Modal";
import { receiptLine } from "@/lib/formbuilder/receipt";

const TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-600",
  waitlist: "bg-amber-500/12 text-amber-600",
  cancelled: "bg-rose-500/10 text-rose-600",
  pending: "bg-brand-500/12 text-brand-500",
};
const LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";

/** The letter, open on screen and not yet sent. */
interface Draft { bookingId: string; to: string; name: string; subject: string; body: string }

/** Per-browser, per-person: whether Send asks again first. On unless turned off. */
const CONFIRM_KEY = "bhn.travelCheck.confirmBeforeSend";

export function TravelTab({ workshops }: { workshops: AdminWorkshop[] }) {
  const list = useMemo(() => travellers(rowsFrom(workshops)), [workshops]);
  /* Said over two hours, gave a postal code that is nowhere near it.
     Worth seeing at the top rather than finding at approval time. */
  const doubtful = list.filter((t) => travelFromPostcode(t.postcode)?.band === "local").length;

  /* Who has already been written to. Read once on mount rather than
     passed down: it is one small query, and it is the only thing on
     this page that is not derived from the bookings. */
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const table = [TRAVEL_HEAD, ...list.map(travellerCells)];

  async function copy() {
    // Tab-separated, so it pastes into a spreadsheet as columns and into an email as a list.
    const text = table.map((r) => r.join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); setSaid(`Copied ${list.length} ${list.length === 1 ? "person" : "people"}.`); }
    catch { setSaid("Your browser blocked copying — use Download CSV instead."); }
  }
  useEffect(() => { loadTravelChecks().then((rows) => setAsked(new Set(rows))).catch(() => {}); }, []);

  /*
   * Nothing is sent from the row.
   *
   * The button opens the letter — the real one, filled in, editable —
   * and the send lives in there behind a confirmation that a
   * coordinator can switch off once they trust it. A one-click send on
   * a row is a message to a real person, in their name, posted by a
   * mis-click.
   */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [confirmFirst, setConfirmFirst] = useState(true);
  useEffect(() => {
    // Read after mount: the server has no idea what this browser
    // remembers, and rendering the box differently would not match.
    try { setConfirmFirst(localStorage.getItem(CONFIRM_KEY) !== "off"); } catch { /* private window */ }
  }, []);
  function rememberConfirm(on: boolean) {
    setConfirmFirst(on);
    if (!on) setSure(false);
    try { localStorage.setItem(CONFIRM_KEY, on ? "on" : "off"); } catch { /* nothing to do about it */ }
  }

  function open(t: Traveller) {
    setOpening(t.bookingId);
    setSaid(null);
    start(async () => {
      const r = await draftTravelCheck(t.bookingId);
      setOpening(null);
      if (!r.ok) { setSaid(r.problem ?? "That letter could not be written."); return; }
      setSure(false);
      setDraft({ bookingId: t.bookingId, to: r.to ?? "", name: r.name ?? t.name, subject: r.subject ?? "", body: r.body ?? "" });
    });
  }

  function send() {
    if (!draft) return;
    if (confirmFirst && !sure) { setSure(true); return; }
    const d = draft;
    start(async () => {
      const r = await sendTravelCheck(d.bookingId, { subject: d.subject, body: d.body });
      if (!r.ok) { setSaid(r.problem ?? "That did not send."); return; }
      setSaid(receiptLine(r.receipt));
      if (r.receipt?.state === "sent" || r.receipt?.state === "sent-to-you") {
        setAsked((s) => new Set(s).add(d.to.toLowerCase()));
      }
      setDraft(null);
      setSure(false);
    });
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
                        <button type="button" onClick={() => open(t)} disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-50">
                          {opening === t.bookingId ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Write to them
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

      {/* The letter, before it is a letter. Editable, because a
          coordinator knows things about this person that a template
          cannot, and because the words go out over their name. */}
      <Modal
        open={Boolean(draft)}
        onClose={() => { setDraft(null); setSure(false); }}
        size="lg"
        title="Ask about their travel time"
        description={draft ? `To ${draft.name || "them"} · ${draft.to}` : undefined}
        footer={
          <div className="flex w-full flex-wrap items-center gap-3">
            <label className="mr-auto inline-flex items-center gap-2 text-[12.5px] text-muted">
              <input type="checkbox" className="accent-brand-600" checked={confirmFirst} onChange={(e) => rememberConfirm(e.target.checked)} />
              Ask me to confirm before sending
            </label>
            {sure ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700">
                  <AlertTriangle size={13} /> Send this to {draft?.to} now?
                </span>
                <button type="button" onClick={() => setSure(false)} className="px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-fg">
                  Not yet
                </button>
                <button type="button" onClick={send} disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Yes, send it
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setDraft(null)} className="px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-fg">
                  Cancel
                </button>
                <button type="button" onClick={send} disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                </button>
              </>
            )}
          </div>
        }
      >
        {draft && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">Subject</span>
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-elevated/40 px-3 py-2 text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">Message</span>
              <textarea
                rows={16}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-elevated/40 px-3 py-2 text-[13px] leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <p className="text-[11.5px] leading-snug text-subtle">
              Already filled in for this person — the merge fields are gone, so what you see is what they get.
              Edits here go to this one message only; to change the wording for everybody, edit
              <strong className="text-muted"> Travel support — checking the journey</strong> under the Email tab.
            </p>
          </div>
        )}
      </Modal>
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
