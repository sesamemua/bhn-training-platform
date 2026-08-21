"use client";

/**
 * Picking the icon for the Symposium's Luma page.
 *
 * Sixty candidates is too many to rank and too many to pick one from
 * cold, so each person gets THREE picks. One vote across sixty options
 * splits the field into noise; three is enough to express "these are the
 * good ones" without asking anybody to hold sixty images in their head.
 *
 * RESULTS ARE HIDDEN UNTIL YOU HAVE VOTED. Not secrecy — anchoring.
 * Showing a running tally to somebody who has not decided yet turns a
 * vote into a popularity report, and the fifth person to arrive is
 * voting on what the first four did. Once you have spent a pick, the
 * numbers are yours to see.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { BarChart3, Check, Loader2, RotateCcw, X } from "lucide-react";
import {
  fullSrc, LOGO_OPTIONS, tileSrc, VOTES_PER_PERSON, type LogoOption,
} from "@/lib/symposium/logo-options";
import {
  clearMyVotes, loadVotes, saveNote, togglePick,
} from "@/app/(dashboard)/admin/workspace/symposium-2026/logo-vote/actions";
import type { Ballot, Tally } from "@/lib/symposium/vote-types";

const CARD = "rounded-xl border border-line bg-card";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.12em] text-subtle";

export function LogoVote() {
  const [tally, setTally] = useState<Tally | null>(null);
  const [mine, setMine] = useState<Ballot>({ picks: [], notes: {} });
  const [problem, setProblem] = useState<string | null>(null);
  const [zoom, setZoom] = useState<LogoOption | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(true);

  const reload = () =>
    start(async () => {
      const r = await loadVotes();
      setTally(r.tally);
      setMine(r.mine);
      setLoading(false);
    });
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const voted = mine.picks.length > 0;
  const left = VOTES_PER_PERSON - mine.picks.length;

  const ranked = useMemo(() => {
    if (!tally) return [];
    return [...LOGO_OPTIONS]
      .map((o) => ({ o, ...(tally.counts[o.id] ?? { votes: 0, voters: [], notes: [] }) }))
      .filter((r) => r.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.o.id.localeCompare(b.o.id));
  }, [tally]);

  const pick = (o: LogoOption) =>
    start(async () => {
      setProblem(null);
      const r = await togglePick(o.id);
      if (!r.ok) { setProblem(r.problem ?? "Could not record that."); return; }
      const next = await loadVotes();
      setTally(next.tally);
      setMine(next.mine);
    });

  // Escape closes the enlarged view — the only way out of a lightbox
  // that a keyboard user will look for first.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <div className="mt-5 pb-24">
      {/* What this is for, and what a vote costs you. Above the grid,
          because the first thing sixty pictures make you do is start
          clicking. */}
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL}>Your picks</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              Choose the <strong className="text-fg">{VOTES_PER_PERSON}</strong> you would put on the
              Luma registration page. Click a tile to pick it, click again to take it back —
              nothing is final. Click the image itself to see it large.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-[12.5px] font-semibold text-fg">
              {mine.picks.length} of {VOTES_PER_PERSON} used
              {left > 0 && <span className="font-normal text-muted">· {left} left</span>}
            </span>
            {voted && (
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:bg-elevated disabled:opacity-40"
                disabled={pending}
                onClick={() => start(async () => { await clearMyVotes(); reload(); })}
              >
                <RotateCcw size={12} /> Start over
              </button>
            )}
          </div>
        </div>

        {problem && (
          <p role="alert" className="mt-2.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[12.5px] text-amber-600">
            {problem}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {voted ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated"
              onClick={() => setShowResults(!showResults)}
              aria-pressed={showResults}
            >
              <BarChart3 size={13} /> {showResults ? "Hide" : "Show"} what everyone picked
            </button>
          ) : (
            /* The reason, stated. A hidden total with no explanation
               reads as the tool being coy; with one, it reads as the
               tool taking the vote seriously. */
            <p className="text-[12.5px] leading-relaxed text-subtle">
              Results appear once you have made a pick. Seeing the running total first
              turns a vote into a popularity report — you would be voting on what the
              people before you did.
            </p>
          )}
          {tally && voted && (
            <span className="text-[12px] text-subtle">
              {tally.ballots} {tally.ballots === 1 ? "person has" : "people have"} voted so far
            </span>
          )}
        </div>
      </div>

      {showResults && voted && tally && (
        <Results ranked={ranked} mine={mine} onZoom={setZoom} />
      )}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading the candidates…
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {LOGO_OPTIONS.map((o) => {
            const chosen = mine.picks.includes(o.id);
            const full = !chosen && left === 0;
            return (
              <div key={o.id} className={`group overflow-hidden rounded-xl border-2 transition-colors ${
                chosen ? "border-brand-500" : "border-line-strong hover:border-brand-400"
              }`}>
                <button
                  className="block w-full"
                  onClick={() => setZoom(o)}
                  aria-label={`See ${o.label} large`}
                >
                  <img
                    src={tileSrc(o)}
                    alt={o.label}
                    width={400}
                    height={400}
                    // Sixty images: none of them load until they are
                    // near the viewport, or opening the page is a
                    // five-megabyte download before anything is usable.
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full bg-elevated object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </button>
                <div className="flex items-center gap-2 border-t border-line bg-card px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-fg">{o.label}</span>
                    <span className="font-mono text-[10.5px] text-subtle">#{o.id}</span>
                  </span>
                  <button
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition-colors disabled:opacity-40 ${
                      chosen
                        ? "bg-brand text-white hover:brightness-110"
                        : "border border-line text-muted hover:bg-elevated hover:text-fg"
                    }`}
                    disabled={pending || full}
                    title={full ? `All ${VOTES_PER_PERSON} picks used — take one back first` : undefined}
                    onClick={() => pick(o)}
                  >
                    {chosen ? <span className="inline-flex items-center gap-1"><Check size={11} /> Picked</span> : "Pick"}
                  </button>
                </div>
                {chosen && (
                  <NoteBox
                    optionId={o.id}
                    initial={mine.notes[o.id] ?? ""}
                    onSaved={(text) => setMine((m) => ({ ...m, notes: { ...m.notes, [o.id]: text } }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {zoom && <Zoom option={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** Optional one-liner, only on something you picked. */
function NoteBox({
  optionId, initial, onSaved,
}: { optionId: string; initial: string; onSaved: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  useEffect(() => { setText(initial); }, [initial]);

  return (
    <div className="border-t border-line bg-elevated/50 px-2.5 py-2">
      <input
        className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-[11.5px] text-fg outline-none focus-visible:border-brand-500"
        placeholder="Why this one? (optional)"
        maxLength={200}
        value={text}
        onChange={(e) => { setText(e.target.value); setOk(false); }}
        onBlur={() => {
          if (text === initial) return;
          start(async () => { const r = await saveNote(optionId, text); if (r.ok) setOk(true); });
        }}
      />
      {pending && <span className="mt-1 block text-[10.5px] text-subtle">Saving…</span>}
      {ok && !pending && <span className="mt-1 block text-[10.5px] text-emerald-600">Saved.</span>}
    </div>
  );
}

function Results({
  ranked, mine, onZoom,
}: {
  ranked: { o: LogoOption; votes: number; voters: string[]; notes: { who: string; note: string }[] }[];
  mine: Ballot;
  onZoom: (o: LogoOption) => void;
}) {
  const top = ranked[0]?.votes ?? 1;
  return (
    <section className="mt-4">
      <p className={LABEL}>What everyone picked</p>
      {ranked.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">Nothing yet — yours will be the first.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
          {ranked.map((r, i) => (
            <li key={r.o.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="w-5 shrink-0 pt-1 text-right font-mono text-[11px] text-subtle">{i + 1}</span>
              <button onClick={() => onZoom(r.o)} className="shrink-0" aria-label={`See ${r.o.label} large`}>
                <img
                  src={tileSrc(r.o)} alt={r.o.label} width={48} height={48} loading="lazy"
                  className="h-12 w-12 rounded-md border border-line object-cover"
                />
              </button>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-fg">{r.o.label}</span>
                  <span className="font-mono text-[10.5px] text-subtle">#{r.o.id}</span>
                  {mine.picks.includes(r.o.id) && (
                    <span className="rounded border border-brand-500/50 bg-brand-500/10 px-1.5 text-[10px] text-brand-500">yours</span>
                  )}
                </span>
                {/* A bar as well as a number: sixty rows of digits is a
                    table you read, not a result you see. */}
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r.votes / top) * 100}%` }} />
                </span>
                <span className="mt-1 block text-[11.5px] text-muted">{r.voters.join(", ")}</span>
                {r.notes.map((n, j) => (
                  <span key={j} className="mt-0.5 block text-[11.5px] italic text-subtle">
                    “{n.note}” — {n.who}
                  </span>
                ))}
              </span>
              <span className="shrink-0 pt-0.5 text-[15px] font-bold text-fg">{r.votes}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Zoom({ option, onClose }: { option: LogoOption; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={option.label}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="max-h-full w-full max-w-[620px] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <img
          src={fullSrc(option)}
          alt={option.label}
          width={1000}
          height={1000}
          className="w-full rounded-xl shadow-2xl"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-white">
            {option.label} <span className="font-mono text-[11px] text-white/60">#{option.id}</span>
          </span>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/25"
          >
            <X size={13} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}
