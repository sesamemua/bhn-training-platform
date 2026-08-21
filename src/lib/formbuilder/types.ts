/**
 * A form you build, and the decision workflow attached to it.
 *
 * One document holds both. They are not two things that have to be kept
 * in step — the workflow's steps REFER to the form's fields by key, so a
 * field that is renamed or deleted is visible to the workflow
 * immediately, and the builder can say "this step asks about a question
 * that no longer exists" instead of silently doing nothing.
 *
 * Deliberately not the flow-chart document. A chart is a drawing of a
 * process for people to read; this is a specification a machine
 * executes. Sharing one type between them is what made the chart
 * impossible to change without changing the form.
 *
 * Pure types + parsing. No React, no Prisma.
 */
import { z } from "zod";

export const FIELD_TYPES = [
  "short_text", "long_text", "email", "phone", "number", "date",
  "choice", "multi", "yesno", "consent", "lookup",
  // Collects nothing. A form is a conversation, and a conversation
  // sometimes has to SAY something — "you can still apply, here is
  // where" — rather than ask. Putting that in the help text of the next
  // question makes it a footnote to a question it is not about.
  "note",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  note: "Note — says something, asks nothing",
  short_text: "Short text",
  long_text: "Paragraph",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  choice: "Choose one",
  multi: "Choose several",
  yesno: "Yes / no",
  consent: "Consent — one option to select",
  lookup: "Pick from a data sheet",
};

/**
 * An external sheet a question can draw its options from.
 *
 * Held as the pasted URL plus a cached copy of what was last read, so
 * the builder can show the columns without a network round trip on every
 * keystroke — and so a form still renders its choices when the sheet is
 * unreachable, which is exactly when you would rather it did.
 */
export const DataSourceSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(80),
  url: z.string().max(500),
  /** Column headers as last read. */
  columns: z.array(z.string().max(80)).max(50).default([]),
  /** Which column supplies the options. */
  valueColumn: z.string().max(80).optional(),
  /** Rows as last read, capped — this is a picker, not a database. */
  rows: z.array(z.array(z.string().max(200)).max(50)).max(500).default([]),
  fetchedAt: z.string().max(40).optional(),
  error: z.string().max(200).optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

