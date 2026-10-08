"use client";

/**
 * Training admin → Travel follow-up. Everyone who said their one-way trip
 * to downtown Toronto is over 2 hours: they need a separate follow-up
 * about travel support. Copy the list or download it as a CSV.
 *
 * Click a name to open the row: their registration (as under
 * Registrants), the travel-eligibility check — approved by whom, and
 * when — and their letter. The letter depends on where they stand: a
 * clarifying question for a False OOT, the next steps (hotel, how they
 * travel) for everybody else. It is written into a box on the row,
 * editable, and nothing goes until Send is confirmed.
 */
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ClipboardCopy, Download, Loader2, Send, ShieldCheck } from "lucide-react";
import type { AdminWorkshop, SubmissionRow } from "@/lib/allocation/admin-types";
import { TRAVEL_HEAD, travellerCells, travellers, worthChecking, type Traveller } from "@/lib/allocation/registrant-views";
import { toCsv } from "@/lib/formbuilder/csv";
import { downloadText, fileDate } from "@/lib/download";
import { rowsFrom } from "./RegistrantViews";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
import { draftTravelCheck, loadSubmissions, loadTravelStatus, sendTravelCheck, setTravelEligibility } from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import { RegistrationDetail } from "./RegistrationDetail";
import { receiptLine } from "@/lib/formbuilder/receipt";

const TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-600",
  waitlist: "bg-amber-500/12 text-amber-600",
  cancelled: "bg-rose-500/10 text-rose-600",
  pending: "bg-brand-500/12 text-brand-500",
};
const LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";

