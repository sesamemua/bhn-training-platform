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
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Eye, RotateCcw } from "lucide-react";
import { chosenClashes } from "@/lib/formbuilder/calendar";
import { missing, optionsFor, visibleFields, type Answers } from "@/lib/formbuilder/logic";
import { FIELD_STAGES, type BuiltForm, type FieldStage, type FormField } from "@/lib/formbuilder/types";
import { SessionCalendar } from "./SessionCalendar";

const FIELD =
  "mt-2 w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-[14px] text-fg outline-none transition-colors focus-visible:border-brand-500";

export function FormFillView({ doc, title }: { doc: BuiltForm; title: string }) {
  const [stage, setStage] = useState<FieldStage>("registration");
  const [answers, setAnswers] = useState<Answers>({});
  // Only after Submit. A form that scolds you about question 14 while
  // you are still on question 2 is a form that is wrong about you.
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);

  const shown = useMemo(() => visibleFields(doc, answers, stage), [doc, answers, stage]);
  // Notes are not questions, so they are not counted as any.
  const asked = shown.filter((f) => f.type !== "note");
  const gaps = useMemo(() => missing(doc, answers, stage), [doc, answers, stage]);
  const gapKeys = useMemo(() => new Set(gaps.map((f) => f.key)), [gaps]);

  const set = (k: string, v: Answers[string]) => { setAnswers({ ...answers, [k]: v }); setDone(false); };
  const reset = () => { setAnswers({}); setTried(false); setDone(false); };

  const answered = asked.filter((f) => {
    const v = answers[f.key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
  }).length;

  return (
    <div className="mx-auto mt-5 max-w-[760px] pb-24">
      {/* Said once, at the top, where it cannot be missed. */}
      <p className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600">
        <Eye size={14} className="shrink-0" />
        This is a preview. Fill it in as much as you like — nothing is sent and nobody is registered.
      </p>

      {/* Two moments, and the second one is not on this form at all. */}
      {doc.fields.some((f) => f.stage === "confirmation") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FIELD_STAGES.map((st) => (
            <button
              key={st}
              onClick={() => { setStage(st); setTried(false); setDone(false); }}
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

      {done && (
        <div role="status" className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-600">
            <Check size={14} /> Complete — every required question has an answer.
          </p>
          <p className="mt-1 text-[12.5px] text-emerald-600">
            A real submission would go to the coordinator from here. This one went nowhere.
          </p>
        </div>
      )}

      <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border-2 border-line-strong bg-card">
        {shown.map((f) => (
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

      {shown.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-brand px-6 py-3 text-[14px] font-bold text-white transition-all hover:brightness-110"
            onClick={() => { setTried(true); setDone(gaps.length === 0); }}
          >
            {stage === "registration" ? "Submit registration" : "Send my answer"}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-muted hover:bg-elevated"
            onClick={reset}
          >
            <RotateCcw size={13} /> Start again
          </button>
          <span className="text-[12px] text-subtle">Checked for real. Sent nowhere.</span>
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

  /*
   * A note is a thing the form SAYS. No number, no asterisk, no input —
   * numbering it would make somebody look for the box to fill in.
   */
  if (f.type === "note") {
    return (
      <div className="bg-elevated/40 px-6 py-4">
        <p className="text-[14px] font-semibold leading-snug text-fg">{f.label}</p>
        {f.help && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{f.help}</p>}
      </div>
    );
  }

  return (
    <div className={`px-6 py-5 ${flagged ? "bg-red-500/[0.04]" : ""}`}>
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
      ) : f.type === "choice" || f.type === "lookup" ? (
        <select className={FIELD} value={String(answers[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">Choose…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "multi" && f.slots.length > 0 ? (
        <>
          <SessionCalendar
            field={f}
            chosen={arr}
            onToggle={(o) => set(f.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}
          />
          {clashing.length > 0 && (
            <p className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5 text-[12.5px] leading-relaxed text-amber-600">
              {clashing.length === 1 ? "Two of your choices run" : `${clashing.length} pairs of your choices run`}{" "}
              at the same time. You can leave both ticked — it tells us your second preference —
              but only {f.approveFromClash ?? 1} of a clashing pair can be approved.
            </p>
          )}
        </>
      ) : f.type === "multi" ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {opts.map((o) => {
            const on = arr.includes(o);
            return (
              <button
                key={o}
                onClick={() => set(f.key, on ? arr.filter((x) => x !== o) : [...arr, o])}
                aria-pressed={on}
                className={`rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                  on ? "border-brand-500 bg-brand-500/12 font-semibold text-fg" : "border-line text-muted hover:bg-elevated"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : f.type === "long_text" ? (
        <textarea rows={4} className={FIELD} value={String(answers[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
      ) : (
        <input
          className={FIELD}
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
          value={String(answers[f.key] ?? "")}
          onChange={(e) => set(f.key, e.target.value)}
        />
      )}
    </div>
  );
}
