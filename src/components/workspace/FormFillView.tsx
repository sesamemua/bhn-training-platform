"use client";

/**
 * The form as the person filling it in sees it.
 *
 * The builder already had a preview, but it was a BUILDER'S preview:
 * admin-dense, in a 56% pane beside the workflow, captioned "3 of 22
 * shown · 4 still needed". That answers "is my logic working", which is
 * a different question from "is this a good thing to receive". You
 * cannot tell whether a form is too long, whether the help text reads
 * as help or as legal cover, or whether the consent question feels like
 * a trap, from a pane that is showing you three of its questions.
 *
 * So: full width, one readable column, the real logic underneath.
 * Conditional questions appear and vanish as they would, the session
 * calendar is the same component the live form uses, and Submit
 * validates for real — it just does not send.
 *
 * NOTHING IS SUBMITTED. Said in the page, not only in a tooltip: an
 * admin will show this to a colleague, and a colleague who thinks they
 * have registered is worse off than one who never saw it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Eye, Mail, RotateCcw } from "lucide-react";
import { chosenClashes } from "@/lib/formbuilder/calendar";
import { linkify } from "@/lib/formbuilder/linkify";
import { receiptLine, type Receipt } from "@/lib/formbuilder/receipt";
import { rankedSessions } from "@/lib/formbuilder/submit";
import { missing, optionsFor, settled, visibleFields, type Answers } from "@/lib/formbuilder/logic";
import { FIELD_STAGES, type BuiltForm, type FieldStage, type FormField } from "@/lib/formbuilder/types";
import { ordinal, SessionCalendar } from "./SessionCalendar";

/** Above this many options a radio list becomes a page of its own. */
const RADIO_MAX = 6;

const FIELD =
  "mt-2 w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-[14px] text-fg outline-none transition-colors focus-visible:border-brand-500";