type Kind = "clarify" | "next";
/** The letter, written into the row's box and not yet sent. */
interface Draft { kind: Kind; to: string; subject: string; body: string }
const KIND_LABEL: Record<Kind, string> = { clarify: "Clarifying question", next: "Next steps" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

export function TravelTab({ workshops }: { workshops: AdminWorkshop[] }) {
  const rows = useMemo(() => rowsFrom(workshops), [workshops]);
  const list = useMemo(() => travellers(rows), [rows]);
  /* The other way round: said local (or nothing), from a university over
     two hours away. Not a finding — a prompt to look. */
  const unsure = useMemo(() => worthChecking(rows), [rows]);
  /* Said over two hours, gave a postal code that is nowhere near it.
     Worth seeing at the top rather than finding at approval time. */
  const doubtful = list.filter((t) => t.falseOot).length;

  /* What is not derived from the bookings: letters already sent, who
     approved whose eligibility, and the registrations themselves. */
  const [sent, setSent] = useState<Record<string, Kind[]>>({});
  const [approvals, setApprovals] = useState<Record<string, { byName: string; at: string }>>({});
  const [subs, setSubs] = useState<SubmissionRow[] | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const table = [TRAVEL_HEAD, ...list.map(travellerCells)];
  const ids = list.map((t) => t.bookingId).join(",");

  async function copy() {
    // Tab-separated, so it pastes into a spreadsheet as columns and into an email as a list.
    const text = table.map((r) => r.join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); setSaid(`Copied ${list.length} ${list.length === 1 ? "person" : "people"}.`); }
    catch { setSaid("Your browser blocked copying — use Download CSV instead."); }
  }
  useEffect(() => {
    loadTravelStatus(ids ? ids.split(",") : []).then((r) => { setSent(r.sent); setApprovals(r.approvals); }).catch(() => {});
  }, [ids]);
  const reloadSubs = () => { void loadSubmissions().then(setSubs).catch(() => setSubs([])); };
  const subOf = (t: Traveller) => subs?.find((s) => s.seats.some((x) => x.id === t.bookingId)) ?? null;

  /* One row open at a time; its letter is drafted on the server when it opens. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const kindOf = (t: Traveller): Kind => (t.falseOot ? "clarify" : "next");

  function writeDraft(t: Traveller) {
    setDraft(null);
    setDrafting(true);
    start(async () => {
      const kind = kindOf(t);
      const r = await draftTravelCheck(t.bookingId, kind);
      setDrafting(false);
      if (!r.ok) { setSaid(r.problem ?? "That letter could not be written."); return; }
      setDraft({ kind, to: r.to ?? "", subject: r.subject ?? "", body: r.body ?? "" });
    });
  }
  function toggle(t: Traveller) {
    setSaid(null);
    if (openKey === t.personKey) { setOpenKey(null); setDraft(null); return; }
    setOpenKey(t.personKey);
    if (subs === null) reloadSubs();
    writeDraft(t);
  }

  /* Checked and approved — recorded with who and when — or taken back.
     The row's status changes with it, so its letter is written again. */
  function approve(t: Traveller, on: boolean) {
    start(async () => {
      const r = await setTravelEligibility(t.bookingId, on);
      if (!r.ok) { setSaid(r.problem ?? "Could not save."); return; }
      setApprovals((a) => {
        const next = { ...a };
        if (on && r.byName && r.at) next[t.bookingId] = { byName: r.byName, at: r.at }; else delete next[t.bookingId];
        return next;
      });
      setSaid(on ? `${t.name}'s travel eligibility is approved.` : `${t.name}'s approval is taken back.`);
      if (openKey === t.personKey) { setOpenKey(null); setDraft(null); }
    });
  }

  function send(t: Traveller) {
    if (!draft) return;
    const d = draft;
    start(async () => {
      const r = await sendTravelCheck(t.bookingId, { subject: d.subject, body: d.body }, d.kind);
      if (!r.ok) { setSaid(r.problem ?? "That did not send."); return; }
      setSaid(receiptLine(r.receipt));
      if (r.receipt?.state === "sent" || r.receipt?.state === "sent-to-you") {
        const k = t.email.toLowerCase();
        setSent((m) => ({ ...m, [k]: [...new Set([...(m[k] ?? []), d.kind])] }));
      }
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
              {doubtful} of them gave a postal code that is under two hours from 144 College Street — marked False OOT, and ranked as local until you accept their claim.
            </p>
          )}
        </div>
        <button type="button" onClick={copy} disabled={!list.length} className={BTN}><ClipboardCopy size={14} /> Copy list</button>
        <button type="button" onClick={() => downloadText(`training-week-travel-follow-up-${fileDate()}.csv`, toCsv(table))} disabled={!list.length} className={BTN}>
          <Download size={14} /> Download CSV
        </button>
        {said && <p role="status" className="basis-full text-[12px] text-fg">{said}</p>}
      </div>

      {unsure.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3">
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-fg">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500/20 text-[12px] font-extrabold text-amber-700" aria-hidden>?</span>
            Worth checking · {unsure.length}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            Said they are local (or didn&apos;t say), but registered with a university address over two hours away. It may be nothing — students often live near campus in Toronto — but it may change whether they need travel support, or whether they can make it.
          </p>
          <ul className="mt-2 space-y-1">
            {unsure.map((u) => (
              <li key={u.personKey} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]">
                <strong className="text-fg">{u.name}</strong>
                <span className="font-mono text-[11.5px] text-muted">{u.email}</span>
                <span className="rounded bg-amber-500/15 px-1.5 py-px text-[11px] font-semibold text-amber-700">{u.school.school} · {u.school.city}</span>
                <span className="text-[11.5px] text-subtle">said {u.said === "near" ? "local" : "nothing about distance"}{u.postcode ? ` · postal code ${u.postcode}` : ""}</span>
                <span className="text-[11.5px] text-subtle">· {u.sessions.join("; ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          Nobody has said they are travelling more than 2 hours yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-elevated text-left">
                {["Name", "Email", "Postcode", "Travel time", "Sessions", "Registered", "Letter"].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-subtle">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const open = openKey === t.personKey;
                const approval = approvals[t.bookingId];
                const approved = t.ootAccepted || Boolean(approval);
                const letters = sent[t.email.toLowerCase()] ?? [];
                const sub = open ? subOf(t) : null;
                return (
                  <Fragment key={t.personKey}>
                    <tr className={`border-t border-line align-top ${open ? "bg-elevated/40" : ""}`}>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => toggle(t)} aria-expanded={open} className="inline-flex items-center gap-1 text-left font-semibold text-fg hover:underline">
                          <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} /> {t.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-muted">{t.email}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-muted">{t.postcode || "—"}</td>
                      <td className="px-3 py-2">
                        <TravelCell postcode={t.postcode} />
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {approved ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/12 px-1.5 py-0.5 font-bold text-emerald-700">
                              <ShieldCheck size={11} /> Travel eligibility approved
                            </span>
                          ) : t.falseOot ? (
                            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-bold text-rose-700" title="Ranked as local by the decision model">False OOT</span>
                          ) : (
                            <span className="rounded bg-elevated px-1.5 py-0.5 font-bold text-subtle">Not checked yet</span>
                          )}
                          {approved && <span className="text-subtle">{approval ? `Checked and approved by ${approval.byName} · ${day(approval.at)}` : "Approved before names were recorded"}</span>}
                        </span>
                      </td>
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
                      <td className="px-3 py-2 text-[11.5px]">
                        {letters.length ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-muted"><Check size={12} /> {letters.map((k) => KIND_LABEL[k]).join(", ")} sent</span>
                        ) : (
                          <span className="text-subtle">{KIND_LABEL[kindOf(t)]} — not sent</span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-line">
                        <td colSpan={7} className="p-0">
                          <div className="grid gap-3 border-b border-line bg-elevated/30 px-3 py-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
                            <section>
                              <h3 className="text-[11px] font-bold uppercase tracking-wide text-subtle">Travel eligibility</h3>
                              {approved ? (
                                <>
                                  <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700"><ShieldCheck size={14} /> Approved</p>
                                  <p className="text-[12px] text-muted">{approval ? `Checked and approved by ${approval.byName} on ${new Date(approval.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}.` : "Approved before names were recorded."}</p>
                                  <ConfirmPopover message={`Take back ${t.name}'s approval?`} detail={t.postcode ? "If their postal code is under two hours they go back to False OOT." : undefined} confirmLabel="Take it back" tone="danger" align="start" onConfirm={() => approve(t, false)}>
                                    {(o) => <button type="button" disabled={pending} onClick={o} className="mt-1.5 text-[12px] font-semibold text-muted underline underline-offset-2 hover:text-fg disabled:opacity-50">Take back approval</button>}
                                  </ConfirmPopover>
                                </>
                              ) : (
                                <>
                                  <p className="mt-1 text-[12.5px] text-muted">
                                    {t.falseOot ? "Their postal code is under two hours. Approve only if their explanation holds up." : "Check their journey really is over two hours each way, then approve."}
                                  </p>
                                  <ConfirmPopover message={`Approve ${t.name}'s travel eligibility?`} detail="Your name and the time are recorded and shown on this row." confirmLabel="Checked — approve" align="start" onConfirm={() => approve(t, true)}>
                                    {(o) => <button type="button" disabled={pending} onClick={o} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><ShieldCheck size={13} /> Checked — approve eligibility</button>}
                                  </ConfirmPopover>
                                </>
                              )}
                            </section>

                            <section className="min-w-0">
                              <h3 className="text-[11px] font-bold uppercase tracking-wide text-subtle">
                                Letter · {KIND_LABEL[kindOf(t)]}{letters.includes(kindOf(t)) ? " · already sent once" : ""}
                              </h3>
                              {draft ? (
                                <div className="mt-1 space-y-2">
                                  <p className="text-[12px] text-muted">To {draft.to}</p>
                                  <input id={`travel-subject-${t.bookingId}`} aria-label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                                    className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                                  <textarea id={`travel-body-${t.bookingId}`} aria-label="Message" rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                                    className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                                  <div className="flex flex-wrap items-center gap-3">
                                    <ConfirmPopover message={`Send this to ${draft.to} now?`} confirmLabel="Send" align="start" onConfirm={() => send(t)}>
                                      {(o) => (
                                        <button type="button" disabled={pending || !draft.subject.trim() || !draft.body.trim()} onClick={o}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                                          {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                                        </button>
                                      )}
                                    </ConfirmPopover>
                                    <button type="button" disabled={pending} onClick={() => writeDraft(t)} className="text-[12px] font-semibold text-muted underline underline-offset-2 hover:text-fg">Start again from the template</button>
                                  </div>
                                  <p className="text-[11.5px] leading-snug text-subtle">
                                    Edits here go to this one message only. To change the wording for everybody, edit the travel letters under the Email tab.
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-1 text-[12.5px] text-muted">{drafting ? "Writing the letter…" : "No letter could be written for this person — see the note at the top."}</p>
                              )}
                            </section>
                          </div>
                          {sub ? (
                            <RegistrationDetail sub={sub} onChanged={reloadSubs} where={{ postcode: t.postcode, email: t.email, said: "far" }} />
                          ) : (
                            <p className="bg-elevated/30 px-3 py-3 text-[12px] text-muted">
                              {subs === null ? "Loading the registration…" : "No registration form behind this seat, so there are no answers to show."}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
