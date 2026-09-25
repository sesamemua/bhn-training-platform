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
 * Conditional questions appear and vanish as they would, and the
 * session calendar is the same component in all three modes:
 *
 *   preview — validates locally and sends nothing
 *   test    — files an admin-only row marked __test
 *   live    — files a genuine public registration
 *
 * The mode is explicit rather than inferred from the presence of a
 * submit function. Both the test and live forms submit, but telling a
 * real registrant that their entry is only a test is a serious lie.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Eye, RotateCcw } from "lucide-react";
import { chosenConflicts, sessionParts } from "@/lib/formbuilder/calendar";
import { hasLink, linkify } from "@/lib/formbuilder/linkify";
import { receiptLine, type Receipt } from "@/lib/formbuilder/receipt";
import { rankedSessions, sessionField } from "@/lib/formbuilder/submit";
import { ELIGIBILITY_EMAIL_KEY } from "@/lib/eligibility/field";
import { listUpdatedSentence, NOT_ON_LIST_MESSAGE } from "@/lib/eligibility/messages";
import { columnFor } from "@/lib/formbuilder/layout";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
/*
 * Not a question — an answer the travel note sets when somebody says
 * the estimate is wrong for them. The "Tell us about your journey" box
 * is shown by a condition on this key, so the box appears only for
 * somebody who asked for it. See scripts/reveal-travel-note.ts.
 */
const EXPLAIN_KEY = "travel_explain";
import { hasRichLink } from "@/lib/formbuilder/rich-text";
import { RichText } from "@/components/forms/RichText";
import { missing, optionsFor, settled, visibleFields, type Answers } from "@/lib/formbuilder/logic";
import { FIELD_STAGES, type BuiltForm, type FieldStage, type FormField } from "@/lib/formbuilder/types";
import { ordinal, RankedChoices, SessionCalendar } from "./SessionCalendar";

/** Above this many options a radio list becomes a page of its own. */
const RADIO_MAX = 6;

const FIELD =
  "mt-2 w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-[14px] text-fg outline-none transition-colors focus-visible:border-brand-500";

