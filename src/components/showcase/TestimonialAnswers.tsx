"use client";

/**
 * A testimonial link's questions: which programme(s) they are part of, then
 * the guide questions — answer any of them, each by typing (about a
 * minute's worth of words) or by recording up to a minute, with as many
 * takes as they like.
 */
import { Keyboard, Mic } from "lucide-react";
import { MAX_AUDIO_SECONDS, MAX_TEXT_WORDS, wordCount } from "@/lib/showcase/testimonial";
import { VoiceTakes, type Take } from "./VoiceTakes";

export interface Draft { mode: "type" | "record"; text: string; take: Take | null }
export interface TestimonialValue { programs: string[]; drafts: Record<string, Draft> }

/** The questions that have an answer ready to send. */
export const answered = (v: TestimonialValue) =>
  Object.entries(v.drafts).filter(([, d]) => (d.mode === "type" ? d.text.trim().length > 0 : !!d.take));

export function TestimonialAnswers({ questions, programChoices, value, onChange, disabled, labelClass }: {
  questions: string[];
  programChoices: string[];
  value: TestimonialValue;
  onChange: (v: TestimonialValue) => void;
  disabled?: boolean;
  labelClass: string;
}) {
  const setDraft = (q: string, d: Draft | null) => {
    const drafts = { ...value.drafts };
    if (d) drafts[q] = d; else delete drafts[q];
    onChange({ ...value, drafts });
  };
  const count = answered(value).length;

  return (
    <div className="space-y-5">
      {programChoices.length > 0 && (
        <fieldset>
          <legend className={labelClass}>Which programme are you part of?</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {programChoices.map((p) => {
              const on = value.programs.includes(p);
              return (
                <label key={p} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-[#0e7da3] bg-[#0e7da3]/10 text-[#111827]" : "border-[#cbd5e1] text-[#475569]"}`}>
                  <input
                    id={`program-${p}`}
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, programs: e.target.checked ? [...value.programs, p] : value.programs.filter((x) => x !== p) })}
                    className="accent-[#0e7da3]"
                  />
                  {p}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-[11.5px] text-[#475569]">Pick all that apply.</p>
        </fieldset>
      )}

      <fieldset>
        <legend className={labelClass}>Your story</legend>
        <p className="mb-2 text-[13px] leading-relaxed text-[#1f2937]">
          Answer as many of these as you like — type your answer, or record it (up to a minute each). Record as many takes as you need and keep the one you like.
        </p>
        <ol className="space-y-3">
          {questions.map((q, i) => {
            const d = value.drafts[q];
            const words = d ? wordCount(d.text) : 0;
            return (
              <li key={q} className={`rounded-xl border p-3 ${d ? "border-[#0e7da3]/50 bg-white" : "border-[#e2e8f0] bg-[#f8fafc]"}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-[#111827]">{i + 1}. {q}</p>
                  {d ? (
                    <button type="button" onClick={() => setDraft(q, null)} disabled={disabled} className="text-[12px] font-semibold text-[#64748b] hover:text-[#be123c]">Skip this one</button>
                  ) : (
                    <span className="flex gap-1.5">
                      <button type="button" disabled={disabled} onClick={() => setDraft(q, { mode: "type", text: "", take: null })} className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[12px] font-semibold text-[#1f2937] hover:border-[#0e7da3]">
                        <Keyboard size={13} /> Type
                      </button>
                      <button type="button" disabled={disabled} onClick={() => setDraft(q, { mode: "record", text: "", take: null })} className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[12px] font-semibold text-[#1f2937] hover:border-[#0e7da3]">
                        <Mic size={13} /> Record
                      </button>
                    </span>
                  )}
                </div>
                {d?.mode === "type" && (
                  <div className="mt-2">
                    <textarea
                      id={`answer-${i}`}
                      aria-label={q}
                      value={d.text}
                      rows={4}
                      disabled={disabled}
                      onChange={(e) => setDraft(q, { ...d, text: e.target.value })}
                      className="w-full rounded-lg border border-[#cbd5e1] bg-white px-3 py-2 text-[14px] leading-relaxed text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#0b6f90]"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11.5px]">
                      <span className={words > MAX_TEXT_WORDS ? "font-semibold text-[#881337]" : "text-[#475569]"}>{words} of {MAX_TEXT_WORDS} words (about a minute)</span>
                      <button type="button" onClick={() => setDraft(q, { mode: "record", text: "", take: null })} className="font-semibold text-[#0e7da3] hover:underline">Record instead</button>
                    </div>
                  </div>
                )}
                {d?.mode === "record" && (
                  <div className="mt-2">
                    <VoiceTakes maxSeconds={MAX_AUDIO_SECONDS} disabled={disabled} onChosen={(take) => setDraft(q, { ...d, take })} />
                    <button type="button" onClick={() => setDraft(q, { mode: "type", text: "", take: null })} className="mt-1 text-[11.5px] font-semibold text-[#0e7da3] hover:underline">Type instead</button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-1.5 text-[11.5px] text-[#475569]" aria-live="polite">{count === 0 ? "Answer at least one." : `${count} answered.`}</p>
      </fieldset>
    </div>
  );
}
