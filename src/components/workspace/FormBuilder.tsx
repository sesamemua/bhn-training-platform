"use client";

/**
 * The form builder, and the workflow the form feeds, side by side.
 *
 * Left: the questions, their logic and the sheets they read.
 * Right: the decision workflow those answers run through.
 *
 * They are one document and one condition engine — a step's test and a
 * field's show-rule are evaluated by the same function, so the two panes
 * cannot disagree about what an answer means. The seam between them
 * drags, because which half you are working on changes minute to minute.
 *
 * Nothing here is linked to the flow-chart tab. A chart is a drawing of
 * a process for people to read; this is a specification something
 * executes. Tying them meant neither could change alone.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, Eye, Loader2, Plus, RefreshCw, Table2, Trash2,
  Wrench,
} from "lucide-react";
import {
  CONDITION_OPS, FIELD_STAGES, FIELD_STAGE_LABEL, FIELD_TYPES, FIELD_TYPE_LABEL, keyFor,
  type BuiltForm, type Condition, type DataSource, type FieldStage, type FormField,
  type StepKind, type WorkflowStep,
} from "@/lib/formbuilder/types";
import {
  missing, optionsFor, problems, visibleFields, walk, type Answers,
} from "@/lib/formbuilder/logic";
import { chosenClashes } from "@/lib/formbuilder/calendar";
import { FormFillView } from "./FormFillView";
import { SessionCalendar } from "./SessionCalendar";
import { CONFIRM_DAYS_BEFORE } from "@/lib/formbuilder/training-week";
import { readSheet, saveForm } from "@/app/(dashboard)/admin/workspace/forms/actions";

const CARD = "rounded-lg border border-line bg-card p-3";
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle";
/**
 * An underline, not a box.
 *
 * A bordered input inside a bordered card inside a bordered list is
 * three rectangles saying the same thing. A rule under the value is
 * enough to say "you can type here", and the page stops looking like a
 * spreadsheet of empty cells.
 */
const LINE =
  "mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none transition-colors focus-visible:border-brand-500";