export function FormFillView({
  doc, title, submit, mode = "preview", liveHref,
}: {
  doc: BuiltForm;
  title: string;
  mode?: "preview" | "test" | "live";
  /** The public registration page, offered from the staff test view. */
  liveHref?: string;
  /**
   * Actually file it. Absent in preview mode; test and live modes pass
   * different server actions with different trust boundaries.
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

  /*
   * How THIS form looks and speaks, as opposed to what it asks. Every
   * flag is off for a form with no presentation, and every branch that
   * reads one keeps the old markup on its other side: the live v1 form
   * has registrations on it and must not move by a byte.
   */
  const look = doc.presentation;
  const bar = look?.progress === "bar";
  const gateInline = look?.gateInline === true;
  const hideWaitingHint = look?.hideWaitingHint === true;

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
  /* The roster verdict on the address they typed. Only ever set from
     the server, and it stops nobody: not being on a list means the
     lists are behind, so the form says so, offers to tell us, and lets
     them carry on. Cleared whenever the address changes, so correcting
     a typo takes the message away with it. */
  const [gateMissing, setGateMissing] = useState(false);
  const [gateChecking, setGateChecking] = useState(false);
  /** When the lists were last refreshed, so the message can date itself. */
  const [gateUpdatedAt, setGateUpdatedAt] = useState<string | null>(null);
  const [gateTold, setGateTold] = useState(false);
  const [gateTelling, setGateTelling] = useState(false);
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
  const stoppedByNote = visible.find((f) => f.stopsHere);
  /*
   * Refused by the roster ends the form the same way a stopsHere note
   * does — one notion of "this is as far as this goes", so Continue,
   * Submit and the photography terms all disappear together. Folding it
   * in here rather than adding a second ended-state is what stops the
   * form offering Submit to somebody it has just turned away.
   */
  // Only a stopsHere note ends the form now. The roster used to end it
  // too, which put "we have not re-exported the sheet yet" and "you are
  // not in a programme" on the same screen, wearing the same words.
  const stopped = stoppedByNote;

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

  const set = (k: string, v: Answers[string]) => {
    setAnswers({ ...answers, [k]: v });
    setDone(false);
    // Retyping the address is how somebody recovers from a refusal.
    if (k === ELIGIBILITY_EMAIL_KEY) { setGateMissing(false); setGateTold(false); }
  };

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


  /*
   * The button under the message: tell a coordinator, then carry on.
   *
   * Failure is silent on purpose. The registration itself is the record
   * — it lands marked "not on the list" either way — so a network error
   * here must not read as "your message did not get through" and send
   * somebody hunting for another way to reach us.
   */
  const tellUs = async () => {
    const typed = answers[ELIGIBILITY_EMAIL_KEY];
    if (typeof typed !== "string" || !typed.includes("@")) return;
    setGateTelling(true);
    try {
      await fetch("/api/eligibility/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: typed,
          name: String(answers.full_name ?? answers.trainee_name ?? "").trim() || undefined,
        }),
      });
    } catch {
      /* Said nothing, changed nothing — the registration still carries it. */
    } finally {
      setGateTelling(false);
      setGateTold(true);
    }
  };

  const reset = () => {
    setAnswers({}); setTried(false); setDone(false); setSent(false); setRefused([]); setReceipt(undefined);
    setReach(1); setHi(1); setAll(false);
  };

  const answered = asked.filter(answeredAt).length;
  const progress = progressToSubmit({ shown, open, answered: answeredAt, ended });
  const prompt = gapPrompt({ more, gaps, stopped: Boolean(stopped), hideWaitingHint, lastKey: last?.key });

  /*
   * The bar counts only once there is something to count. Before
   * question one is answered it is the only question on screen, and
   * "0 of 1 answered" is a promise the next click breaks by revealing
   * eight more. A form that has ended — a stopping note, a refused
   * address — has no progress left to make.
   */
  const tracking = bar && asked.length > 1 && !stopped;

  /*
   * The line beside Continue. `null` is no line at all, and then nothing
   * points at it either: aria-describedby naming a missing id describes
   * the button as nothing.
   */
  const hint = waiting
    ? hideWaitingHint ? null : "Answer this one to carry on."
    : bar ? null : `${more} more question${more === 1 ? "" : "s"} after this`;

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
        mode={mode}
        onAgain={reset}
      />
    );
  }

  return (
    <div className={`${columnFor(doc)} mt-5 pb-24${look?.theme === "site" ? " bhn-site" : ""}`}>
      {/* Live registrants need the form, not implementation notes. The
          other two modes state their limits once, at the top, where a
          colleague cannot mistake a test for a registration. */}
      {mode !== "live" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600">
          <Eye size={14} className="shrink-0" />
          <span>
            {mode === "test"
              ? "Staff preview. Submitting here files a TEST entry in Admin → Registrants. It does not register a real attendee."
              : "This is a preview. Fill it in as much as you like — nothing is sent and nobody is registered."}
          </span>
          {mode === "test" && liveHref && (
            /* A button, not an underlined word at the end of a
               sentence. This banner is the one place a coordinator is
               told they are looking at a test, so the way out to the
               real thing should look like a way out. */
            <a
              href={liveHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white shadow-md shadow-brand-600/25 transition-all hover:brightness-110"
            >
              Open live form
            </a>
          )}
        </p>
      )}

      {/* Two moments, and the second one is not on this form at all.
          Staff only: this switcher exists so a coordinator can preview
          BOTH moments from the builder. On the live public page it was
          an invitation to answer "Can you still make it?" weeks before
          a place had been approved — and since the server always
          validates against the registration stage, sending from that
          tab could only ever fail, listing questions the registrant
          could not see. Registrants get the registration form, which
          is the only thing this page is for. */}
      {mode !== "live" && doc.fields.some((f) => f.stage === "confirmation") && (
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

      {/* The public page has already printed this title as its <h1>,
          two sizes larger and a paragraph earlier. Repeating it here
          gave the screen two headings saying the same words at two
          different left edges — the first thing the eye caught, and
          the first thing it had to dismiss. The builder's preview has
          no page header above it, so there it stays. */}
      {/* With a progress bar the count goes, and on the live page the
          count was all this header held — so no header at all while the
          bar is still waiting for a second question, rather than an
          empty 20px box above question one. */}
      {(!bar || tracking || mode !== "live") && (
        <header className="mt-5">
          {mode !== "live" && (
            <h2 className="text-[26px] font-bold leading-tight tracking-tight text-fg">{title}</h2>
          )}
          {bar ? (
            tracking && (
              <Progress done={progress.done} total={progress.total} className={mode === "live" ? "" : "mt-2"} />
            )
          ) : (
            <p className={`text-[13.5px] text-muted ${mode === "live" ? "" : "mt-1.5"}`}>
              {asked.length} question{asked.length === 1 ? "" : "s"}
              {answered > 0 && ` · ${answered} answered`}
              {asked.some((f) => f.required) && ` · questions marked * are required`}
            </p>
          )}
        </header>
      )}

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

      {/* presentation.gateInline draws this under the address instead —
          see Question. The submit-time notice below stays up here in
          both: by then the address may be several questions away. */}
      {gateMissing && !gateInline && (
        <GateNotice updatedAt={gateUpdatedAt} told={gateTold} telling={gateTelling} onTell={tellUs} />
      )}

      {stoppedByNote && (
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
            {mode === "test"
              ? "A test submission would be marked clearly in Admin → Registrants."
              : mode === "live"
                ? "The registration will now appear in Admin → Registrants."
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
            gateMissing={gateInline && gateMissing && f.key === ELIGIBILITY_EMAIL_KEY}
            gateUpdatedAt={gateUpdatedAt}
            gateTold={gateTold}
            gateTelling={gateTelling}
            onTell={tellUs}
            // Nothing left to open: the hint names Submit rather than Continue.
            gateRetry={more > 0 ? "continue" : "submit"}
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
          sentence naming the question. Which sentence, and when
          presentation.hideWaitingHint drops it, is gapPrompt's to say. */}
      {prompt !== null && (
        <p role="status" className="mt-4 rounded-lg border border-line bg-elevated/60 p-3 text-[12.5px] leading-relaxed text-muted">
          {prompt}
        </p>
      )}

      {more > 0 && !stopped && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
            disabled={waiting || gateChecking}
            aria-describedby={hint === null ? undefined : "continue-hint"}
            onClick={async () => {
              /*
               * The roster check happens HERE, at the address, rather
               * than at Submit — being told you are not on the list is
               * worth knowing before ranking six sessions, not after.
               *
               * Advisory only: the submit action checks again on the
               * server. If this request fails we open the next question
               * anyway. A registrant must not be stopped by our network.
               */
              const typed = answers[ELIGIBILITY_EMAIL_KEY];
              const asksHere = shown.slice(0, open).some((f) => f.key === ELIGIBILITY_EMAIL_KEY);
              // Not re-checked once the message is up: it has been said,
              // and pressing Continue again is somebody carrying on,
              // which is the whole point of not refusing them.
              if (mode === "live" && asksHere && !gateMissing && typeof typed === "string" && typed.includes("@")) {
                setGateChecking(true);
                try {
                  const res = await fetch("/api/eligibility/check", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: typed }),
                  });
                  if (res.ok) {
                    const j = await res.json() as { blocked?: boolean; listUpdatedAt?: string | null };
                    if (j.blocked) {
                      setGateUpdatedAt(j.listUpdatedAt ?? null);
                      setGateMissing(true);
                      setGateChecking(false);
                      return;
                    }
                  }
                } catch {
                  /* Network trouble is not a verdict — carry on. */
                } finally {
                  setGateChecking(false);
                }
              }
              setReach(open + 1);
            }}
          >
            {gateChecking ? "Checking…" : "Continue"}
          </button>
          {hint !== null && (
            <span id="continue-hint" className="text-[12px] text-subtle">
              {hint}
            </span>
          )}
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
          {look?.richText ? <RichText text={doc.submitNote} /> : <Linked text={doc.submitNote} />}
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
              if (r.ok) { setSent(true); setDone(true); setReceipt(r.receipt); }
              // Whatever the server refuses now, it is not the roster:
              // an address on no list is recorded and let through, so
              // anything arriving here is a problem with the answers and
              // belongs in the box above the form.
              else setRefused(r.problems ?? ["It was not accepted."]);
            }}
          >
            {sending
              ? "Submitting…"
              : sent
                ? "Submitted"
                : stage === "registration"
                  ? mode === "test" ? "Submit test registration" : "Submit registration"
                  : mode === "test" ? "Submit test answer" : "Send my answer"}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-elevated"
            onClick={reset}
          >
            <RotateCcw size={13} /> Start again
          </button>
          <span className="text-[12px] text-subtle">
            {mode === "test"
              ? "Creates a test record only."
              : mode === "live"
                ? "Checked here and again on the server."
                : "Checked for real. Sent nowhere."}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One question, as the form draws it.
 *
 * Exported because a static render of the whole form only ever sees its
 * first paint, and the things a presentation moves — the refusal under
 * the address, the note under a ranking — only exist after somebody has
 * typed or clicked.
 */
export function Question({
  doc, field: f, index, answers, set, flagged, gateMissing = false, gateRetry = "continue",
  gateUpdatedAt = null, gateTold = false, gateTelling = false, onTell,
}: {
  doc: BuiltForm; field: FormField; index: number;
  answers: Answers; set: (k: string, v: Answers[string]) => void; flagged: boolean;
  /** The address is on no list, said here rather than above the form (presentation.gateInline). */
  gateMissing?: boolean;
  /** What to press once the address is corrected: Continue, or Submit when nothing is left to open. */
  gateRetry?: "continue" | "submit";
  /** When the lists were last refreshed, for the message's own sentence. */
  gateUpdatedAt?: string | null;
  gateTold?: boolean;
  gateTelling?: boolean;
  /** Tell a coordinator about this address. Absent in a static render. */
  onTell?: () => void;
}) {
  const opts = optionsFor(doc, f);
  const rich = doc.presentation?.richText === true;
  const arr = Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : [];
  const clashing = (f.slots.length > 0 || (f.cannotCombine?.length ?? 0) > 0)
    ? chosenConflicts(f.slots, arr, f.cannotCombine ?? [])
    : [];
  const none = Boolean(f.noneLabel) && answers[f.key] === f.noneLabel;
  // Answering, plus opening whatever that answer promised to go and do
  // (f.openOnSelect) — in the click itself, or the pop-up blocker eats it.
  const choose = (v: string) => {
    const url = answers[f.key] !== v ? f.openOnSelect?.[v] : undefined;
    set(f.key, v);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

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
            {rich ? <RichText text={f.help} gap="mt-1.5" /> : <Linked text={f.help} />}
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
          {f.help && (
            <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
              {rich ? <RichText text={f.help} gap="mt-1.5" /> : f.help}
            </span>
          )}
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
            {f.help && (
              <span className="mt-1.5 block text-[12.5px] leading-relaxed text-muted">
                {rich ? <RichText text={f.help} gap="mt-1.5" /> : f.help}
              </span>
            )}
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
                onChange={() => choose(o)}
              />
              <span className={`text-[13.5px] leading-snug ${answers[f.key] === o ? "font-semibold text-fg" : "text-muted"}`}>{o}</span>
            </label>
          ))}
        </div>
      ) : f.type === "choice" || f.type === "lookup" ? (
        <select className={FIELD} value={String(answers[f.key] ?? "")} onChange={(e) => choose(e.target.value)}>
          <option value="">Choose…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "multi" && f.slots.length > 0 ? (
        <>
          <SessionCalendar field={f} chosen={arr} onToggle={pickMulti} hideHint={doc.presentation?.hideCalendarHint} />
          <RankedChoices
            chosen={arr}
            slots={f.slots}
            label="Your ranking"
            note={
              atCap
                ? `That is all ${cap}. To change your mind, click one again to take it back.`
                : arr.length === 1
                  ? `Pick another and it becomes your 2nd choice.${cap ? ` You can choose ${cap - arr.length} more.` : ""}`
                  : doc.presentation?.hideRankNote
                    // How rooms are filled is the question's to say; what
                    // is left of a cap is still news.
                    ? cap ? `You can choose ${cap - arr.length} more.` : undefined
                    : `This is the order we go by when a room is oversubscribed.${cap ? ` You can choose ${cap - arr.length} more.` : ""}`
            }
          />
          {/* With no cap on how many may be chosen, this is the ONLY
              thing standing between somebody and a day they cannot
              physically attend. It names the pairs rather than counting
              them: "2 pairs clash" leaves the reader to work out which,
              on a calendar they have just been scrolling. */}
          {clashing.length > 0 && (
            <div role="status" className="mt-2 rounded-lg border-2 border-red-500/60 bg-red-500/10 p-3">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-red-600">
                <AlertTriangle size={14} className="shrink-0" />
                {clashing.length === 1
                  ? "Two of your choices cannot both be attended"
                  : `${clashing.length} pairs of your choices cannot both be attended`}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {clashing.map((c) => (
                  <li key={`${c.a}|${c.b}`} className="text-[12px] leading-snug text-red-600">
                    {sessionParts(c.a).name} <span className="opacity-70">and</span> {sessionParts(c.b).name}
                    {/* A declared pair says WHY. A bare time overlap does
                        not need to — the calendar above already shows it. */}
                    {c.reason
                      ? <span className="opacity-80"> — {c.reason}</span>
                      : <span className="opacity-70"> — same time</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] leading-relaxed text-red-600">
                Leaving both ticked tells us either one suits you. Only{" "}
                {f.approveFromClash ?? 1} of a clashing pair can be approved, so you will not get both.
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
            maxLength={f.key === "postcode" ? 3 : undefined}
            autoCapitalize={f.key === "postcode" ? "characters" : undefined}
            aria-describedby={gateMissing ? GATE_REFUSAL_ID : undefined}
            value={none ? "" : String(answers[f.key] ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
          />
          <NoneOption field={f} answers={answers} set={set} />
          {f.key === "postcode" && <TravelNote value={String(answers[f.key] ?? "")} answers={answers} set={set} />}
        </>
      )}

      {/* Under the address it is about, inside this question's own block
          rather than as a row of the list — a sibling there would draw a
          divider and read as a question of its own. */}
      {gateMissing && (
        <GateNotice
          id={GATE_REFUSAL_ID} className="mt-3" retry={gateRetry}
          updatedAt={gateUpdatedAt} told={gateTold} telling={gateTelling} onTell={onTell}
        />
      )}
    </div>
  );
}

/**
 * What that postal code means for travel support, while they type.
 *
 * Travel support is for a one-way journey of more than two hours, and
 * the form asks people to judge that themselves — so the follow-up list
 * has carried registrants with downtown Toronto postal codes, who were
 * never going to be approved and found out weeks later.
 *
 * It says what it thinks and then gets out of the way: nothing is
 * blocked, no answer is changed, and the wording invites the person to
 * say the table is wrong about their morning, because for a ninety
 * minute journey with a transfer that runs twice an hour, it is.
 */
function TravelNote({
  value, answers, set,
}: { value: string; answers: Answers; set: (k: string, v: Answers[string]) => void }) {
  const e = travelFromPostcode(value);
  if (!e) return null;
  const asked = answers[EXPLAIN_KEY] === "Yes";

  const tone =
    e.band === "far" ? "border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-800"
    : e.band === "borderline" ? "border-amber-500/40 bg-amber-500/[0.07] text-amber-800"
    : "border-line bg-elevated/60 text-muted";

  /* Says it is longer than that — which opens the box. Amber, because
     it is the one thing here that changes what happens next. */
  const longer = (
    <button
      type="button"
      onClick={() => set(EXPLAIN_KEY, "Yes")}
      className="rounded-md border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-[12px] font-semibold text-amber-800 hover:bg-amber-500/20"
    >
      My journey is longer than that
    </button>
  );

  return (
    <div role="status" className={`mt-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed ${tone}`}>
      <p>
        <strong className="font-semibold">{e.place}</strong> — {travelWords(e)} to 144 College Street, one way.{" "}
        {e.band === "far"
          /*
           * What the postal code says, and nothing else.
           *
           * It used to read "your journey qualifies… what we can
           * cover", which is a promise made by a lookup table. Whether
           * support is offered is decided by people, later, so this
           * says only what has been checked so far.
           */
          ? "Based on your postal code that is more than two hours. Carry on with the rest of your registration — we will be in touch about travel support."
          : e.band === "borderline"
          ? "That is close to the two-hour line, so somebody will look at it rather than the estimate deciding."
          : "Based on your postal code we would not be able to provide travel support, which is only for journeys of more than two hours each way."}
      </p>

      {e.band !== "far" && !asked && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {longer}
          {e.band === "local" && (
            /*
             * The Yes/No question is above this note, already answered,
             * and somebody who reads "we would not be able to provide
             * support" has no obvious way back to it — so the way back
             * is here, saying what it does.
             */
            <button
              type="button"
              onClick={() => { set("travel_over_2h", "No"); set("postcode", ""); set(EXPLAIN_KEY, ""); }}
              className="rounded-md border border-line bg-card px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated"
            >
              That is right — change my answer to No
            </button>
          )}
        </div>
      )}

      {asked && (
        <p className="mt-2 text-[12px]">
          Tell us about it in the next box — where you would be starting from, and the first service that gets you here.
        </p>
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

/** What the address field names as its description while it is refused. */
const GATE_REFUSAL_ID = "eligibility-refusal";

/**
 * "We can't find that address" — one box, wherever it is drawn.
 *
 * Above the questions on every form that has not said otherwise; under
 * the address on one with presentation.gateInline, because a message
 * about what you typed reads as being about something else when it sits
 * a screen above where you typed it. "The address above" is true in
 * both places.
 *
 * It refuses nobody. The lists are exported by hand and are always a
 * little behind, so a missing address is a fact about our filing, not
 * about the person reading it: the box dates the lists, offers to tell
 * a coordinator, and gets out of the way.
 */
function GateNotice({
  id, className = "mt-4", retry = "continue",
  updatedAt = null, told = false, telling = false, onTell,
}: {
  id?: string; className?: string; retry?: "continue" | "submit";
  updatedAt?: string | null; told?: boolean; telling?: boolean; onTell?: () => void;
}) {
  const dated = listUpdatedSentence(updatedAt);
  return (
    <div id={id} role="alert" className={`${className} rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-4`}>
      <p className="flex items-center gap-2 text-[13.5px] font-bold text-amber-600">
        <AlertTriangle size={15} /> We can&apos;t find that address on our lists
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-amber-700">{NOT_ON_LIST_MESSAGE}</p>
      {dated && <p className="mt-1.5 text-[13px] leading-relaxed text-amber-700">{dated}</p>}
      {told ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
          <Check size={14} /> Thank you — the team has been told. Carry on and finish registering.
        </p>
      ) : (
        onTell && (
          <button
            type="button"
            onClick={onTell}
            disabled={telling}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {telling ? "Telling them…" : "Tell us, and carry on"}
          </button>
        )
      )}
      <p className="mt-2 text-[12.5px] text-amber-700">
        {retry === "submit"
          // After "Show all" there is no Continue on screen.
          ? "If you typed it wrong, correct the address above and submit again."
          : "If you typed it wrong, correct the address above and press Continue again."}
      </p>
    </div>
  );
}

/**
 * The line under a form with nothing left to open and something left to
 * answer — `null` for no line.
 *
 * With presentation.hideWaitingHint the one-gap sentence goes only when
 * that question is the last one open, starred directly above where the
 * line would sit (question one on first paint). Anywhere else it is the
 * one thing saying why there is no Submit: a required follow-up that
 * opened mid-form ("Other — please describe"), or a question skipped
 * after "Show all". Without it the page just ends.
 *
 * Exported so those states can be tested; a static render only ever
 * reaches first paint.
 */
export function gapPrompt({
  more, gaps, stopped, hideWaitingHint, lastKey,
}: {
  more: number; gaps: FormField[]; stopped: boolean; hideWaitingHint: boolean;
  /** The deepest open field — shown[open - 1]. */
  lastKey: string | undefined;
}): string | null {
  if (more > 0 || gaps.length === 0 || stopped) return null;
  if (hideWaitingHint && gaps.length === 1 && gaps[0].key === lastKey) return null;
  return gaps.length === 1
    ? `Answer “${gaps[0].label}” to carry on.`
    : `${gaps.length} questions still need an answer.`;
}

/**
 * How far from Submit, in questions — for presentation.progress "bar".
 *
 * A question is done when it has an answer, or when it is optional and
 * the registrant is already past it: something below it is open, or
 * nothing is left to open. A travel question left blank is a decision,
 * not a debt. Counting it as owed put the bar at 50–75% beside "Submit
 * registration".
 *
 * Full exactly when the form can be submitted, and never before: an
 * answered question can sit below a branch that opened above it, and a
 * full bar over a Continue button would be the bar lying the other way.
 */
export function progressToSubmit({
  shown, open, answered, ended,
}: {
  shown: FormField[]; open: number; answered: (f: FormField) => boolean;
  /** Nothing to open, nothing required left: Submit is on screen. */
  ended: boolean;
}): { done: number; total: number } {
  const asked = shown.filter((f) => f.type !== "note");
  if (ended) return { done: asked.length, total: asked.length };
  const everythingOpen = open >= shown.length;
  const done = asked.filter(
    (f) => answered(f) || (!f.required && (everythingOpen || shown.indexOf(f) < open - 1)),
  ).length;
  return { done: Math.min(done, Math.max(0, asked.length - 1)), total: asked.length };
}


/**
 * How far through, drawn — for a form with presentation.progress "bar".
 *
 * Counted by progressToSubmit over the questions on screen now, so the
 * total moves when a branch opens (a Yes to travel adds the postcode):
 * "3 of 10 done" after "3 of 9" is true. Full means Submit is there, and
 * the label says so rather than "10 of 10". Clamped anyway: a bar past
 * its end or NaN in the label is the kind of wrong nobody forgives a
 * progress bar.
 *
 * Exported for the same reason as gapPrompt: the full bar is never on a
 * first paint.
 */
export function Progress({ done: counted, total, className = "" }: { done: number; total: number; className?: string }) {
  const of = Math.max(1, total);
  const done = Math.min(of, Math.max(0, counted));
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span id="form-progress" className="shrink-0 text-[12.5px] tabular-nums text-muted">
        {done === of ? "Ready to submit" : `${done} of ${of} done`}
      </span>
      <div
        role="progressbar"
        aria-labelledby="form-progress"
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={done}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated"
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${Math.round((done / of) * 100)}%` }}
        />
      </div>
    </div>
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
export function Confirmation({
  title, answers, doc, receipt, mode, onAgain,
}: {
  title: string;
  answers: Answers;
  doc: BuiltForm;
  receipt: Receipt | undefined;
  mode: "preview" | "test" | "live";
  /**
   * Staff only. A registrant does not get one — see the note on the
   * reset button at the bottom of this component.
   */
  onAgain?: () => void;
}) {
  const ranked = rankedSessions(doc, answers);
  const field = sessionField(doc);
  /*
   * The red survives, so the reason has to survive with it.
   *
   * There is no cap on this form, so a registrant can submit a pair
   * that cannot both be attended — the picker warns and does not
   * refuse. The read-only calendar still tints that pair red, and the
   * panel that explained it went with the form, leaving two red blocks
   * on a receipt with nothing anywhere saying why. Same function the
   * picker calls, never a second derivation of the same rule.
   */
  const conflicts = field
    ? chosenConflicts(field.slots, ranked, field.cannotCombine ?? [])
    : [];
  // Positions, not names: the list beside this line already carries the
  // names, and "your 1st and 2nd" is the shorter way to say it.
  const ordinalOf = (option: string) => {
    const at = ranked.indexOf(option);
    return at < 0 ? option : `your ${ordinal(at + 1)}`;
  };
  const line = receiptLine(receipt);
  const shown = receipt && "preview" in receipt ? receipt.preview : null;
  // Anything other than a plain "sent" is something a coordinator needs
  // to see, not something to bury under a tick.
  const wrong = receipt && receipt.state !== "sent" && receipt.state !== "sent-to-you";
  const test = mode === "test";

  /*
   * The things the form said that outlive the form.
   *
   * Submitting deletes the questions, and takes the notes with them —
   * including the one that says the Symposium is a separate
   * registration and gives the address for it, shown to exactly the
   * people who answered "not yet, I plan to". The link was being
   * withdrawn at the moment they were finally free to act on it.
   *
   * The rule is general rather than "if the key is symposium_link_note":
   * a note that was on screen when they submitted AND has somewhere to
   * go is a thing still to do. Its condition comes from the document,
   * so changing who sees it is one edit in the builder and both places
   * move together.
   */
  const look = doc.presentation;
  // A labelled link is still somewhere to go. `hasLink` alone reads the
  // markup of "[Luma](https://…)" rather than the link it makes.
  const rich = look?.richText === true;
  const carried = visibleFields(doc, answers).filter(
    (f) => f.type === "note" && f.help !== undefined && (rich ? hasRichLink(f.help) : hasLink(f.help)),
  );

  return (
    <div className={`${columnFor(doc)} mt-5 pb-16${look?.theme === "site" ? " bhn-site" : ""}`}>
      {/*
        ONE TEXT COLUMN.
        The tick hangs in the margin and everything else — the sentence,
        the timeline, the receipt line — starts on the same left edge.
        It used to be a stack of icon-and-text rows with three icon
        sizes, two gaps and two alignment strategies between them, which
        gave one small card four different left edges.
      */}
      <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/[0.06] p-4 sm:p-6">
        {/* items-start, not items-center: at 375px this sentence wraps
            to two lines, and centring the tick against a two-line block
            dropped it twelve pixels below the first line's cap. The 3px
            is the optical nudge for 20px/leading-tight. Only the
            heading carries the icon — everything under it starts on the
            card's own left edge, the same edge every other card on this
            screen starts on. */}
        <p className="flex items-start gap-2.5 text-[20px] font-bold leading-tight tracking-tight text-fg">
          <Check size={20} className="mt-[3px] shrink-0 text-emerald-600" />
          <span className="min-w-0">
            {test ? "Test registration filed." : "That is your registration in."}
          </span>
        </p>
        <div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {test
              ? "This did not register a real attendee. The row is marked as a test in Admin → Registrants and can be deleted there."
              : `Thank you for registering for ${title}. You do not need to do anything else.`}
          </p>

          {!test && (
            <div className="mt-4 rounded-xl border border-line bg-card p-4">
              <p className="text-[13px] leading-relaxed text-fg">
                {look?.confirmationNote ? (
                  // The form's own timeline. An intro that promises offers in
                  // the last week of September and "two to three weeks" one
                  // screen later cannot both be true.
                  <RichText text={look.confirmationNote} />
                ) : (
                  <>
                    <strong>We will come back to you within two to three weeks.</strong> Places are limited
                    and every registration is reviewed together rather than as it arrives, so it takes that
                    long. We will write to you either way — whether or not we can offer you a place. If you
                    have not heard after three weeks, reply to the email and we will chase it.
                  </>
                )}
              </p>
            </div>
          )}

          {line && (
            <p className={`mt-4 text-[13px] leading-relaxed ${wrong ? "text-amber-600" : "text-muted"}`}>
              {/* An icon only where it means something. On the ordinary
                  path the line is good news and needs no marker; a
                  letter that did not go out is the one case worth
                  flagging. */}
              {wrong && <AlertTriangle size={14} className="mr-1.5 inline-block shrink-0 align-[-2px]" />}
              {line}
            </p>
          )}
        </div>
      </div>

      {/*
        WHAT YOU ASKED FOR, IN THE PICTURE YOU ASKED FOR IT IN.

        The same calendar, the same rank badges, the same ranking box —
        the components the picker uses, not a second drawing of the same
        facts. It used to become a plain grey list one screen after a
        brand-tinted, time-scaled week, with the day dropped, so a
        registrant had to take on trust that the thing they were reading
        was the thing they had chosen.

        The week is drawn only where it fits. Below @xl it stacks to
        three full screens on a phone — right for choosing, far too long
        for a receipt — and the ranking box says the same thing in three
        lines. A container query rather than a viewport one: this column
        is 760px on the public page and narrower inside the builder.
      */}
      {ranked.length > 0 && (
        <section className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
            What you asked for
          </p>
          {field && (
            <SessionCalendar
              readOnly
              field={field}
              chosen={ranked}
              caption="The days you chose something on, drawn as you saw them. Anything faded is a session you did not pick."
            />
          )}
          <RankedChoices
            chosen={ranked}
            slots={field?.slots}
            label="Your ranking"
            note={
              conflicts.length > 0 ? (
                <>
                  {!look?.hideRankNote && "This is the order we go by when a room is oversubscribed. "}
                  <span className="font-semibold text-red-600">
                    {conflicts.length === 1
                      ? "Two of these cannot both be attended"
                      : `${conflicts.length} pairs of these cannot both be attended`}
                    {" — "}
                    {conflicts
                      .map((c) =>
                        // Named in the order they were ranked: "your 1st
                        // and your 2nd", never "your 2nd and your 1st".
                        [c.a, c.b]
                          .sort((x, y) => ranked.indexOf(x) - ranked.indexOf(y))
                          .map(ordinalOf)
                          .join(" and "),
                      )
                      .join(", ")}
                    . There is nothing for you to do; we will come back to you about it.
                  </span>
                </>
              ) : look?.hideRankNote ? undefined : (
                "This is the order we go by when a room is oversubscribed."
              )
            }
          />
        </section>
      )}

      {carried.map((f) => (
        <section key={f.id} className="mt-5 rounded-2xl border-2 border-line-strong bg-card p-4 sm:p-6">
          <p className="text-[14px] font-semibold leading-snug text-fg">{f.label}</p>
          {f.help && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {rich ? <RichText text={f.help} gap="mt-1.5" /> : <Linked text={f.help} />}
            </p>
          )}
        </section>
      ))}

      {/* Shown when the letter did not go out, so a coordinator can see
          exactly what a registrant would have received rather than
          guessing at it. */}
      {shown && wrong && (
        <details className="mt-5 rounded-2xl border-2 border-line-strong bg-elevated/40 p-4 sm:p-6">
          <summary className="cursor-pointer text-[13px] font-semibold text-fg">
            The letter that would have gone to {shown.to}
          </summary>
          <p className="mt-2 text-[13px] font-semibold text-fg">{shown.subject}</p>
          <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-muted">
            {shown.body}
          </pre>
        </details>
      )}

      {/*
        STAFF ONLY, AND DELIBERATELY SO.

        This clears the answers and puts the form back. For a coordinator
        testing the branches that is the whole point, and it beats a
        reload, which would throw away the unsaved builder edits the
        preview is kept mounted to protect.

        For a registrant it was the exact thing this screen exists to
        prevent — see the note above `if (sent)`. Worse than confusing:
        submitting again really does file a second registration. There is
        no idempotency on the public route, so a second pass writes a
        second submission, sends a second acknowledgement and books a
        second set of pending seats, and the only thing that eventually
        stops it is the anti-bot limiter, whose refusal reads as an
        accusation. Nothing replaces it — the screen ends on what they
        asked for, which is the right last thing for a finished
        transaction.
      */}
      {test && onAgain && (
        <button
          type="button"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-elevated"
          onClick={onAgain}
        >
          <RotateCcw size={13} /> Run another test
        </button>
      )}
    </div>
  );
}
