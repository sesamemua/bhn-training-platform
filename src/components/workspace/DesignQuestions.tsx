"use client";

/**
 * Questions put to the team about an artwork — "who gets a tag?",
 * "brass or white metal?". Each can offer choices to pick from, takes a
 * note, and shows what everybody has said. Anyone on staff can add,
 * reword or delete a question; everyone answers for themselves.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { addDesignQuestion, answerDesignQuestion, deleteDesignQuestion, updateDesignQuestion } from "@/lib/design-review/actions";
import { optionsFromText } from "@/lib/design-review/types";

export interface QuestionRow {
  id: string; text: string; options: string[]; createdByName: string;
  answers: { userId: string; userName: string; choice: string | null; text: string }[];
}

const field = "w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-brand-400 focus:outline-none";
const ghost = "inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";
const primary = "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50";

function QuestionFields({ idp, value, onChange }: { idp: string; value: { text: string; options: string }; onChange: (v: { text: string; options: string }) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[12px] font-semibold text-muted" htmlFor={`${idp}-text`}>Question
        <input id={`${idp}-text`} value={value.text} maxLength={300} onChange={(e) => onChange({ ...value, text: e.target.value })} className={`mt-1 ${field}`} />
      </label>
      <label className="text-[12px] font-semibold text-muted" htmlFor={`${idp}-options`}>Choices, separated by commas (leave empty for a written answer)
        <input id={`${idp}-options`} value={value.options} onChange={(e) => onChange({ ...value, options: e.target.value })} className={`mt-1 ${field}`} />
      </label>
    </div>
  );
}

export function DesignQuestions({ artworkId, questions, meId }: { artworkId: string; questions: QuestionRow[]; meId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ text: "", options: "" });
  const [editing, setEditing] = useState<{ id: string; text: string; options: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: "That didn't save — try again." }));
    if (!r.ok) { setError(r.error ?? "That didn't save — try again."); return; }
    after?.();
    router.refresh();
  });

  return (
    <section className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[13px] font-bold text-fg"><HelpCircle size={14} /> Questions for the team{questions.length ? ` · ${questions.length}` : ""}</h3>
        {pending && <Loader2 size={12} className="animate-spin text-muted" />}
        {!adding && <button type="button" onClick={() => setAdding(true)} className={`ml-auto ${ghost}`}><Plus size={12} /> Add a question</button>}
      </div>
      {error && <p role="alert" className="mt-1 text-[12.5px] font-semibold text-rose-600">{error}</p>}

      {adding && (
        <div className="mt-2 rounded-lg border border-dashed border-line p-2.5">
          <QuestionFields idp="new-question" value={draft} onChange={setDraft} />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pending || !draft.text.trim()} onClick={() => run(() => addDesignQuestion(artworkId, { text: draft.text, options: optionsFromText(draft.options) }), () => { setDraft({ text: "", options: "" }); setAdding(false); })} className={primary}>Add question</button>
            <button type="button" onClick={() => setAdding(false)} className={ghost}>Cancel</button>
          </div>
        </div>
      )}

      {questions.length === 0 && !adding ? (
        <p className="mt-1.5 text-[12.5px] italic text-subtle">Nothing asked yet. Add a question when a decision needs the team.</p>
      ) : (
        <ol className="mt-2 grid gap-2 lg:grid-cols-2">
          {questions.map((q, i) => {
            const mine = q.answers.find((a) => a.userId === meId);
            const note = notes[q.id] ?? mine?.text ?? "";
            const answer = (choice: string | null, text: string) => run(() => answerDesignQuestion(q.id, { choice, text }));
            return (
              <li key={q.id} className="rounded-lg border border-line p-2.5">
                {editing?.id === q.id ? (
                  <>
                    <QuestionFields idp={`edit-${q.id}`} value={editing} onChange={(v) => setEditing({ id: q.id, ...v })} />
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={pending || !editing.text.trim()} onClick={() => run(() => updateDesignQuestion(q.id, { text: editing.text, options: optionsFromText(editing.options) }), () => setEditing(null))} className={primary}>Save</button>
                      <button type="button" onClick={() => setEditing(null)} className={ghost}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-fg">{i + 1}. {q.text}</p>
                      <button type="button" aria-label={`Edit question ${i + 1}`} onClick={() => { setDeleting(null); setEditing({ id: q.id, text: q.text, options: q.options.join(", ") }); }} className="rounded p-1 text-subtle hover:text-fg"><Pencil size={12} /></button>
                      <button type="button" aria-label={`Delete question ${i + 1}`} onClick={() => setDeleting(q.id)} className="rounded p-1 text-subtle hover:text-rose-600"><Trash2 size={12} /></button>
                    </div>
                    {deleting === q.id && (
                      <p className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-rose-500/10 px-1.5 py-1 text-[11.5px]">
                        <span className="font-semibold text-rose-700">Delete this question and its {q.answers.length} answer{q.answers.length === 1 ? "" : "s"}?</span>
                        <button type="button" disabled={pending} onClick={() => run(() => deleteDesignQuestion(q.id), () => setDeleting(null))} className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white hover:bg-rose-700 disabled:opacity-50">Delete</button>
                        <button type="button" onClick={() => setDeleting(null)} className="font-semibold text-muted hover:text-fg">Keep</button>
                      </p>
                    )}

                    {q.options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Your answer to: ${q.text}`}>
                        {q.options.map((o) => {
                          const on = mine?.choice === o;
                          const votes = q.answers.filter((a) => a.choice === o);
                          return (
                            <button key={o} type="button" disabled={pending} aria-pressed={on} title={votes.length ? votes.map((v) => v.userName).join(", ") : "Nobody yet"}
                              onClick={() => answer(on ? null : o, note)}
                              className={`rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold ${on ? "border-brand-600 bg-brand-600 text-white" : "border-line text-fg hover:bg-elevated"}`}>
                              {o}{votes.length > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${on ? "bg-white/25" : "bg-elevated text-muted"}`}>{votes.length}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <input id={`answer-${q.id}`} aria-label={`Your note on: ${q.text}`} value={note} maxLength={600} placeholder={q.options.length ? "Add a note (optional)" : "Your answer"}
                        onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") answer(mine?.choice ?? null, note); }}
                        className={field} />
                      <button type="button" disabled={pending || note.trim() === (mine?.text ?? "")} onClick={() => answer(mine?.choice ?? null, note)} className={ghost}>Save</button>
                    </div>

                    {q.answers.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-[12px]">
                        {q.answers.map((a) => (
                          <li key={a.userId} className="text-muted">
                            <strong className="font-semibold text-fg">{a.userName}{a.userId === meId ? " (you)" : ""}:</strong>{" "}
                            {a.choice && <span className="font-semibold text-fg">{a.choice}</span>}{a.choice && a.text ? " — " : ""}{a.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11.5px] text-subtle">No answers yet.</p>
                    )}
                    {q.createdByName && <p className="mt-1 text-[11px] text-subtle">Asked by {q.createdByName}</p>}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
