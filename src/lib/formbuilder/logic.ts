/**
 * Running a built form: what shows, what is missing, where it leads.
 *
 * The same conditions drive BOTH halves — a field's `showWhen` and a
 * workflow step's `when` are the same shape evaluated by the same
 * function. That is the whole reason the builder can promise the two
 * panes agree: there is one implementation of "does this hold", not one
 * per pane that drift apart the first time somebody fixes a bug in one.
 *
 * Pure module: no React, no I/O.
 */
import type { BuiltForm, Condition, FieldStage, FormField, WorkflowStep } from "./types";

export type Answer = string | string[] | number | boolean | undefined;
export type Answers = Record<string, Answer>;

const asList = (v: Answer): string[] => {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [String(v)];
};

const norm = (s: string) => s.trim().toLowerCase();

/** Does one condition hold against the answers so far? */
export function holds(c: Condition, answers: Answers): boolean {
  const got = asList(answers[c.field]);
  const want = (c.value ?? "").split(",").map(norm).filter(Boolean);

  switch (c.op) {
    case "answered":
      return got.length > 0;
    case "empty":
      return got.length === 0;
    case "is":
      return got.length === 1 && want.length > 0 && norm(got[0]) === want[0];
    case "is not":
      // Unanswered is not the same as "not X" — a rule that treats a
      // blank as satisfying every negative shows fields to people who
      // have simply not got there yet.
      return got.length > 0 && (want.length === 0 || norm(got[0]) !== want[0]);
    case "any of":
      return got.some((g) => want.includes(norm(g)));
    case "contains":
      return got.some((g) => want.some((w) => norm(g).includes(w)));
    case "greater than":
    case "less than": {
      const a = Number(got[0]);
      const b = Number(c.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return c.op === "greater than" ? a > b : a < b;
    }
    default:
      return false;
  }
}

/** ALL conditions, with an empty list meaning "always". */
export const allHold = (cs: Condition[], answers: Answers) =>
  cs.length === 0 || cs.every((c) => holds(c, answers));

/**
 * The fields a person can see right now, in order.
 *
 * Filtered by STAGE first. A question asked later by email is not
 * hidden from the registration form by a rule that could accidentally
 * be true — it is simply not part of that form.
 */
export function visibleFields(
  form: BuiltForm,
  answers: Answers,
  stage: FieldStage = "registration",
): FormField[] {
  // A field with no stage at all is a registration field. parseForm
  // fills the default, but anything that skips it — a document written
  // before stages existed, a literal built in a test — would otherwise
  // vanish from every stage rather than showing up in the obvious one.
  return form.fields.filter(
    (f) => (f.stage ?? "registration") === stage && allHold(f.showWhen, answers),
  );
}

/** Required fields that are visible in this stage and still unanswered. */
export function missing(
  form: BuiltForm,
  answers: Answers,
  stage: FieldStage = "registration",
): FormField[] {
  return visibleFields(form, answers, stage).filter(
    (f) => f.required && asList(answers[f.key]).length === 0,
  );
}

/** The options a field offers, resolving a data-sheet lookup. */
export function optionsFor(form: BuiltForm, field: FormField): string[] {
  if (field.type !== "lookup") return field.options;
  const src = form.sources.find((s) => s.id === field.sourceId);
  if (!src) return [];
  const col = src.valueColumn ? src.columns.indexOf(src.valueColumn) : 0;
  if (col < 0) return [];
  return src.rows.map((r) => r[col]).filter((v): v is string => !!v && v.trim().length > 0);
}

export interface Reached {
  step: WorkflowStep;
  /** Why this step was entered: the check that sent us here. */
  via: string | null;
}

/**
 * Walk the workflow under the current answers.
 *
 * Returns the path actually taken, so the right-hand pane can highlight
 * exactly where this person ends up — which is the only way to tell
 * whether a rule you just wrote does what you meant.
 *
 * Guards against a cycle rather than trusting the author not to draw
 * one: a workflow that loops is a mistake, and hanging the editor is a
 * poor way to report it.
 */
export function walk(form: BuiltForm, answers: Answers): Reached[] {
  const byId = new Map(form.steps.map((s) => [s.id, s]));
  const start = form.steps.find((s) => s.kind === "start") ?? form.steps[0];
  if (!start) return [];

  const path: Reached[] = [];
  const seen = new Set<string>();
  let current: WorkflowStep | undefined = start;
  let via: string | null = null;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push({ step: current, via });

    if (current.kind === "end") break;
    if (current.kind === "check") {
      const passed = allHold(current.when, answers);
      via = passed ? "yes" : "no";
      const nextId: string | undefined = passed ? current.next : current.otherwise;
      current = nextId ? byId.get(nextId) : undefined;
    } else {
      via = null;
      current = current.next ? byId.get(current.next) : undefined;
    }
  }
  return path;
}

export interface Problem {
  where: string;
  what: string;
}

/**
 * Everything wrong with the document, said plainly.
 *
 * The builder's real job. A form that silently never shows a field, or a
 * workflow step that reads a question somebody deleted, is worse than
 * one that refuses to save — because it looks finished.
 */
export function problems(form: BuiltForm): Problem[] {
  const out: Problem[] = [];
  const keys = new Set(form.fields.map((f) => f.key));
  const ids = new Set(form.steps.map((s) => s.id));

  const seenKeys = new Set<string>();
  for (const f of form.fields) {
    if (seenKeys.has(f.key)) {
      out.push({ where: f.label || f.key, what: `Two questions share the key “${f.key}”, so one overwrites the other's answer.` });
    }
    seenKeys.add(f.key);

    for (const c of f.showWhen) {
      if (!keys.has(c.field)) {
        out.push({ where: f.label || f.key, what: `Shown only when “${c.field}” matches, but no question has that key.` });
      } else if (indexOfKey(form, c.field) >= indexOfKey(form, f.key)) {
        out.push({ where: f.label || f.key, what: `Depends on “${c.field}”, which is asked later — so it can never show.` });
      }
    }
    if (f.type === "lookup" && !form.sources.some((s) => s.id === f.sourceId)) {
      out.push({ where: f.label || f.key, what: "Set to read a data sheet, but no sheet is chosen." });
    }
    if ((f.type === "choice" || f.type === "multi") && f.options.length === 0) {
      out.push({ where: f.label || f.key, what: "Offers a choice with nothing to choose from." });
    }
  }

  for (const s of form.steps) {
    for (const c of s.when) {
      if (!keys.has(c.field)) {
        out.push({ where: s.label || s.id, what: `Tests “${c.field}”, but no question has that key.` });
      }
    }
    for (const [rel, target] of [["next", s.next], ["otherwise", s.otherwise]] as const) {
      if (target && !ids.has(target)) {
        out.push({ where: s.label || s.id, what: `Points ${rel} at a step that no longer exists.` });
      }
    }
    if (s.kind === "check" && (!s.next || !s.otherwise)) {
      out.push({ where: s.label || s.id, what: "A check needs somewhere to go for both answers." });
    }
    if (s.kind !== "end" && !s.next && s.kind !== "check") {
      out.push({ where: s.label || s.id, what: "Leads nowhere, and is not an ending." });
    }
  }

  if (form.steps.length > 0 && !form.steps.some((s) => s.kind === "start")) {
    out.push({ where: "The workflow", what: "Has no starting step." });
  }
  return out;
}

const indexOfKey = (form: BuiltForm, key: string) => form.fields.findIndex((f) => f.key === key);