export function FormFillView({
  doc, title, submit,
}: {
  doc: BuiltForm;
  title: string;
  /**
   * Actually file it. Absent means this is a look, not a submission —
   * the builder's own preview passes nothing.
   */
  submit?: (answers: Answers) => Promise<{ ok: boolean; problems?: string[]; receipt?: Receipt }>;
}) {
  const [stage, setStage] = useState<FieldStage>("registration");
  const [answers, setAnswers] = useState<Answers>({});
  // Only after Submit. A form that scolds you about question 14 while
  // you are still on question 2 is a form that is wrong about you.
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | undefined>();
  const [refused, setRefused] = useState<string[]>([]);

  const shown = useMemo(() => visibleFields(doc, answers, stage), [doc, answers, stage]);
  // Notes are not questions, so they are not counted as any.
  const asked = shown.filter((f) => f.type !== "note");

  /*
   * ONE QUESTION AT A TIME, until you have been through it once.
   *
   * Sixteen questions on arrival is a wall, and the first one is the
   * one that decides whether the other fifteen are even yours to
   * answer — somebody who has to go and join a programme should find
   * that out before scrolling past a session picker they cannot use.
   *
   * `reach` is how far down the form has opened. Answering the deepest
   * open question opens the next; Continue does the same for a
   * question you are leaving blank. Everything already answered stays
   * on screen, so this is a form unfolding, not a wizard that hides
   * what you said.
   */
  const [reach, setReach] = useState(1);
  const [all, setAll] = useState(false);

  const answeredAt = (f: FormField) => {
    const v = answers[f.key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
  };

  // A note is something the form says, so it never waits for a click —
  // it opens along with whatever comes after it.
  const deepest = Math.min(reach, shown.length);
  const auto = useMemo(() => {
    let n = deepest;
    // `settled`, not "answered". A text box counts as answered after
    // its FIRST keystroke, so this used to open the next question and
    // move the cursor into it while somebody was halfway through typing
    // their email — the page jumped and they had to scroll back.
    while (n < shown.length && shown[n - 1] && settled(shown[n - 1], answers)) n += 1;
    return n;
  }, [deepest, shown, answers]);

  /*
   * A HIGH-WATER MARK, so the form never folds back up.
   *
   * `auto` is recomputed from scratch every render, so it falls the
   * moment an edit makes an earlier question unanswered or reveals a new
   * one — going back to change your organisation on a finished form used
   * to hide three answered questions and the Submit button with them.
   * What has been opened stays open.
   *
   * Adjusted DURING render rather than in an effect: an effect paints
   * the collapsed state for a frame first, which is the flicker rather
   * than the fix. Clamped to shown.length because a branch can remove
   * questions, and a mark past the end would strand Submit off-screen.
   */
  const [hi, setHi] = useState(1);
  const want = Math.min(Math.max(hi, auto), Math.max(shown.length, 1));
  if (want !== hi) setHi(want);

  const open = all ? shown.length : want;
  const visible = shown.slice(0, open);

  /*
   * A note can END the form.
   *
   * Somebody told to go and join a programme is not one Continue away
   * from a seat, and offering them Submit — then "Complete: every
   * required question has an answer" — would be the form contradicting
   * itself on one screen.
   */
  const stopped = visible.find((f) => f.stopsHere);

  const more = shown.length - open;
  const last = shown[open - 1];
  const waiting = last && last.type !== "note" && last.required && !answeredAt(last);
  const gaps = useMemo(() => missing(doc, answers, stage), [doc, answers, stage]);
  const gapKeys = useMemo(() => new Set(gaps.map((f) => f.key)), [gaps]);

  /*
   * "Nothing left to open" is not the same as "finished".
   *
   * Almost every question now sits behind the answer to the first one,
   * so before it is answered the whole rest of the form is invisible and
   * `more` is 0 — which used to put Submit and the photography terms on
   * screen under a single unanswered question. A required question with
   * no answer can still be hiding the rest of the form behind it.
   */
  const ended = more === 0 && gaps.length === 0;

  const set = (k: string, v: Answers[string]) => { setAnswers({ ...answers, [k]: v }); setDone(false); };

  /*
   * Focus follows the question that just opened.
   *
   * Continue disables itself the instant it reveals a required question,
   * so the element under the user's finger vanishes and focus drops to
   * the body — three times in one pass through the eligible branch.
   * Moving focus onto the new field fixes that and gives a screen reader
   * something to announce.
   */
  const listRef = useRef<HTMLDivElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const opened = shown[open - 1];
    // Nothing to type in a note, and focusing the question BEFORE it —
    // which is what taking "the last tagged element" did when the new
    // one was a note — pulls the cursor backwards into an answer the
    // person has already given.
    if (!opened || opened.type === "note") return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-q="${CSS.escape(opened.key)}"] input, [data-q="${CSS.escape(opened.key)}"] select, [data-q="${CSS.escape(opened.key)}"] textarea`)
      ?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => {
    setAnswers({}); setTried(false); setDone(false); setSent(false); setRefused([]); setReceipt(undefined);
    setReach(1); setHi(1); setAll(false);
  };

  const answered = asked.filter(answeredAt).length;

  /*
   * Once it is in, the form is gone.
   *
   * Leaving the questions on screen under a green tick invites somebody
   * to change an answer that has already been submitted, and then
   * either submit again or leave believing they have. Registering is
   * finished; the screen should say so and say what happens next.
   */
  if (sent) {
    return (
      <Confirmation
        title={title}
        answers={answers}
        doc={doc}
        receipt={receipt}
        onAgain={reset}
      />
    );
  }

  return (
    <div className="mx-auto mt-5 max-w-[760px] pb-24">
      {/* Said once, at the top, where it cannot be missed. */}
      <p className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600">
        <Eye size={14} className="shrink-0" />
        {submit
          ? "The form as a registrant meets it. Submitting from here files a TEST entry — it appears in Admin → Registrants, marked as a test, and you can delete it there."
          : "This is a preview. Fill it in as much as you like — nothing is sent and nobody is registered."}
      </p>

      {/* Two moments, and the second one is not on this form at all. */}
      {doc.fields.some((f) => f.stage === "confirmation") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FIELD_STAGES.map((st) => (
            <button
              key={st}
              onClick={() => { setStage(st); setTried(false); setDone(false); setReach(1); setHi(1); setAll(false); }}
              aria-pressed={stage === st}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                stage === st ? "border-brand-500 bg-brand-500/12 text-fg" : "border-line text-muted hover:bg-elevated"
              }`}
            >
              {st === "registration" ? "The registration form" : "The email after approval"}
            </button>
          ))}
        </div>
      )}

      <header className="mt-5">
        <h2 className="text-[26px] font-bold leading-tight tracking-tight text-fg">{title}</h2>
        <p className="mt-1.5 text-[13.5px] text-muted">
          {asked.length} question{asked.length === 1 ? "" : "s"}
          {answered > 0 && ` · ${answered} answered`}
          {asked.some((f) => f.required) && ` · questions marked * are required`}
        </p>
      </header>

      {tried && gaps.length > 0 && (
        <div role="alert" className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-500">
            <AlertTriangle size={14} /> {gaps.length} question{gaps.length === 1 ? "" : "s"} still need{gaps.length === 1 ? "s" : ""} an answer
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {gaps.map((f) => <li key={f.id} className="text-[12.5px] text-red-500">{f.label}</li>)}
          </ul>
        </div>
      )}

      {stopped && (
        <p className="mt-4 rounded-lg border border-line bg-elevated/60 p-3 text-[12.5px] leading-relaxed text-muted">
          There is nothing more to fill in for now. Once you are in a programme, come back
          to this form and it will carry on from here.
        </p>
      )}

      {refused.length > 0 && (
        <div role="alert" className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-500">
            <AlertTriangle size={14} /> The server did not accept it
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {refused.map((p) => <li key={p} className="text-[12.5px] text-red-500">{p}</li>)}
          </ul>
        </div>
      )}

      {done && !stopped && (
        <div role="status" className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-600">
            <Check size={14} /> Complete — every required question has an answer.
          </p>
          <p className="mt-1 text-[12.5px] text-emerald-600">
            {sent
              ? "Filed. It is in Admin → Registrants, marked as a test — delete it there when you are done."
              : "A real submission would go to the coordinator from here. This one went nowhere."}
          </p>
        </div>
      )}

      <div ref={listRef} className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border-2 border-line-strong bg-card">
        {visible.map((f) => (
          <Question
            key={f.id}
            doc={doc}
            field={f}
            index={f.type === "note" ? 0 : asked.indexOf(f) + 1}
            answers={answers}
            set={set}
            flagged={tried && gapKeys.has(f.key)}
          />
        ))}
        {shown.length === 0 && (
          <p className="p-10 text-center text-[13px] text-muted">
            No questions in this part of the form yet.
          </p>
        )}
      </div>

      {/* Continue rather than an auto-advance for a blank one: leaving a
          question empty is a decision, and a form that scrolls on by
          itself while you are still reading it is worse than one that
          waits. */}
      {/* Nothing further to open, but something still to answer. Said
          as a prompt rather than as a Submit button that refuses:
          a disabled control with no explanation is worse than a
          sentence naming the question. */}
      {more === 0 && gaps.length > 0 && !stopped && (
        <p role="status" className="mt-4 rounded-lg border border-line bg-elevated/60 p-3 text-[12.5px] leading-relaxed text-muted">
          {gaps.length === 1
            ? `Answer “${gaps[0].label}” to carry on.`
            : `${gaps.length} questions still need an answer.`}
        </p>
      )}

      {more > 0 && !stopped && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
            disabled={waiting}
            aria-describedby="continue-hint"
            onClick={() => setReach(open + 1)}
          >
            Continue
          </button>
          <span id="continue-hint" className="text-[12px] text-subtle">
            {waiting
              ? "Answer this one to carry on."
              : `${more} more question${more === 1 ? "" : "s"} after this`}
          </span>
          {/* For the person who wants to see what they are in for
              before they start — a progress bar is a promise, and some
              people would rather read the contract. */}
          <button className="ml-auto text-[12px] underline text-muted hover:text-fg" onClick={() => setAll(true)}>
            Show all {shown.length}
          </button>
        </div>
      )}

      {/* Terms carried by the button, not asked as a question.
          "Do you agree to be photographed?" invites a No the form then
          has to refuse — a worse conversation than saying up front that
          agreeing is part of registering. Directly above the button, so
          it is read at the moment it applies. */}
      {/* Registration only. The confirmation email asks one question
          weeks later, and the photography terms of a form you already
          submitted have no business above that button. */}
      {shown.length > 0 && ended && !stopped && stage === "registration" && doc.submitNote && (
        <p className="mt-5 rounded-xl border border-line bg-elevated/60 p-4 text-[12.5px] leading-relaxed text-muted">
          <Linked text={doc.submitNote} />
        </p>
      )}

      {shown.length > 0 && ended && !stopped && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-brand px-6 py-3 text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
            disabled={sending || sent}
            onClick={async () => {
              setTried(true);
              setRefused([]);
              if (gaps.length > 0) { setDone(false); return; }
              if (!submit) { setDone(true); return; }
              setSending(true);
              // The server checks the same rules again — this is a
              // public endpoint, and the disabled buttons above it are
              // a courtesy, not a guarantee.
              const r: { ok: boolean; problems?: string[]; receipt?: Receipt } =
                await submit(answers).catch(() => ({ ok: false, problems: ["Could not reach the server."] }));
              setSending(false);
              if (r.ok) { setSent(true); setDone(true); setReceipt(r.receipt); } else setRefused(r.problems ?? ["It was not accepted."]);
            }}
          >
            {sending ? "Submitting…" : sent ? "Submitted" : stage === "registration" ? "Submit registration" : "Send my answer"}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-elevated"
            onClick={reset}
          >
            <RotateCcw size={13} /> Start again
          </button>
          <span className="text-[12px] text-subtle">
            {submit ? "Checked here and again on the server." : "Checked for real. Sent nowhere."}
          </span>
        </div>
      )}
    </div>
  );
}

