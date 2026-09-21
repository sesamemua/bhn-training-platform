"use client";

/**
 * Knowledge Exchange awardees as the team sees them: the link to send,
 * the two settings, and every submission — grouped by round unless
 * asked otherwise.
 */
import { useState, useTransition } from "react";
import { Check, Copy, Download, ExternalLink, Trash2 } from "lucide-react";
import { toCsv } from "@/lib/formbuilder/csv";
import { downloadText, fileDate } from "@/lib/download";
import { countWords } from "@/lib/events/bio";
import {
  FIRST_ROUND,
  QUOTE_MAX_WORDS,
  QUOTE_MIN_WORDS,
  TEXT_FIELDS,
  type KeSettings,
} from "@/lib/knowledge-exchange/intake";
import {
  deleteAwardee,
  setAwardeeRound,
  setCurrentRound,
  setQuoteLimit,
} from "@/app/(dashboard)/admin/workspace/knowledge-exchange/actions";

export interface AwardeeRow {
  id: string;
  round: number;
  fullName: string;
  projectTitle: string;
  projectSummary: string;
  homeInstitution: string;
  hostInstitution: string;
  hostDepartment: string;
  photoUrl: string;
  quote: string;
  linkedinUrl: string | null;
  createdAt: string;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
/** Stored as typed, so "linkedin.com/in/x" needs a scheme — and anything else stays inert. */
const linkHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const BTN =
  "inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-fg hover:border-brand-400 disabled:opacity-40";
const LINK = "font-medium text-brand-700 hover:underline";

export function KeAwardeesManager({
  link,
  settings,
  awardees: initial,
}: {
  link: string;
  settings: KeSettings;
  awardees: AwardeeRow[];
}) {
  const [awardees, setAwardees] = useState(initial);
  const [round, setRound] = useState(settings.round);
  const [limit, setLimit] = useState(String(settings.quoteMaxWords));
  const [inForce, setInForce] = useState(settings.quoteMaxWords);
  const [byRound, setByRound] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const used = awardees.map((a) => a.round);
  // One past the highest round in use, so the next round is always a choice.
  const rounds = range(Math.min(FIRST_ROUND, ...used), Math.max(round, ...used) + 1);

  const sorted = [...awardees].sort(
    byRound
      ? (a, b) => b.round - a.round || a.createdAt.localeCompare(b.createdAt)
      : (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
  const groups = byRound
    ? [...new Set(sorted.map((a) => a.round))].map((r) => ({ round: r, list: sorted.filter((a) => a.round === r) }))
    : [{ round: null, list: sorted }];

  /** Save in the background; put the screen back if it fails. */
  function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string, undo: () => void) {
    setNote(null);
    start(async () => {
      const r = await work().catch(() => ({ ok: false, error: "Couldn't save. Please try again." }));
      if (r.ok) setNote(done);
      else {
        undo();
        setNote(r.error ?? "Couldn't save. Please try again.");
      }
    });
  }

  function move(a: AwardeeRow, to: number) {
    const put = (r: number) => setAwardees((cur) => cur.map((x) => (x.id === a.id ? { ...x, round: r } : x)));
    put(to);
    run(() => setAwardeeRound(a.id, to), `${a.fullName} moved to Round ${to}.`, () => put(a.round));
  }

  function remove(a: AwardeeRow) {
    if (!confirm(`Delete ${a.fullName}'s submission?\n\nTheir photo is deleted too. This can't be undone.`)) return;
    setAwardees((cur) => cur.filter((x) => x.id !== a.id));
    run(() => deleteAwardee(a.id), `${a.fullName}'s submission was deleted.`, () => setAwardees((cur) => [...cur, a]));
  }

  function chooseRound(r: number) {
    const was = round;
    setRound(r);
    run(() => setCurrentRound(r), `New submissions now go into Round ${r}.`, () => setRound(was));
  }

  function saveLimit() {
    setNote(null);
    start(async () => {
      const r = await setQuoteLimit(Number(limit)).catch(() => ({
        ok: false as const,
        error: "Couldn't save. Please try again.",
      }));
      if (!r.ok) return setNote(r.error);
      setInForce(r.words);
      setLimit(String(r.words));
      setNote(`The form now allows up to ${r.words} words.`);
    });
  }

  function csv() {
    downloadText(
      `knowledge-exchange-awardees-${fileDate()}.csv`,
      toCsv([
        ["Round", ...TEXT_FIELDS.map((f) => f.label), "Quote", "LinkedIn", "Photo", "Submitted"],
        ...sorted.map((a) => [
          a.round,
          ...TEXT_FIELDS.map((f) => a[f.key]),
          a.quote,
          a.linkedinUrl,
          a.photoUrl,
          a.createdAt.slice(0, 10),
        ]),
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-card-solid p-4">
        <h2 className="text-[13.5px] font-semibold text-fg">Form link</h2>
        <p className="text-[12px] text-fg-subtle">Send this to awardees. No login needed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-elevated/60 px-2.5 py-1.5 text-[12px] text-brand-700">
            {link}
          </code>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className={BTN}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
          <a href={link} target="_blank" rel="noreferrer" className={BTN}>
            <ExternalLink size={12} /> Open
          </a>
        </div>

        <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="ke-current-round" className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              New submissions go into
            </label>
            <select
              id="ke-current-round"
              value={round}
              disabled={pending}
              onChange={(e) => chooseRound(Number(e.target.value))}
              className="w-40 rounded-md border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus:border-brand-500"
            >
              {rounds.map((r) => (
                <option key={r} value={r}>Round {r}</option>
              ))}
            </select>
            <span className="text-[11.5px] text-fg-subtle">Awardees never see the round.</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ke-quote-limit" className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Quote length, in words
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ke-quote-limit"
                type="number"
                inputMode="numeric"
                min={QUOTE_MIN_WORDS}
                max={QUOTE_MAX_WORDS}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-24 rounded-md border border-line bg-card px-2.5 py-1.5 text-[12.5px] tabular-nums text-fg outline-none focus:border-brand-500"
              />
              <button
                onClick={saveLimit}
                disabled={pending || Number(limit) === inForce}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
              >
                Save
              </button>
            </div>
            <span className="text-[11.5px] text-fg-subtle">
              The form allows up to <span className="font-semibold tabular-nums text-fg">{inForce}</span> words
              ({QUOTE_MIN_WORDS}–{QUOTE_MAX_WORDS}).
            </span>
          </div>
        </div>
        {note && (
          <p role="status" className="mt-2 text-[11.5px] text-brand-700">
            {note}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-fg">
          {awardees.length} submission{awardees.length === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Arrange submissions" className="inline-flex rounded-md border border-line p-0.5">
            {[
              { on: true, label: "By round" },
              { on: false, label: "Newest first" },
            ].map((v) => (
              <button
                key={v.label}
                aria-pressed={byRound === v.on}
                onClick={() => setByRound(v.on)}
                className={`rounded px-2.5 py-1 text-[12px] font-medium ${
                  byRound === v.on ? "bg-brand-600 text-white" : "text-muted hover:text-fg"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={csv} disabled={awardees.length === 0} className={BTN}>
            <Download size={12} /> Download CSV
          </button>
        </div>
      </div>

      {awardees.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-[13px] text-muted">
          No submissions yet. Copy the link above and send it to this round’s awardees.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.round ?? "all"} className="space-y-2">
            {g.round !== null && (
              <h3 className="flex items-baseline gap-2 text-[15px] font-bold text-fg">
                Round {g.round}
                <span className="text-[12px] font-medium text-muted">
                  {g.list.length} awardee{g.list.length === 1 ? "" : "s"}
                </span>
              </h3>
            )}
            <ul className="space-y-2">
              {g.list.map((a) => (
                <li key={a.id} className="rounded-xl border border-line bg-card-solid p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <a href={a.photoUrl} target="_blank" rel="noreferrer" title="Open the full photo" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- R2 URL, no loader configured */}
                      <img src={a.photoUrl} alt={`Photo of ${a.fullName}`} className="h-28 w-28 rounded-lg object-cover" />
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[14.5px] font-semibold text-fg">{a.fullName}</p>
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`Round for ${a.fullName}`}
                            value={a.round}
                            disabled={pending}
                            onChange={(e) => move(a, Number(e.target.value))}
                            className="rounded-md border border-line bg-card px-2 py-1 text-[12px] text-fg outline-none focus:border-brand-500"
                          >
                            {rounds.map((r) => (
                              <option key={r} value={r}>Round {r}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => remove(a)}
                            disabled={pending}
                            title="Delete"
                            aria-label={`Delete ${a.fullName}'s submission`}
                            className="rounded-md border border-line p-1.5 text-fg-muted hover:border-rose-300 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[12px]">
                        <dt className="text-fg-subtle">Home</dt>
                        <dd className="text-muted">{a.homeInstitution}</dd>
                        <dt className="text-fg-subtle">Host</dt>
                        <dd className="text-muted">{a.hostInstitution} · {a.hostDepartment}</dd>
                      </dl>
                      <p className="mt-2 text-[13px] font-semibold text-fg">{a.projectTitle}</p>
                      <p className="text-[12.5px] leading-relaxed text-muted">{a.projectSummary}</p>
                      <blockquote className="mt-2 border-l-2 border-brand-300 pl-3 text-[13px] italic leading-relaxed text-fg">
                        “{a.quote}”
                      </blockquote>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
                        {a.linkedinUrl ? (
                          <a href={linkHref(a.linkedinUrl)} target="_blank" rel="noreferrer" className={LINK}>
                            LinkedIn
                          </a>
                        ) : (
                          <span>No LinkedIn</span>
                        )}
                        <a href={a.photoUrl} target="_blank" rel="noreferrer" className={LINK}>
                          Full photo
                        </a>
                        <span className="tabular-nums">
                          {countWords(a.quote)} words · sent {day(a.createdAt)}
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
