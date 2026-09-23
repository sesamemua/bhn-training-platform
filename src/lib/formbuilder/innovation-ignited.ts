/**
 * Innovation Ignited, registering on its own.
 *
 * The Wednesday session is open in a way the rest of the week is not:
 * anybody may come, so there is no programme list to check an address
 * against and no calendar to choose from. It still has to end up in the
 * same room as everybody else — `presentation.session` names the
 * session and makeSeats books a seat against that workshop, exactly as
 * a pick from the week's calendar does.
 *
 * Built FROM the live Training Week document rather than typed out, so
 * the questions both forms ask are the same questions: same wording,
 * same options, same keys. A second copy of "Dietary requirements"
 * drifts from the first the week somebody edits one of them.
 *
 * Pure module: no Prisma, no React.
 */
import { optionLabel, SESSIONS } from "@/lib/training-week/schedule-2026";
import { BuiltFormSchema, parseForm, type BuiltForm, type FormField } from "./types";

export const INNOVATION_IGNITED_SLUG = "innovation-ignited-2026";
export const INNOVATION_IGNITED_TITLE = "Innovation Ignited 2026";

/** The session every registration on this form is a seat for. */
export const INNOVATION_SESSION = SESSIONS.find((s) => s.slug === "innovation-showcase-2026")!;

/** Questions taken from the Training Week form, in the order they are asked. */
export const SHARED_KEYS = ["full_name", "question", "dietary", "dietary_other"] as const;

/**
 * What to ask when the shared document does not carry the question.
 *
 * v1 of Training Week had no "Full name" — it asked for the address
 * the programme has on file and looked the person up. A form built
 * against that one still has to ask somebody their name.
 */
const FALLBACKS: Record<string, FormField> = {
  full_name: {
    id: "ii_name", key: "full_name", label: "Full name", type: "short_text", required: true, options: [],
    help: "First and last name, as you would like it on your name badge.",
    showWhen: [], slots: [],
  } as unknown as FormField,
};

/** Questions this form asks that Training Week does not. */
const OWN_FIELDS: FormField[] = [
  {
    id: "ii_email", key: "email", label: "Email", type: "email", required: true, options: [],
    help: "Any address you check — it does not have to be an institutional one.",
    showWhen: [], slots: [],
  } as unknown as FormField,
  {
    id: "ii_position", key: "position_title", label: "Position title", type: "short_text", required: true, options: [],
    help: "What you do, in your own words — PhD student, Scientist, Founder.",
    showWhen: [], slots: [],
  } as unknown as FormField,
  {
    id: "ii_institution", key: "institution", label: "Institution or company", type: "short_text", required: true, options: [],
    help: "Type your own — whatever you would want printed beside your name.",
    showWhen: [], slots: [],
  } as unknown as FormField,
];

/**
 * The order the questions are asked in.
 *
 * Name, then how to reach them, then who they are, then what the room
 * has to know. Anything the shared document does not have is simply
 * left out rather than invented here.
 */
const ORDER = ["full_name", "email", "position_title", "institution", "question", "dietary", "dietary_other"];

export interface BuiltInnovationForm {
  doc: BuiltForm;
  /** Keys taken from the Training Week form, for the hand-off. */
  shared: string[];
  problems: string[];
}

/**
 * Build the form from the live Training Week document.
 *
 * `source` is the parsed v2 document. A key it does not carry is not a
 * failure: the form is built without it and the caller is told, which
 * is better than a build that refuses because somebody renamed a
 * question in the builder.
 */
export function buildInnovationIgnited(source: BuiltForm): BuiltInnovationForm {
  const problems: string[] = [];
  const shared: string[] = [];
  const taken = SHARED_KEYS.map((key) => {
    const field = source.fields.find((f) => f.key === key);
    if (field) { shared.push(key); return field; }
    const fallback = FALLBACKS[key];
    if (!fallback) problems.push(`the Training Week form has no "${key}" question to share`);
    return fallback;
  }).filter((f): f is FormField => Boolean(f));

  const here = new Set([...SHARED_KEYS, ...OWN_FIELDS.map((f) => f.key)]);
  const fields = [...taken, ...OWN_FIELDS]
    /*
     * A rule may only name a question this form asks.
     *
     * The Training Week copies carry conditions about programme status
     * and registration stages that do not exist here — "show this when
     * bhn_status is one of…" on a form with no bhn_status is a question
     * nobody can ever reach. What survives is the rule between two
     * questions that both moved: dietary → tell us about it.
     */
    .map((f) => ({
      ...f,
      stage: undefined,
      showWhen: f.showWhen.filter((c) => here.has(c.field)),
    }))
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  const look = source.presentation ?? {};
  const doc = {
    version: 1 as const,
    fields,
    sources: [],
    steps: [],
    submitNote: source.submitNote,
    presentation: {
      theme: look.theme,
      richText: look.richText,
      progress: look.progress,
      hideWaitingHint: look.hideWaitingHint,
      homeLink: look.homeLink,
      heading: "Innovation Ignited",
      subheading: "Wednesday 28 October 2026 | Toronto",
      intro: [
        "A pitch competition for selected participants, followed by the venture showcase — three minutes a venture.",
        "Open to anyone: you do not need to be in a BioHubNet programme to come.",
      ],
      facts: [
        { label: "When", text: `${INNOVATION_SESSION.start}–${INNOVATION_SESSION.end}, Wednesday 28 October 2026` },
        { label: "Where", text: "In person, at or close to the University of Toronto St. George (downtown) campus." },
        { label: "Who can register", text: "Anyone. This session is open beyond the Training Week programmes." },
      ],
      formIntro: "Questions marked * are required.",
      // The seat this form books, and the room it books it in.
      session: optionLabel(INNOVATION_SESSION),
    },
  };

  const parsed = BuiltFormSchema.safeParse(doc);
  if (!parsed.success) problems.push(`the built form fails its own schema: ${parsed.error.issues[0]?.message}`);

  const built = parseForm(doc);
  for (const key of ORDER) {
    if (key === "dietary_other") continue;
    if (!built.fields.some((f) => f.key === key)) problems.push(`"${key}" did not survive the parser`);
  }
  // The one thing that would make this form a Training Week form: an
  // address checked against the programme lists.
  for (const key of ["trainee_email", "bhn_status", "sessions"]) {
    if (built.fields.some((f) => f.key === key)) problems.push(`"${key}" belongs to Training Week, not here`);
  }

  return { doc: built, shared, problems };
}