const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";
const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white hover:brightness-110 disabled:opacity-40";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export function FormBuilder({
  formId, initial, canEdit, title = "Form",
}: { formId: string; initial: BuiltForm; canEdit: boolean; title?: string }) {
  const [doc, setDoc] = useState<BuiltForm>(initial);
  /*
   * Two views of one document, and the toggle lives HERE rather than a
   * level up so that Preview shows the document as it is right now —
   * including edits that have not been saved. Checking a change by
   * saving it first is checking it on everybody.
   */
  const [view, setView] = useState<"setup" | "fill">("setup");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState<Answers>({});
  // Which of the two moments the preview is showing. The registration
  // form is the one people meet first, so it is what opens.
  const [stage, setStage] = useState<FieldStage>("registration");
  const [split, setSplit] = useState(56); // percent given to the left pane

  const edit = useCallback((next: (d: BuiltForm) => BuiltForm) => {
    setDoc((d) => next(d));
    setDirty(true);
    setSaved(null);
  }, []);

  const found = useMemo(() => problems(doc), [doc]);
  const shown = useMemo(() => visibleFields(doc, answers, stage), [doc, answers, stage]);
  const path = useMemo(() => walk(doc, answers), [doc, answers]);
  const stillMissing = useMemo(() => missing(doc, answers, stage), [doc, answers, stage]);

  // ── the draggable seam ─────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const pct = ((e.clientX - r.left) / r.width) * 100;
      // Neither pane may be squeezed to nothing — a pane you cannot see
      // is a pane you cannot drag back.
      setSplit(Math.max(28, Math.min(72, pct)));
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div className="mt-4">
      {/* Stays with you down the page.
          A form is long, and the Save is the one control you reach for
          from anywhere in it — parking it at the top means scrolling
          back to a place you were not reading to press a button you
          were already thinking about. Sticky rather than a floating
          blob in a corner, so it never sits on top of the question you
          are editing. */}
      <div className="sticky top-2 z-30 -mx-2 rounded-xl border border-line bg-card/95 px-3 py-2.5 shadow-card-hover backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-bold transition-all ${
              dirty && canEdit
                ? "bg-brand text-white shadow-lg hover:brightness-110"
                : "border border-line bg-elevated text-subtle"
            } disabled:opacity-60`}
            disabled={!canEdit || !dirty || pending}
            onClick={() =>
              start(async () => {
                const res = await saveForm(formId, doc);
                if (res.ok) { setDirty(false); setSaved("Saved."); }
                else setSaved(res.problem ?? "Could not save.");
              })
            }
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>

          {/* The unsaved state said out loud, not left to the button's
              colour — a colour change is easy to miss on a long page. */}
          {dirty && !pending && (
            <span className="text-[12.5px] font-semibold text-amber-600">
              Unsaved changes
            </span>
          )}
          {saved && !dirty && <span className="text-[12.5px] text-muted">{saved}</span>}

          {found.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-amber-600">
              <AlertTriangle size={13} /> {found.length} thing{found.length === 1 ? "" : "s"} to fix
            </span>
          )}

          {/* Set up is what the form IS; Preview is what it is LIKE.
              Both are needed and neither replaces the other — you
              cannot change a question from the preview, and you cannot
              tell whether a form is too long from the builder. */}
          <span className="ml-auto inline-flex rounded-lg border border-line bg-elevated p-0.5">
            {([["setup", "Set up", Wrench], ["fill", "Preview", Eye]] as const).map(([id, text, Icon]) => (
              <button
                key={id}
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  view === id ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                <Icon size={13} /> {text}
              </button>
            ))}
          </span>
        </div>
      </div>

      {/* Kept mounted, not swapped. The builder holds unsaved edits and
          a half-dragged seam; unmounting it to look at the preview
          would throw both away, which is exactly the round trip this
          toggle exists to make cheap. */}
      <div hidden={view !== "fill"}>
        <FormFillView doc={doc} title={title} />
      </div>

      <div ref={wrapRef} hidden={view !== "setup"} className="mt-4 flex items-start gap-0">
        <div style={{ width: `${split}%` }} className="min-w-0 pr-3">
          <FieldList doc={doc} edit={edit} canEdit={canEdit} />
          <Sources doc={doc} edit={edit} canEdit={canEdit} />
        </div>

        {/* The seam. The whole 20px band is the handle, not the hairline
            inside it — a pointer target wants tens of pixels. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the two panes"
          onPointerDown={() => { dragging.current = true; }}
          className="group relative w-5 shrink-0 cursor-col-resize self-stretch touch-none"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-brand-400/70" />
          <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong transition-colors group-hover:bg-brand-400" />
        </div>

        <div style={{ width: `${100 - split}%` }} className="min-w-0 pl-3">
          <Workflow doc={doc} edit={edit} canEdit={canEdit} path={path} />
          <Preview
            doc={doc}
            shown={shown}
            answers={answers}
            setAnswers={setAnswers}
            missingCount={stillMissing.length}
            stage={stage}
            setStage={setStage}
          />
        </div>
      </div>

      {/* Recorded whether or not anybody asks for it, and worth saying
          so: it is what the seat-allocation rule "first come, first
          served" reads, and an admin who does not know it exists will
          add a "when did you apply" question that people answer wrongly. */}
      <p className="mt-5 text-[11.5px] leading-snug text-subtle">
        Every submission is stamped with the moment it arrived. You do not need
        a question for it — Admin → Registrants shows it, and the seat-allocation
        rule <strong>First come, first served</strong> ranks on it.
      </p>

      {found.length > 0 && (
        <section className="mt-5 rounded-lg border border-amber-500/50 bg-amber-500/8 p-4">
          <p className={LABEL}>Things to fix</p>
          <ul className="mt-2 space-y-1">
            {found.map((p, i) => (
              <li key={i} className="text-[12.5px] text-fg">
                <span className="font-semibold">{p.where}</span>{" "}
                <span className="text-muted">— {p.what}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── questions ────────────────────────────────────────────────────────

function FieldList({
  doc, edit, canEdit,
}: { doc: BuiltForm; edit: (n: (d: BuiltForm) => BuiltForm) => void; canEdit: boolean }) {
  /*
   * Open by default, and what is tracked is what has been COLLAPSED.
   *
   * The other way round — one open at a time — makes you click into
   * every question to see what it does, which on a twenty-question form
   * is twenty clicks to answer "which of these is required". Seeing
   * everything is the normal case; tidying one away is the exception,
   * so the exception is what carries the state.
   */
  const [shut, setShut] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setShut((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () =>
    edit((d) => {
      const key = keyFor("question", d.fields.map((f) => f.key));
      return {
        ...d,
        fields: [
          ...d.fields,
          { id: uid("f"), key, label: "New question", type: "short_text", required: false, options: [], showWhen: [], slots: [], stage: "registration" },
        ],
      };
    });

  const patch = (id: string, p: Partial<FormField>) =>
    edit((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) }));

  const move = (i: number, dir: -1 | 1) =>
    edit((d) => {
      const to = i + dir;
      if (to < 0 || to >= d.fields.length) return d;
      const next = [...d.fields];
      [next[i], next[to]] = [next[to], next[i]];
      return { ...d, fields: next };
    });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={LABEL}>Questions</p>
        <span className="flex items-center gap-2">
          {doc.fields.length > 1 && (
            <button
              className={BTN}
              onClick={() =>
                setShut(shut.size === 0 ? new Set(doc.fields.map((f) => f.id)) : new Set())
              }
            >
              {shut.size === 0 ? "Collapse all" : "Open all"}
            </button>
          )}
          {canEdit && <button className={BTN} onClick={add}><Plus size={12} /> Question</button>}
        </span>
      </div>

      {/* ONE box around the lot, with lines between the questions.
          A card per question drew twenty-two borders down the page, and
          twenty-two borders read as twenty-two unrelated things rather
          than as one list. The rows are also given real room — a
          question is the unit of work here, and it was sitting in the
          padding of a chip. */}
      <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
        {doc.fields.map((f, i) => (
          <li key={f.id} className="px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[12px] text-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <input
                  value={f.label}
                  disabled={!canEdit}
                  onChange={(e) => patch(f.id, { label: e.target.value.slice(0, 160) })}
                  className="w-full border-0 bg-transparent p-0 text-[14px] font-semibold leading-snug text-fg outline-none focus-visible:text-brand-300"
                />
                <p className="mt-1 font-mono text-[10.5px] text-subtle">
                  {f.key} · {FIELD_TYPE_LABEL[f.type]}
                  {f.required ? " · required" : ""}
                  {f.stage !== "registration" ? " · asked after approval" : ""}
                  {f.showWhen.length > 0 ? ` · shown when ${f.showWhen.length} rule${f.showWhen.length === 1 ? "" : "s"} match` : ""}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5">
                <button onClick={() => move(i, -1)} disabled={!canEdit || i === 0} className="rounded p-1 text-subtle hover:bg-elevated hover:text-fg disabled:opacity-25"><ArrowUp size={12} /></button>
                <button onClick={() => move(i, 1)} disabled={!canEdit || i === doc.fields.length - 1} className="rounded p-1 text-subtle hover:bg-elevated hover:text-fg disabled:opacity-25"><ArrowDown size={12} /></button>
                <button onClick={() => toggle(f.id)} className="rounded px-1.5 py-1 text-[11px] font-semibold text-brand-400 hover:bg-elevated">
                  {shut.has(f.id) ? "Open" : "Collapse"}
                </button>
              </span>
            </div>

            {!shut.has(f.id) && (
              <FieldEditor doc={doc} field={f} patch={(p) => patch(f.id, p)} canEdit={canEdit}
                remove={() => edit((d) => ({ ...d, fields: d.fields.filter((x) => x.id !== f.id) }))} />
            )}
          </li>
        ))}
        {doc.fields.length === 0 && (
          <li className="p-8 text-center text-[12.5px] text-muted">
            No questions yet. Add one and it appears in the preview on the right.
          </li>
        )}
      </ol>
    </section>
  );
}

function FieldEditor({
  doc, field, patch, remove, canEdit,
}: {
  doc: BuiltForm; field: FormField; patch: (p: Partial<FormField>) => void;
  remove: () => void; canEdit: boolean;
}) {
  // Only earlier questions can be tested — a rule reading a later answer
  // can never be true when the field is drawn, which `problems` reports
  // and this prevents in the first place.
  const earlier = doc.fields.slice(0, doc.fields.findIndex((f) => f.id === field.id));

  return (
    <div className="ml-9 mt-4 border-t border-line pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={LABEL}>Answer type</span>
          <select className={LINE} value={field.type} disabled={!canEdit}
            onChange={(e) => patch({ type: e.target.value as FormField["type"] })}>
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
          </select></label>
        <label><span className={LABEL}>Key</span>
          <input className={`${LINE} font-mono`} value={field.key} disabled={!canEdit}
            onChange={(e) => patch({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 60) })} /></label>
        <label className="sm:col-span-2"><span className={LABEL}>When it is asked</span>
          <select className={LINE} value={field.stage} disabled={!canEdit}
            onChange={(e) => patch({ stage: e.target.value as FieldStage })}>
            {FIELD_STAGES.map((st) => <option key={st} value={st}>{FIELD_STAGE_LABEL[st]}</option>)}
          </select>
          {field.stage === "confirmation" && (
            <span className="mt-1 block text-[11px] leading-snug text-subtle">
              Not on the registration form. It goes out by email once a place has
              been approved — asking it while somebody is signing up gets an
              answer about a seat they have not been given yet.
            </span>
          )}
        </label>
      </div>
      <label className="mt-2 block"><span className={LABEL}>Hint under the answer</span>
        <AutoTextarea value={field.help ?? ""} disabled={!canEdit}
          onChange={(v) => patch({ help: v.slice(0, 1000) })} /></label>

      <label className="mt-2 inline-flex items-center gap-2 text-[12.5px] text-muted">
        <input type="checkbox" checked={field.required} disabled={!canEdit}
          onChange={(e) => patch({ required: e.target.checked })} /> Needed before submitting
      </label>

      {(field.type === "choice" || field.type === "multi") && (
        <label className="mt-2 block"><span className={LABEL}>Choices, one per line</span>
          <textarea rows={4} className={LINE} value={field.options.join("\n")} disabled={!canEdit}
            onChange={(e) => patch({ options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 200) })} /></label>
      )}

      {field.type === "lookup" && (
        <label className="mt-2 block"><span className={LABEL}>Read choices from</span>
          <select className={LINE} value={field.sourceId ?? ""} disabled={!canEdit}
            onChange={(e) => patch({ sourceId: e.target.value || undefined })}>
            <option value="">Choose a data sheet…</option>
            {doc.sources.map((s) => <option key={s.id} value={s.id}>{s.label || s.url}</option>)}
          </select></label>
      )}

      <ConditionList
        title="Show this question only when"
        conditions={field.showWhen}
        fields={earlier}
        canEdit={canEdit}
        onChange={(showWhen) => patch({ showWhen })}
      />

      {canEdit && (
        <button onClick={remove} className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-red-500">
          <Trash2 size={12} /> Remove this question
        </button>
      )}
    </div>
  );
}

/**
 * A textarea the height of its own text.
 *
 * A consent statement is four lines and a hint is one; a fixed two rows
 * gives the first a scrollbar and the second an empty gap. Measured
 * after every change rather than counting newlines, because what
 * matters is how the text WRAPS at the current width, which only the
 * browser knows.
 */
function AutoTextarea({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Nothing to measure against at zero width, and the answer would be
    // nonsense rather than merely wrong: every character wraps to its
    // own line, so a 500-character hint asks for an 8000px box. Happens
    // whenever the pane is collapsed or the element is not laid out yet.
    if (el.clientWidth === 0) return;
    // Collapse first: scrollHeight only ever grows against the current
    // height, so measuring without resetting can never shrink the box.
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${LINE} resize-none overflow-hidden leading-snug`}
    />
  );
}