function Question({
  doc, field: f, index, answers, set, flagged,
}: {
  doc: BuiltForm; field: FormField; index: number;
  answers: Answers; set: (k: string, v: Answers[string]) => void; flagged: boolean;
}) {
  const opts = optionsFor(doc, f);
  const arr = Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : [];
  const clashing = f.slots.length > 0 ? chosenClashes(f.slots, arr) : [];
  const none = Boolean(f.noneLabel) && answers[f.key] === f.noneLabel;

  /*
   * The cap, enforced where the clicking happens.
   *
   * It used to live only in the help text and in the flow chart's rule
   * box. The form said "up to 3" and then took all six — which is not a
   * limit, it is a suggestion nobody was told they had broken, and the
   * first anybody would have heard of it is a coordinator hand-cutting
   * somebody's fourth choice.
   *
   * Taking one BACK is always allowed, or reaching the cap would lock
   * the answer in.
   */
  const cap = f.maxChoices;
  const atCap = cap !== undefined && arr.length >= cap;
  const only = f.exclusiveOption;
  const pickMulti = (o: string) => {
    if (arr.includes(o)) { set(f.key, arr.filter((x) => x !== o)); return; }
    if (atCap) return;
    // "No requirements" and "Vegan" together is not an answer, it is
    // two contradicting each other, and whoever orders the food has no
    // way to know which one to believe.
    if (only && o === only) { set(f.key, [only]); return; }
    set(f.key, [...arr.filter((x) => x !== only), o]);
  };

  /*
   * A note is a thing the form SAYS. No number, no asterisk, no input —
   * numbering it would make somebody look for the box to fill in.
   */
  if (f.type === "note") {
    return (
      <div className="bg-elevated/40 px-6 py-4">
        <p className="text-[14px] font-semibold leading-snug text-fg">{f.label}</p>
        {f.help && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <Linked text={f.help} />
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-q={f.key} className={`px-6 py-5 ${flagged ? "bg-red-500/[0.04]" : ""}`}>
      {f.type !== "consent" && (
        <label className="block">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-subtle">{index}</span>
            <span className="text-[15px] font-semibold leading-snug text-fg">
              {f.label}
              {f.required && <span className="ml-1 text-brand-500" title="Required">*</span>}
            </span>
          </span>
          {/* Under the question, above the answer — it is guidance for
              answering, not a footnote about what you already did. */}
          {f.help && <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{f.help}</span>}
        </label>
      )}

      {f.type === "consent" ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-elevated p-4 hover:border-brand-400">
          <input
            type="radio"
            name={`fill_consent_${f.key}`}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-500)]"
            checked={answers[f.key] === "Yes"}
            onChange={() => set(f.key, "Yes")}
          />
          <span>
            <span className="block text-[14px] font-semibold leading-snug text-fg">
              {f.label}{f.required && <span className="ml-1 text-brand-500">*</span>}
            </span>
            {f.help && <span className="mt-1.5 block text-[12.5px] leading-relaxed text-muted">{f.help}</span>}
          </span>
        </label>
      ) : f.type === "yesno" ? (
        <div className="mt-2.5 flex gap-2">
          {["Yes", "No"].map((v) => (
            <button
              key={v}
              onClick={() => set(f.key, v)}
              aria-pressed={answers[f.key] === v}
              className={`min-w-[84px] rounded-lg border px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                answers[f.key] === v ? "border-brand-500 bg-brand-500/12 text-fg" : "border-line text-muted hover:bg-elevated"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      ) : (f.type === "choice" || f.type === "lookup") && opts.length > 0 && opts.length <= RADIO_MAX ? (
        /*
         * Radios, not a dropdown.
         *
         * A short list in a <select> hides every answer but one behind a
         * click — you cannot compare four options you cannot see, and on
         * a phone it opens a wheel. Above RADIO_MAX it flips back: the
         * 41-institution list as radio buttons would be a page of its
         * own.
         */
        <div className="mt-2.5 space-y-2">
          {opts.map((o) => (
            <label
              key={o}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                answers[f.key] === o ? "border-brand-500 bg-brand-500/10" : "border-line bg-elevated hover:border-brand-400"
              }`}
            >
              <input
                type="radio"
                name={`fill_${f.key}`}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-500)]"
                checked={answers[f.key] === o}
                onChange={() => set(f.key, o)}
              />
              <span className={`text-[13.5px] leading-snug ${answers[f.key] === o ? "font-semibold text-fg" : "text-muted"}`}>{o}</span>
            </label>
          ))}
        </div>
      ) : f.type === "choice" || f.type === "lookup" ? (
        <select className={FIELD} value={String(answers[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">Choose…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "multi" && f.slots.length > 0 ? (
        <>
          <SessionCalendar field={f} chosen={arr} onToggle={pickMulti} />
          {/* The ranking, written out.
              Badges on the calendar give each cell its position; this
              gives the ORDER, which is the thing being asked for and
              the thing a coordinator reads off the answer. Its own box,
              because on a busy calendar a line of text under it is not
              where anybody looks to check what they chose. */}
          {arr.length > 0 && (
            <div className="mt-3 rounded-lg border-2 border-brand-500/40 bg-brand-500/[0.06] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-500">
                Your ranking
              </p>
              <ol className="mt-1.5 space-y-1">
                {arr.map((o, i) => (
                  <li key={o} className="flex items-baseline gap-2 text-[13px] text-fg">
                    <span className="w-9 shrink-0 text-[11px] font-bold uppercase tracking-wide text-brand-500">
                      {ordinal(i + 1)}
                    </span>
                    <span>{o.split(" · ").pop()}</span>
                    <span className="font-mono text-[11px] text-subtle">{o.split(" · ")[1]}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11.5px] leading-snug text-muted">
                {atCap
                  ? `That is all ${cap}. To change your mind, click one again to take it back.`
                  : arr.length === 1
                    ? `Pick another and it becomes your 2nd choice.${cap ? ` You can choose ${cap - arr.length} more.` : ""}`
                    : `This is the order we go by when a room is oversubscribed.${cap ? ` You can choose ${cap - arr.length} more.` : ""}`}
              </p>
            </div>
          )}
          {/* With no cap on how many may be chosen, this is the ONLY
              thing standing between somebody and a day they cannot
              physically attend. It names the pairs rather than counting
              them: "2 pairs clash" leaves the reader to work out which,
              on a calendar they have just been scrolling. */}
          {clashing.length > 0 && (
            <div role="status" className="mt-2 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-600">
                <AlertTriangle size={14} className="shrink-0" />
                {clashing.length === 1
                  ? "Two of your choices are on at the same time"
                  : `${clashing.length} pairs of your choices are on at the same time`}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {clashing.map(([a, b]) => (
                  <li key={`${a}|${b}`} className="text-[12px] leading-snug text-amber-600">
                    {a.split(" · ").pop()} <span className="opacity-70">and</span> {b.split(" · ").pop()}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] leading-relaxed text-amber-600">
                You can leave both chosen — it tells us you would take either — but only{" "}
                {f.approveFromClash ?? 1} of a clashing pair can be approved, so you will not be
                given both.
              </p>
            </div>
          )}
        </>
      ) : f.type === "multi" ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {opts.map((o) => {
            const on = arr.includes(o);
            return (
              <button
                key={o}
                onClick={() => pickMulti(o)}
                aria-pressed={on}
                disabled={!on && atCap}
                title={!on && atCap ? `${cap} is the most you can choose — take one back first` : undefined}
                className={`rounded-lg border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-40 ${
                  on ? "border-brand-500 bg-brand-500/12 font-semibold text-fg" : "border-line text-muted hover:bg-elevated"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : f.type === "long_text" ? (
        <>
          <textarea
            rows={4}
            className={FIELD}
            disabled={none}
            value={none ? "" : String(answers[f.key] ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
          />
          <NoneOption field={f} answers={answers} set={set} />
        </>
      ) : (
        <>
        <input
            className={FIELD}
            disabled={none}
            type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
            value={none ? "" : String(answers[f.key] ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
          />
          <NoneOption field={f} answers={answers} set={set} />
        </>
      )}
    </div>
  );
}

/**
 * "Not applicable", as an answer rather than as a blank.
 *
 * Ticking it fills the field with the label, so the difference between
 * "none" and "have not got to it yet" survives into the spreadsheet.
 * Ticking it again clears it, because a one-way control is a trap.
 */
function NoneOption({
  field: f, answers, set,
}: { field: FormField; answers: Answers; set: (k: string, v: Answers[string]) => void }) {
  if (!f.noneLabel) return null;
  const on = answers[f.key] === f.noneLabel;
  return (
    <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
      <input
        type="radio"
        name={`fill_none_${f.key}`}
        checked={on}
        className="h-4 w-4 accent-[var(--brand-500)]"
        onChange={() => set(f.key, on ? "" : f.noneLabel!)}
        onClick={() => { if (on) set(f.key, ""); }}
      />
      <span className={`text-[12.5px] ${on ? "font-semibold text-fg" : "text-muted"}`}>{f.noneLabel}</span>
    </label>
  );
}

/**
 * A sentence, with any address in it made clickable.
 *
 * A note that tells somebody where to go and then makes them select,
 * copy and paste it has passed the last step back to them.
 *
 * Opened in a new tab with rel="noopener": the form is half filled in,
 * and navigating away from it to read about a programme would throw
 * that away.
 */
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((piece, i) =>
        "href" in piece ? (
          <a
            key={i}
            href={piece.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-500 underline underline-offset-2 hover:text-brand-400"
          >
            {piece.text}
          </a>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </>
  );
}

/**
 * What somebody sees once they have registered.
 *
 * Three things, in the order they will want them: it worked, when you
 * will hear, and what you asked for. The timeline is the one everybody
 * wants and nobody is told — a form that ends on "thank you" and
 * nothing else produces a fortnight of people wondering whether it went
 * through, and then registering again.
 */
function Confirmation({
  title, answers, doc, receipt, onAgain,
}: {
  title: string;
  answers: Answers;
  doc: BuiltForm;
  receipt: Receipt | undefined;
  onAgain: () => void;
}) {
  const ranked = rankedSessions(doc, answers);
  const line = receiptLine(receipt);
  const shown = receipt && "preview" in receipt ? receipt.preview : null;
  // Anything other than a plain "sent" is something a coordinator needs
  // to see, not something to bury under a tick.
  const wrong = receipt && receipt.state !== "sent" && receipt.state !== "sent-to-you";

  return (
    <div className="mx-auto mt-5 max-w-[720px] pb-24">
      <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/[0.06] p-6">
        <p className="flex items-center gap-2 text-[20px] font-bold leading-tight text-fg">
          <Check size={22} className="shrink-0 text-emerald-600" />
          That is your registration in.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Thank you for registering for {title}. You do not need to do anything else.
        </p>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-card p-4">
          <Clock size={16} className="mt-0.5 shrink-0 text-brand-500" />
          <p className="text-[13px] leading-relaxed text-fg">
            <strong>We will come back to you within two to three weeks.</strong> Places are limited
            and every registration is reviewed together rather than as it arrives, so it takes that
            long. We will write to you either way — whether or not we can offer you a place. If you
            have not heard after three weeks, reply to the email and we will chase it.
          </p>
        </div>

        {line && (
          <p
            className={`mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed ${
              wrong ? "text-amber-600" : "text-muted"
            }`}
          >
            {wrong ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Mail size={14} className="mt-0.5 shrink-0" />}
            {line}
          </p>
        )}
      </div>

      {ranked.length > 0 && (
        <section className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">What you asked for</p>
          <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
            {ranked.map((o, i) => (
              <li key={o} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="w-9 shrink-0 text-[11px] font-bold uppercase tracking-wide text-brand-500">
                  {ordinal(i + 1)}
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-fg">{o.split(" · ").pop()}</span>
                <span className="font-mono text-[11px] text-subtle">{o.split(" · ")[1]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-[11.5px] leading-snug text-subtle">
            Ranked in the order you chose them. Where a room is oversubscribed, that order is what
            we go by.
          </p>
        </section>
      )}

      {/* Shown when the letter did not go out, so a coordinator can see
          exactly what a registrant would have received rather than
          guessing at it. */}
      {shown && wrong && (
        <details className="mt-4 rounded-xl border border-line bg-elevated/40 p-3">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-fg">
            The letter that would have gone to {shown.to}
          </summary>
          <p className="mt-2 text-[12.5px] font-semibold text-fg">{shown.subject}</p>
          <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-muted">
            {shown.body}
          </pre>
        </details>
      )}

      <button
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-elevated"
        onClick={onAgain}
      >
        <RotateCcw size={13} /> Fill it in again
      </button>
    </div>
  );
}
