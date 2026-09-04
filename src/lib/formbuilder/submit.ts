/**
 * Checking a submission on the server, where it counts.
 *
 * Everything the fill view enforces is enforced again here. Not
 * belt-and-braces: the browser's copy of the rules is a courtesy to the
 * person filling the form in, and a server action is a public endpoint
 * that anybody can call with anything. A cap that only exists in a
 * disabled button is not a cap.
 *
 * Pure module: no React, no Prisma. It takes a form and some answers
 * and says what is wrong with them.
 */
import { missing, optionsFor, visibleFields, type Answers } from "./logic";
import type { BuiltForm, FieldStage, FormField } from "./types";

export interface Verdict {
  ok: boolean;
  /** Said to the person, one line each, naming the question. */
  problems: string[];
  /** The answers as they should be stored: visible, known, trimmed. */
  clean: Answers;
}

const asList = (v: unknown): string[] => {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String).filter((x) => x.trim().length > 0);
  return [String(v)];
};

export function checkSubmission(
  form: BuiltForm,
  answers: Answers,
  stage: FieldStage = "registration",
): Verdict {
  const problems: string[] = [];
  const shown = visibleFields(form, answers, stage);

  /*
   * Only what was ASKED is kept.
   *
   * An answer to a question this person never saw — because they said
   * they were new to BioHubNet, or because it belongs to the
   * confirmation stage — is not their answer. Storing it would put
   * something in the registrant sheet that nobody was ever shown, and
   * the first person to notice would rightly not believe the rest.
   */
  const clean: Answers = {};
  for (const f of shown) {
    if (f.type === "note") continue;
    const raw = answers[f.key];
    if (raw === undefined) continue;

    if (f.type === "multi") {
      const offered = new Set(optionsFor(form, f));
      const picked = asList(raw).filter((o) => offered.has(o));
      const dropped = asList(raw).length - picked.length;
      if (dropped > 0) problems.push(`“${f.label}” includes ${dropped} answer${dropped === 1 ? "" : "s"} that is not on the list.`);

      if (f.maxChoices !== undefined && picked.length > f.maxChoices) {
        problems.push(`“${f.label}” takes at most ${f.maxChoices}; ${picked.length} were sent.`);
      }
      // The exclusive option is exclusive on the server too, or the
      // caterer gets "no requirements" and "vegan" in one row.
      if (f.exclusiveOption && picked.includes(f.exclusiveOption) && picked.length > 1) {
        problems.push(`“${f.exclusiveOption}” cannot be combined with anything else.`);
      }
      clean[f.key] = picked;
      continue;
    }

    if ((f.type === "choice" || f.type === "lookup" || f.type === "yesno" || f.type === "consent")) {
      const offered = f.type === "yesno" || f.type === "consent" ? ["Yes", "No"] : optionsFor(form, f);
      const value = String(raw).trim();
      if (value && !offered.includes(value)) {
        problems.push(`“${f.label}” was answered with something that is not one of its options.`);
        continue;
      }
      if (value) clean[f.key] = value;
      continue;
    }

    const text = String(raw).trim();
    if (text) clean[f.key] = text.slice(0, 5000);
  }

  // Required-and-empty, computed from the CLEANED answers: an answer
  // that was dropped for not being on the list has not been given.
  for (const f of missing(form, clean, stage)) {
    problems.push(`“${f.label}” needs an answer.`);
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)], clean };
}

/**
 * The email to file a submission under.
 *
 * Prefers the question actually called "email"; falls back to the
 * trainee one, then to anything typed into an email field. A submission
 * with no address is still kept — losing somebody's registration
 * because they left a box blank is worse than a row that has to be
 * matched up by hand.
 */
export function emailFrom(form: BuiltForm, answers: Answers): string | null {
  const pick = (key: string) => {
    const v = answers[key];
    return typeof v === "string" && v.includes("@") ? v.trim().toLowerCase() : null;
  };
  const named = pick("email") ?? pick("trainee_email");
  if (named) return named;
  for (const f of form.fields) {
    if (f.type !== "email") continue;
    const v = pick(f.key);
    if (v) return v;
  }
  return null;
}

/**
 * The question that draws a week.
 *
 * Which field is the session picker is a rule, not an observation, and
 * it was about to be written out a second time on the confirmation
 * screen — which needs the field itself, not just the strings, to draw
 * the same calendar back. One function, so a form with two multi
 * questions cannot have the picker mean one thing while filling in and
 * another on the receipt.
 */
export function sessionField(form: BuiltForm): FormField | undefined {
  return form.fields.find((x) => x.type === "multi" && x.slots.length > 0);
}

/** The sessions somebody chose, in the order they ranked them. */
export function rankedSessions(form: BuiltForm, answers: Answers): string[] {
  const f = sessionField(form);
  if (!f) return [];
  const offered = new Set(optionsFor(form, f));
  return asList(answers[f.key]).filter((o) => offered.has(o));
}