/** The one condition editor, used by fields and by workflow steps alike. */
function ConditionList({
  title, conditions, fields, canEdit, onChange,
}: {
  title: string; conditions: Condition[]; fields: FormField[]; canEdit: boolean;
  onChange: (c: Condition[]) => void;
}) {
  const set = (i: number, p: Partial<Condition>) =>
    onChange(conditions.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <div className="mt-3">
      <p className={LABEL}>{title}</p>
      {conditions.length === 0 && (
        <p className="mt-1 text-[11.5px] text-subtle">
          {fields.length === 0 ? "Nothing earlier to test." : "Always."}
        </p>
      )}
      <ul className="mt-1 space-y-1.5">
        {conditions.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5">
            <select className="rounded border border-line bg-elevated px-1.5 py-1 text-[12px] text-fg" value={c.field} disabled={!canEdit}
              onChange={(e) => set(i, { field: e.target.value })}>
              <option value="">choose a question…</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
            </select>
            <select className="rounded border border-line bg-elevated px-1.5 py-1 text-[12px] text-fg" value={c.op} disabled={!canEdit}
              onChange={(e) => set(i, { op: e.target.value as Condition["op"] })}>
              {CONDITION_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {c.op !== "answered" && c.op !== "empty" && (
              <input className="min-w-0 flex-1 rounded border border-line bg-elevated px-1.5 py-1 text-[12px] text-fg"
                value={c.value ?? ""} disabled={!canEdit}
                placeholder={c.op === "any of" ? "a, b, c" : "Yes"}
                onChange={(e) => set(i, { value: e.target.value.slice(0, 200) })} />
            )}
            {canEdit && (
              <button onClick={() => onChange(conditions.filter((_, j) => j !== i))}
                className="rounded p-1 text-subtle hover:text-red-500"><Trash2 size={11} /></button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && fields.length > 0 && (
        <button className="mt-1.5 text-[11.5px] font-semibold text-brand-400 hover:text-brand-200"
          onClick={() => onChange([...conditions, { field: fields[0].key, op: "is", value: "" }])}>
          + add a rule
        </button>
      )}
    </div>
  );
}

// ── external data sheets ─────────────────────────────────────────────

function Sources({
  doc, edit, canEdit,
}: { doc: BuiltForm; edit: (n: (d: BuiltForm) => BuiltForm) => void; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const patch = (id: string, p: Partial<DataSource>) =>
    edit((d) => ({ ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...p } : s)) }));

  const load = (s: DataSource) =>
    start(async () => {
      setProblem(null);
      const res = await readSheet(s.url);
      if (res.problem) { setProblem(res.problem); return; }
      patch(s.id, { columns: res.columns ?? [], rows: res.rows ?? [], fetchedAt: res.fetchedAt, valueColumn: s.valueColumn ?? res.columns?.[0] });
    });

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>Data sheets</p>
        {canEdit && (
          <button className={BTN}
            onClick={() => edit((d) => ({ ...d, sources: [...d.sources, { id: uid("s"), label: "", url: "", columns: [], rows: [] }] }))}>
            <Plus size={12} /> Sheet
          </button>
        )}
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-subtle">
        A Google Sheet shared as <em>anyone with the link → viewer</em>. Its rows
        become the choices on any question set to read from it.
      </p>

      {problem && (
        <p className="mt-2 inline-flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-[12px] text-amber-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {problem}
        </p>
      )}

      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card empty:hidden">
        {doc.sources.map((s) => (
          <li key={s.id} className="px-4 py-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className={LABEL}>What to call it</span>
                <input className={LINE} value={s.label} disabled={!canEdit}
                  onChange={(e) => patch(s.id, { label: e.target.value.slice(0, 80) })} /></label>
              <label><span className={LABEL}>Column to use</span>
                <select className={LINE} value={s.valueColumn ?? ""} disabled={!canEdit || s.columns.length === 0}
                  onChange={(e) => patch(s.id, { valueColumn: e.target.value || undefined })}>
                  {s.columns.length === 0 && <option value="">read the sheet first</option>}
                  {s.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
            </div>
            <label className="mt-2 block"><span className={LABEL}>Sheet link</span>
              <input className={`${LINE} font-mono text-[11.5px]`} value={s.url} disabled={!canEdit}
                placeholder="https://docs.google.com/spreadsheets/…"
                onChange={(e) => patch(s.id, { url: e.target.value.slice(0, 500) })} /></label>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button className={BTN} disabled={!canEdit || !s.url || pending} onClick={() => load(s)}>
                {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Read it
              </button>
              <span className="text-[11.5px] text-subtle">
                {s.rows.length > 0
                  ? `${s.rows.length} rows, ${s.columns.length} columns${s.fetchedAt ? ` · read ${new Date(s.fetchedAt).toLocaleString()}` : ""}`
                  : "Not read yet."}
              </span>
              {canEdit && (
                <button onClick={() => edit((d) => ({ ...d, sources: d.sources.filter((x) => x.id !== s.id) }))}
                  className="ml-auto rounded p-1 text-subtle hover:text-red-500"><Trash2 size={12} /></button>
              )}
            </div>

            {s.rows.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11.5px] text-muted hover:text-fg">
                  <Table2 size={11} className="inline" /> Look at it
                </summary>
                <div className="mt-1.5 max-h-52 overflow-auto rounded border border-line">
                  <table className="w-full border-collapse text-[11.5px]">
                    <thead><tr className="bg-elevated">
                      {s.columns.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1 text-left text-[10.5px] font-bold uppercase text-subtle">{c}</th>)}
                    </tr></thead>
                    <tbody>
                      {s.rows.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-t border-line">
                          {s.columns.map((_, j) => <td key={j} className="px-2 py-1 text-muted">{r[j] ?? ""}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── the workflow the answers run through ─────────────────────────────

const STEP_LABEL: Record<StepKind, string> = {
  start: "Start", check: "Check", action: "Action", end: "End",
};

function Workflow({
  doc, edit, canEdit, path,
}: {
  doc: BuiltForm; edit: (n: (d: BuiltForm) => BuiltForm) => void; canEdit: boolean;
  path: { step: WorkflowStep; via: string | null }[];
}) {
  const taken = new Set(path.map((p) => p.step.id));
  const patch = (id: string, p: Partial<WorkflowStep>) =>
    edit((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }));

  const add = (kind: StepKind) =>
    edit((d) => ({
      ...d,
      steps: [...d.steps, { id: uid("s"), kind, label: STEP_LABEL[kind], when: [], next: undefined, otherwise: undefined }],
    }));

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={LABEL}>Workflow the answers run through</p>
        {canEdit && (
          <span className="flex gap-1">
            {(["start", "check", "action", "end"] as StepKind[]).map((k) => (
              <button key={k} className={BTN} onClick={() => add(k)}><Plus size={11} /> {STEP_LABEL[k]}</button>
            ))}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-subtle">
        Highlighted steps are the ones the preview&rsquo;s answers actually reach.
      </p>

      <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
        {doc.steps.map((s) => (
          <li key={s.id} className={`px-4 py-3.5 ${taken.has(s.id) ? "bg-brand-500/8" : ""}`}>
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                s.kind === "start" ? "bg-emerald-500/12 text-emerald-500"
                : s.kind === "end" ? "bg-elevated text-subtle"
                : s.kind === "check" ? "bg-amber-500/12 text-amber-500"
                : "bg-brand-500/12 text-brand-400"}`}>{STEP_LABEL[s.kind]}</span>
              <input value={s.label} disabled={!canEdit}
                onChange={(e) => patch(s.id, { label: e.target.value.slice(0, 160) })}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-semibold text-fg outline-none focus-visible:text-brand-300" />
              {canEdit && (
                <button onClick={() => edit((d) => ({ ...d, steps: d.steps.filter((x) => x.id !== s.id) }))}
                  className="rounded p-1 text-subtle hover:text-red-500"><Trash2 size={12} /></button>
              )}
            </div>

            {s.kind === "check" && (
              <ConditionList title="Passes when" conditions={s.when} fields={doc.fields} canEdit={canEdit}
                onChange={(when) => patch(s.id, { when })} />
            )}

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {s.kind !== "end" && (
                <label><span className={LABEL}>{s.kind === "check" ? "If it passes" : "Then"}</span>
                  <select className={LINE} value={s.next ?? ""} disabled={!canEdit}
                    onChange={(e) => patch(s.id, { next: e.target.value || undefined })}>
                    <option value="">nowhere</option>
                    {doc.steps.filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select></label>
              )}
              {s.kind === "check" && (
                <label><span className={LABEL}>If it fails</span>
                  <select className={LINE} value={s.otherwise ?? ""} disabled={!canEdit}
                    onChange={(e) => patch(s.id, { otherwise: e.target.value || undefined })}>
                    <option value="">nowhere</option>
                    {doc.steps.filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select></label>
              )}
            </div>
          </li>
        ))}
        {doc.steps.length === 0 && (
          <li className="p-8 text-center text-[12.5px] text-muted">
            No workflow yet. Add a Start, then Checks that read the answers.
          </li>
        )}
      </ol>
    </section>
  );
}

/**
 * A "choose several" question drawn as the week it actually is.
 *
 * Cells sit side by side when they run at the same time, which is the
 * whole point: a clash is a shape on the screen instead of something
 * you find out after approval. Both may still be ticked — a second
 * choice is worth expressing — and the consequence is spelled out
 * underneath rather than enforced by a disabled control.
 */
function Preview({
  doc, shown, answers, setAnswers, missingCount, stage, setStage,
}: {
  doc: BuiltForm; shown: FormField[]; answers: Answers;
  setAnswers: (a: Answers) => void; missingCount: number;
  stage: FieldStage; setStage: (s: FieldStage) => void;
}) {
  const set = (k: string, v: Answers[string]) => setAnswers({ ...answers, [k]: v });
  const inStage = doc.fields.filter((f) => f.stage === stage).length;

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={LABEL}>Preview</p>
        {/* Two moments, previewed separately. The confirmation questions
            are not hidden by a rule that might accidentally be true —
            they are simply not part of the registration form, and the
            only honest way to check them is to look at that stage. */}
        <span className="flex rounded-md border border-line p-0.5">
          {FIELD_STAGES.map((st) => (
            <button
              key={st}
              onClick={() => setStage(st)}
              className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                stage === st ? "bg-brand-500/15 text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {st === "registration" ? "Registration form" : "After approval"}
            </button>
          ))}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-subtle">
        {stage === "registration"
          ? "What somebody sees when they sign up."
          : `Sent by email once a place is approved, about ${CONFIRM_DAYS_BEFORE} days before the session.`}{" "}
        {shown.length} of {inStage} shown
        {missingCount > 0 ? ` · ${missingCount} still needed` : ""}.
      </p>

      <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
        {shown.map((f) => {
          const opts = optionsFor(doc, f);
          if (f.type === "note") {
            return (
              <div key={f.id} className="bg-elevated/50 px-4 py-3">
                <p className="text-[12.5px] font-semibold text-fg">{f.label}</p>
                {f.help && <p className="mt-0.5 text-[11px] leading-snug text-muted">{f.help}</p>}
              </div>
            );
          }
          return (
            <label key={f.id} className="block px-4 py-3.5">
              {f.type !== "consent" && (
                <span className="text-[12.5px] font-semibold text-fg">
                  {f.label}{f.required && <span className="ml-1 text-brand-400">*</span>}
                </span>
              )}
              {f.help && <span className="mt-0.5 block text-[11px] text-subtle">{f.help}</span>}
              {f.type === "consent" ? (
                // The label IS the statement, so it sits beside the box
                // rather than above it — you tick the sentence you are
                // agreeing to, not a box under a heading.
                <span className="mt-1.5 flex items-start gap-2.5 rounded-lg border border-line bg-elevated p-3">
                  <input
                    type="radio"
                    // A radio rather than a checkbox: one deliberate
                    // choice that stays chosen. Named per field so two
                    // consent questions on one form never share a group
                    // and cancel each other out.
                    name={`consent_${f.key}`}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-500)]"
                    checked={answers[f.key] === "Yes"}
                    onChange={() => set(f.key, "Yes")}
                  />
                  <span className="text-[12px] leading-snug text-fg">{f.label}</span>
                </span>
              ) : f.type === "yesno" ? (
                <span className="mt-1 flex gap-2">
                  {["Yes", "No"].map((v) => (
                    <button key={v} onClick={() => set(f.key, v)}
                      className={`rounded-md border px-2.5 py-1 text-[12px] ${answers[f.key] === v ? "border-brand-500 bg-brand-500/12 text-fg" : "border-line text-muted hover:bg-elevated"}`}>
                      {v}
                    </button>
                  ))}
                </span>
              ) : f.type === "choice" || f.type === "lookup" ? (
                <select className={LINE} value={String(answers[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">Choose…</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "multi" && f.slots.length > 0 ? (
                <SessionCalendar
                  field={f}
                  chosen={Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : []}
                  onToggle={(o) => {
                    const arr = Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : [];
                    set(f.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
                  }}
                />
              ) : f.type === "multi" ? (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {opts.map((o) => {
                    const arr = Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : [];
                    const on = arr.includes(o);
                    return (
                      <button key={o}
                        onClick={() => set(f.key, on ? arr.filter((x) => x !== o) : [...arr, o])}
                        className={`rounded-md border px-2 py-1 text-[11.5px] ${on ? "border-brand-500 bg-brand-500/12 text-fg" : "border-line text-muted hover:bg-elevated"}`}>
                        {o}
                      </button>
                    );
                  })}
                </span>
              ) : f.type === "long_text" ? (
                <textarea rows={3} className={LINE} value={String(answers[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input
                  className={LINE}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                  value={String(answers[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </label>
          );
        })}
        {shown.length === 0 && (
          <p className="p-8 text-center text-[12.5px] text-muted">Nothing to show yet.</p>
        )}
      </div>
    </section>
  );
}