/** Show this field only when the condition holds. */
export const CONDITION_OPS = [
  "is", "is not", "any of", "contains", "answered", "empty",
  "greater than", "less than",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export const ConditionSchema = z.object({
  /** The field key this reads. */
  field: z.string().min(1).max(60),
  op: z.enum(CONDITION_OPS),
  value: z.string().max(200).optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

/**
 * When a question is asked.
 *
 * Not everything on a form is asked at the same moment. "Can you still
 * make it?" belongs weeks after registration, in an email sent once a
 * place has been approved — asking it on the day somebody signs up gets
 * an answer about a session they have not been given yet.
 *
 * One document still, because it is one process and the workflow reads
 * both. Splitting it into two forms would mean two places to keep the
 * keys, the logic and the wording in step.
 */
export const FIELD_STAGES = ["registration", "confirmation"] as const;
export type FieldStage = (typeof FIELD_STAGES)[number];

export const FIELD_STAGE_LABEL: Record<FieldStage, string> = {
  registration: "On the registration form",
  confirmation: "In the confirmation email, after approval",
};

export const FieldSchema = z.object({
  id: z.string().min(1).max(40),
  /** Stable key answers are stored under, and what conditions read. */
  key: z.string().min(1).max(60),
  label: z.string().max(160),
  type: z.enum(FIELD_TYPES),
  /**
   * 1000, not 400. A hint under a text box is a sentence; a consent
   * statement has to say what is recorded, where it can end up, how
   * long it lasts and what to do about it, and 400 characters silently
   * DROPPED the whole question — parseForm discards a field it cannot
   * validate, which is right for resilience and merciless for a cap set
   * too low.
   */
  help: z.string().max(1000).optional(),
  /**
   * A one-click "nothing to declare" beside a text box.
   *
   * "Dietary requirements" left blank is ambiguous — it could mean none,
   * or it could mean you had not got to it yet. An explicit N/A is an
   * answer, and the difference matters to whoever is ordering lunch.
   */
  noneLabel: z.string().max(40).optional(),
  required: z.boolean().default(false),
  options: z.array(z.string().max(120)).max(200).default([]),
  /** When this question is put to the person. */
  stage: z.enum(FIELD_STAGES).default("registration"),
  /** For `lookup`: which sheet supplies the options. */
  sourceId: z.string().max(40).optional(),
  /**
   * When each option happens, so a "choose several" question can be
   * drawn as a week instead of a list and a clash becomes visible
   * rather than discovered after approval.
   *
   * `option` matches the option string exactly. Options without a slot
   * simply fall back to the list, so half-filled schedules degrade
   * rather than break.
   */
  slots: z.array(z.object({
    option: z.string().max(120),
    day: z.string().max(10),
    start: z.string().max(5),
    end: z.string().max(5),
  })).max(200).default([]),
  /** How many of a clashing pair will actually be granted. */
  approveFromClash: z.number().int().min(1).max(10).optional(),
  /**
   * ALL of these must hold for the field to be shown. An empty list
   * means always — the common case, and the one that should need no
   * ceremony to express.
   */
  showWhen: z.array(ConditionSchema).max(8).default([]),
});
export type FormField = z.infer<typeof FieldSchema>;

/**
 * A step in the workflow the form feeds.
 *
 * Kept flat with explicit `next`/`otherwise` rather than as a nested
 * tree: a tree cannot express two branches rejoining, and every real
 * process rejoins.
 */
export const STEP_KINDS = ["start", "check", "action", "end"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const StepSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(STEP_KINDS),
  label: z.string().max(160),
  /** For `check`: what it tests, read from the form's answers. */
  when: z.array(ConditionSchema).max(8).default([]),
  /** Where to go when the check passes, or the next step for others. */
  next: z.string().max(40).optional(),
  /** Where to go when a check fails. */
  otherwise: z.string().max(40).optional(),
  /** For `action`: a note on what the system or a person does here. */
  note: z.string().max(400).optional(),
});
export type WorkflowStep = z.infer<typeof StepSchema>;

/** The cap on the submit terms, in one place — schema, editor, reader. */
export const SUBMIT_NOTE_MAX = 2000;

export const BuiltFormSchema = z.object({
  /**
   * Terms carried by the act of submitting, shown beside the button.
   *
   * Some conditions are not questions. Asking "do you agree to be
   * photographed?" invites a No the form then has to refuse, which is a
   * worse conversation than saying up front that agreeing is part of
   * registering — and a question you cannot answer No to is a checkbox
   * pretending to be a choice.
   */
  submitNote: z.string().max(SUBMIT_NOTE_MAX).optional(),
  version: z.literal(1).default(1),
  fields: z.array(FieldSchema).max(200).default([]),
  sources: z.array(DataSourceSchema).max(20).default([]),
  steps: z.array(StepSchema).max(100).default([]),
});
export type BuiltForm = z.infer<typeof BuiltFormSchema>;

export const EMPTY_FORM: BuiltForm = { version: 1, fields: [], sources: [], steps: [] };

/**
 * Read a stored blob, dropping anything malformed rather than throwing.
 *
 * A form that lost one field should still open. An editor that refuses
 * to load is the one failure the person cannot work around.
 */
export function parseForm(raw: unknown): BuiltForm {
  const asObject =
    typeof raw === "string" ? safeJson(raw) : raw && typeof raw === "object" ? raw : null;
  if (!asObject) return EMPTY_FORM;

  const shallow = asObject as Record<string, unknown>;
  const fields = Array.isArray(shallow.fields)
    ? shallow.fields.flatMap((f) => {
        const r = FieldSchema.safeParse(f);
        return r.success ? [r.data] : [];
      })
    : [];
  const sources = Array.isArray(shallow.sources)
    ? shallow.sources.flatMap((s) => {
        const r = DataSourceSchema.safeParse(s);
        return r.success ? [r.data] : [];
      })
    : [];
  const steps = Array.isArray(shallow.steps)
    ? shallow.steps.flatMap((s) => {
        const r = StepSchema.safeParse(s);
        return r.success ? [r.data] : [];
      })
    : [];
  /*
   * Rebuilt key by key, so anything added to BuiltFormSchema has to be
   * added HERE too or it is silently lost on the next read. That is not
   * hypothetical: submitNote was added to the schema, saved happily, and
   * vanished on load until this line existed. The round-trip test in
   * tests/unit/form-fill-view.test.tsx exists to catch the next one.
   */
  const submitNote = typeof shallow.submitNote === "string"
    ? shallow.submitNote.slice(0, SUBMIT_NOTE_MAX)
    : undefined;

  return { version: 1, fields, sources, steps, ...(submitNote ? { submitNote } : {}) };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A key that is not already taken, derived from a label. */
export function keyFor(label: string, taken: string[]): string {
  const base =
    label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) {
    const next = `${base}_${i}`;
    if (!taken.includes(next)) return next;
  }
}
