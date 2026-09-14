/**
 * The Training Week registration, version 2.
 *
 * v1 (`training-week-registration-2026`) is live and people have
 * registered on it, so it does not move: not its wording, not its look,
 * not the strings its answers are stored under. v2 is a NEW form built
 * from the live v1 document plus the coordinators' feedback round.
 *
 * Built FROM v1 rather than typed out, so everything the feedback did
 * not mention — keys, ids, stages, the steps, the confirmation question
 * — is v1's exactly. And not from TRAINING_WEEK_FORM, which has already
 * drifted from the live row (it has questions coordinators deleted).
 *
 * The trap is that an option string is three things at once: what the
 * registrant reads, what gets stored, and what every rule compares
 * against. Renaming one means rewriting every rule that names it in the
 * same pass, and then proving none was missed — a stale `is` value never
 * errors, the note it guards simply never shows. So the build ends by
 * checking itself, and refuses to hand back a document that fails.
 *
 * Pure module: no React, no I/O, no Prisma.
 */
import { REGISTRATION_FORM_SLUG_V2 } from "@/lib/allocation/symposium-2026";
import { optionLabel, sessionForOption } from "@/lib/training-week/schedule-2026";
import {
  BuiltFormSchema, parseForm,
  type BuiltForm, type Condition, type FormField, type Presentation, type WorkflowStep,
} from "./types";

/* ── the words ───────────────────────────────────────────────────────
 *
 * The coordinators' wording, kept. Where it has been touched at all it
 * is a typo, a capital or a comma splice, and each one is listed in the
 * hand-off rather than hidden here.
 */

export const LUMA_URL = "https://luma.com/wh30nh1n";
export const LUMA_LABEL = "BioHubNet 2026 Annual Symposium · Luma";
/** RichText syntax: the link reads as the event, not as an address. */
export const LUMA_LINK = `[${LUMA_LABEL}](${LUMA_URL})`;

/*
 * Question one (C9). NO COMMAS — `any of` splits its value on them, so a
 * comma inside an option silently breaks every rule that tests for it.
 * Longer than v1's, and longer than the flow chart's 60-character cap,
 * which is why these are new constants and not edits to training-week.ts:
 * that file feeds the chart, and the chart DROPS what it cannot parse.
 *
 * Two carry a grammar fix over the doc's wording ("into the … program",
 * "but have not been accepted into"). An option is a stored answer, so
 * that is only safe while v2 has no registrations — which is when it
 * was made. From the first one on, these strings are frozen too.
 */
export const V2_ACCEPTED = "I have been accepted into the ENGAGE or EXPERIENCE program";
export const V2_EQUIP_APPLIED = "I have previously submitted an EQUIP application";
export const V2_HAS_ACCOUNT = "I have created a BioHubNet training platform account but have not been accepted into a program";
export const V2_NO_ACCOUNT = "I have not participated in a BioHubNet program";
export const V2_BHN_STATUS_OPTIONS = [V2_ACCEPTED, V2_EQUIP_APPLIED, V2_HAS_ACCOUNT, V2_NO_ACCOUNT];
/** The two answers that mean "carry on and pick your sessions". */
export const V2_ELIGIBLE_STATUS = [V2_ACCEPTED, V2_EQUIP_APPLIED];

/* The Symposium question (C11). */
export const V2_SYMPOSIUM_REGISTERED = "Yes — I have already registered";
export const V2_SYMPOSIUM_PLANNING = "Not yet — I plan to register";
export const V2_SYMPOSIUM_NOT_ATTENDING = "No — I do not plan to attend";
export const V2_SYMPOSIUM_OPTIONS = [V2_SYMPOSIUM_REGISTERED, V2_SYMPOSIUM_PLANNING, V2_SYMPOSIUM_NOT_ATTENDING];

/* Dietary (C16). The doc drops Vegetarian and the two allergies. */
export const V2_NO_DIET = "No dietary requirements";
export const V2_DIET_OTHER = "Other — please describe";
export const V2_DIET_OPTIONS = [V2_NO_DIET, "Vegan", "Halal", "Kosher", "Gluten-free", "Dairy-free", V2_DIET_OTHER];

/*
 * Communication Chameleon runs to 16:30 (C8). The v1 string stays
 * resolvable to the same Workshop through the schedule's
 * previousOptions — that alias lives in code, never in this document.
 */
export const V1_CHAMELEON = "Tue 27 Oct · 13:00–16:00 · Communication Chameleon";
export const V2_CHAMELEON = "Tue 27 Oct · 13:00–16:30 · Communication Chameleon";

/**
 * Said on the calendar cell (C10), by Workshop slug.
 *
 * Only these two. On the slot rather than read from the Workshop row, so
 * the number cannot start appearing on v1 because a table changed.
 */
export const V2_SLOT_CAPACITY: Readonly<Record<string, number>> = {
  "communication-chameleon-2026": 30,
  "negotiation-skills-2026": 30,
};

export const V2_TITLE = "BioHubNet Training Week 2026";
/** One plain line. It is the meta description; the page shows the intro instead. */
export const V2_DESCRIPTION =
  "BioHubNet Training Week, 26–28 October 2026 in Toronto, for HQPs accepted into ENGAGE, EXPERIENCE or EQUIP. Choose and rank the sessions you would like to attend.";

/**
 * The one promise about timing (C3). One constant for the intro and the
 * thank-you screen, so the form cannot say one date and the screen after
 * it another — which is what the default "two to three weeks" did.
 */
export const V2_SEAT_OFFER_TIMELINE =
  "The BioHubNet team will email you with seat offers during the last week of September.";

/**
 * Replaces the thank-you screen's default paragraph. Keeps what that
 * paragraph was for — why it takes a while, that everyone hears either
 * way, and when to chase — with the date swapped for the intro's.
 */
export const V2_CONFIRMATION_NOTE =
  `**${V2_SEAT_OFFER_TIMELINE}** Places are limited and every registration is reviewed together rather than as it arrives. ` +
  "We will write to you either way — whether or not we can offer you a place. " +
  "If you have not heard from us by early October, reply to the email and we will chase it.";

export const V2_PRESENTATION: Presentation = {
  theme: "site",
  heading: "BioHubNet Training Week",
  subheading: "26–28 October 2026 | Toronto",
  intro: [
    "Training Week events are only open to HQPs accepted into ENGAGE, EXPERIENCE, or EQUIP programs.",
    `Please select and rank the sessions you would like to attend. ${V2_SEAT_OFFER_TIMELINE}`,
    `The Annual Symposium on 29 October 2026 is a separate event. To register, visit the Symposium registration site: ${LUMA_LINK}`,
    "Questions marked * are required.",
  ],
  richText: true,
  gateInline: true,
  hideCalendarHint: true,
  hideRankNote: true,
  progress: "bar",
  hideWaitingHint: true,
  confirmationNote: V2_CONFIRMATION_NOTE,
};

/** C17. Bold because the coordinators wrote it in capitals on its own line. */
export const V2_SUBMIT_NOTE =
  "**PLEASE NOTE:** Photography, audio and video recording may occur throughout this event. Therefore, by attending Training Week events, you hereby authorize the University of Toronto to take your photograph, video and/or record your voice and grant the university all rights to these sounds, still or moving images in any medium for educational, promotional, marketing, advertising or other such purposes that support the mission of the university.";

interface Rewrite {
  label?: string;
  /** RichText: a line break is a paragraph. */
  help?: string;
  required?: boolean;
  /** Replaces the reason on the field's one cannotCombine rule. */
  cannotCombineReason?: string;
}

const para = (...lines: string[]) => lines.join("\n");

/** By field key. A key here that v1 does not have fails the build. */
const WORDING: Readonly<Record<string, Rewrite>> = {
  bhn_status: {
    label: "What is your current BioHubNet program status?",
    required: true,
    help: para(
      "Training Week is open to participants who are already in a BioHubNet program. Please note: Creating a BioHubNet training platform account alone does not constitute program participation.",
      // The doc's stray line, which sat inside the first option. It is
      // guidance, not an answer, and an option carrying it would be
      // stored as somebody's status.
      "Submitting an EQUIP application qualifies you for Training Week.",
    ),
  },
  need_programme_note: {
    label: "Step 1: Join a BioHubNet program",
    help: "Training Week is open to participants accepted into ENGAGE, EXPERIENCE, or EQUIP. For information about the programs and the eligibility requirements, please visit biohubnet.ca. Return to this form once you are accepted into a program.",
  },
  need_account_note: {
    label: "Step 1: Create an account and apply",
    help: para(
      "Create a BioHubNet training platform account, then proceed to apply to either ENGAGE or EXPERIENCE. Both programs are administered through the training platform, so create an account on the training platform before submitting your application.",
      "For information about the programs and their eligibility requirements, please visit biohubnet.ca. Return to this form once you are accepted into a program.",
    ),
  },
  trainee_email: {
    label: "Email registered with BioHubNet",
    required: true,
    help: "Please enter your institutional email address, or secondary email address registered with BioHubNet for verification.",
  },
  travel_over_2h: {
    label: "Is your one-way, door-to-door travel time to downtown Toronto > 2 hours?",
    help: "If yes, you may be eligible for travel assistance. We will contact you with details about the assistance available.",
  },
  postcode: {
    help: "Enter the first 3 characters of your postal code (e.g., M5V). This will be used to estimate travel distance.",
  },
  sessions: {
    label: "Choose and Rank Your Sessions",
    required: true,
    help: para(
      "Select as many sessions as you wish and rank them in order of preference. Sessions will be allocated based on your stated order of preference, subject to availability.",
      "Please note: Sessions displayed side by side in the calendar take place at the same time. You may select both sessions if you would be willing to attend either; however, you can only be approved for one.",
      "For the tours on Monday, 26 October, CCRM is in downtown Toronto, while Catalent is in London. Please select and rank the Monday tour you prefer.",
    ),
    // Said as a fact, not an instruction: the clash panel prints this
    // after its own dash and then "You can leave both chosen", so "please
    // select one" here would contradict the sentence under it.
    cannotCombineReason: "CCRM is in downtown Toronto and Catalent is in London, so you can only be approved for one Monday tour",
  },
  symposium_signup: {
    label: "Have you registered for the 2026 Annual Symposium?",
    required: true,
    help: para(
      `Please note that the Annual Symposium requires a separate registration: ${LUMA_LINK}`,
      "The Symposium takes place on Thursday, 29 October 2026. We encourage participants to attend both, as the Symposium provides an opportunity to build on and further your Training Week experience.",
    ),
  },
  symposium_link_note: {
    // Pointed at Luma, the real registration, rather than the event page.
    help: `No rush — it is a separate form and nothing here depends on it. When you want it: ${LUMA_LINK}`,
  },
  dietary: {
    label: "Dietary Requirements for Training Week Meals",
    help: "Please select all that apply:",
  },
};

/* ── the renames ─────────────────────────────────────────────────────
 *
 * Old string → new, per field key. `null` is an answer v2 no longer
 * offers, and a rule that still names one fails the build.
 *
 * STRICT tables must account for every option v1 has. If the live v1
 * has grown an answer since this was written, guessing where it goes is
 * how a rule ends up pointing at nothing — so it stops instead.
 */
interface RenameTable { strict: boolean; map: Readonly<Record<string, string | null>> }

const RENAMES: Readonly<Record<string, RenameTable>> = {
  bhn_status: {
    strict: true,
    map: {
      "Yes — accepted into ENGAGE or EXPERIENCE": V2_ACCEPTED,
      "Yes — I have previously submitted an EQUIP application": V2_EQUIP_APPLIED,
      "I have a training platform account but no program": V2_HAS_ACCOUNT,
      "I have no training platform account or BioHubNet program": V2_NO_ACCOUNT,
    },
  },
  symposium_signup: {
    strict: true,
    map: {
      "Yes — already signed up": V2_SYMPOSIUM_REGISTERED,
      "Not yet — I plan to": V2_SYMPOSIUM_PLANNING,
      "No — I am not attending the Symposium": V2_SYMPOSIUM_NOT_ATTENDING,
    },
  },
  dietary: {
    strict: true,
    map: {
      "No dietary requirements": V2_NO_DIET,
      Vegetarian: null,
      Vegan: "Vegan",
      Halal: "Halal",
      Kosher: "Kosher",
      "Gluten-free / coeliac": "Gluten-free",
      "Dairy-free / lactose intolerant": "Dairy-free",
      "Nut allergy": null,
      "Shellfish allergy": null,
      "Something else — I will describe it": V2_DIET_OTHER,
    },
  },
  // Not strict: five of the six sessions keep their strings. Identity is
  // checked afterwards — every option must reach the same Workshop.
  sessions: { strict: false, map: { [V1_CHAMELEON]: V2_CHAMELEON } },
};

/** The options each renamed question must end up with, in order. */
const EXPECTED_OPTIONS: Readonly<Record<string, string[]>> = {
  bhn_status: V2_BHN_STATUS_OPTIONS,
  symposium_signup: V2_SYMPOSIUM_OPTIONS,
  dietary: V2_DIET_OPTIONS,
};

/** Operators whose value names options. `answered`/`empty` name none. */
const VALUE_OPS: ReadonlySet<string> = new Set(["is", "is not", "any of", "contains"]);

function fail(what: string): never {
  throw new Error(`training-week-v2: ${what}`);
}

function renameOne(key: string, value: string, where: string): string | null {
  const table = RENAMES[key];
  if (!table) return value;
  if (Object.hasOwn(table.map, value)) return table.map[value];
  if (table.strict) {
    fail(`${where} names "${value}", which the rename table for "${key}" does not account for. v1 has changed since this was written — look before building.`);
  }
  return value;
}

function renameOptions(key: string, options: string[], where: string): string[] {
  const out: string[] = [];
  for (const o of options) {
    const next = renameOne(key, o, where);
    if (next !== null && !out.includes(next)) out.push(next);
  }
  return out;
}

function renameCondition(c: Condition, where: string): Condition {
  if (!VALUE_OPS.has(c.op) || c.value === undefined) return { ...c };
  const value = c.value
    .split(",")
    .map((part) => {
      const next = renameOne(c.field, part, where);
      if (next === null) fail(`${where} still tests for "${part}", which v2 no longer offers.`);
      return next;
    })
    .join(",");
  return { ...c, value };
}

function rewriteField(f: FormField): FormField {
  const w = WORDING[f.key] ?? {};
  const where = `question "${f.key}"`;

  const slots = f.slots.map((s) => {
    const option = renameOne(f.key, s.option, `${where} slot`);
    if (option === null) fail(`${where} draws "${s.option}", which v2 no longer offers.`);
    const session = f.key === "sessions" ? sessionForOption(option) : undefined;
    const capacity = session ? V2_SLOT_CAPACITY[session.slug] : undefined;
    return {
      ...s,
      option,
      // A session whose string moved takes its hours from the schedule,
      // which is what moved it. The calendar draws the cell from these and
      // the ranking list from the string, and the two must agree.
      ...(option !== s.option && session ? { day: session.day, start: session.start, end: session.end } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
    };
  });

  let cannotCombine = f.cannotCombine?.map((rule) => ({
    ...rule,
    options: rule.options.map((o) => {
      const next = renameOne(f.key, o, `${where} cannotCombine`);
      if (next === null) fail(`${where} cannotCombine names "${o}", which v2 no longer offers.`);
      return next;
    }),
  }));
  if (w.cannotCombineReason !== undefined) {
    if (cannotCombine?.length !== 1) fail(`${where} was expected to carry exactly one cannotCombine rule.`);
    cannotCombine = [{ ...cannotCombine[0], reason: w.cannotCombineReason }];
  }

  let exclusiveOption = f.exclusiveOption;
  if (exclusiveOption !== undefined) {
    const next = renameOne(f.key, exclusiveOption, `${where} exclusiveOption`);
    if (next === null) fail(`${where} exclusiveOption "${exclusiveOption}" is not offered by v2.`);
    exclusiveOption = next;
  }

  return {
    ...f,
    ...(w.label !== undefined ? { label: w.label } : {}),
    ...(w.help !== undefined ? { help: w.help } : {}),
    ...(w.required !== undefined ? { required: w.required } : {}),
    options: renameOptions(f.key, f.options, `${where} options`),
    slots,
    ...(cannotCombine ? { cannotCombine } : {}),
    ...(exclusiveOption !== undefined ? { exclusiveOption } : {}),
    showWhen: f.showWhen.map((c) => renameCondition(c, `${where} showWhen`)),
  };
}

/* ── the checks ──────────────────────────────────────────────────────── */

/** Key-order-free JSON, so two equal documents compare equal. */
export const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val);

const optionsOf = (doc: BuiltForm, key: string): string[] | null => {
  const f = doc.fields.find((x) => x.key === key);
  if (!f) return null;
  return f.type === "yesno" || f.type === "consent" ? ["Yes", "No"] : f.options;
};

const allConditions = (doc: BuiltForm): { where: string; c: Condition }[] => [
  ...doc.fields.flatMap((f) => f.showWhen.map((c) => ({ where: `question "${f.key}"`, c }))),
  ...doc.steps.flatMap((s: WorkflowStep) => s.when.map((c) => ({ where: `step "${s.id}"`, c }))),
];

const sessionSlugs = (doc: BuiltForm): string[] =>
  (doc.fields.find((f) => f.key === "sessions")?.options ?? [])
    .map((o) => sessionForOption(o)?.slug ?? `(unresolved) ${o}`);

/**
 * Everything wrong with a v2 document measured against the v1 it came
 * from, said plainly. Empty means it is safe to create.
 */
export function v2Problems(v1: BuiltForm, v2: BuiltForm): string[] {
  const out: string[] = [];

  const parsed = BuiltFormSchema.safeParse(v2);
  if (!parsed.success) out.push(`the schema refuses it: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  // parseForm DROPS what it cannot validate rather than failing, so a
  // question over a limit would vanish on the first read.
  if (canon(parseForm(JSON.parse(JSON.stringify(v2)))) !== canon(v2)) {
    out.push("it does not survive parseForm unchanged — something would be dropped on read");
  }

  // Shape: identical to v1 wherever the feedback did not reach.
  const shape = (d: BuiltForm) => d.fields.map((f) => [f.id, f.key, f.type, f.stage].join("|"));
  if (canon(shape(v1)) !== canon(shape(v2))) out.push("its questions' ids, keys, types or stages differ from v1");
  const flow = (d: BuiltForm) => d.steps.map((s) => [s.id, s.kind, s.next ?? "", s.otherwise ?? ""].join("|"));
  if (canon(flow(v1)) !== canon(flow(v2))) out.push("its workflow steps differ from v1");

  // No v1-only answer survives anywhere, rules and help included. v2's
  // own strings are masked first: "Not yet — I plan to" is inside
  // "Not yet — I plan to register" and is not a leftover there.
  const offered = (d: BuiltForm) => new Set(d.fields.flatMap((f) => [...f.options, ...f.slots.map((s) => s.option)]));
  const v2Offered = offered(v2);
  const gone = [...offered(v1)].filter((o) => !v2Offered.has(o));
  let text = JSON.stringify(v2);
  for (const o of [...v2Offered].sort((a, b) => b.length - a.length)) text = text.split(o).join(" ");
  for (const o of gone) if (text.includes(o)) out.push(`the v1 answer "${o}" is still in it`);

  // Every rule names an answer its question actually offers.
  const tested = new Set<string>();
  for (const { where, c } of allConditions(v2)) {
    tested.add(c.field);
    if (!VALUE_OPS.has(c.op)) continue;
    const opts = optionsOf(v2, c.field);
    if (!opts) { out.push(`${where} tests "${c.field}", which no question has`); continue; }
    const parts = (c.value ?? "").split(",");
    if ((c.op === "is" || c.op === "is not") && parts.length !== 1) out.push(`${where} "${c.op}" names more than one answer`);
    for (const p of parts) {
      if (!opts.includes(p)) out.push(`${where} ${c.op} "${p}", which "${c.field}" does not offer`);
    }
  }

  // Commas split a rule's value, so none in any answer a rule could read,
  // nor in anything else that is matched by string.
  for (const f of v2.fields) {
    const matched = [
      ...(tested.has(f.key) ? f.options : []),
      ...f.slots.map((s) => s.option),
      ...(f.cannotCombine ?? []).flatMap((r) => r.options),
      ...(f.exclusiveOption ? [f.exclusiveOption] : []),
    ];
    for (const o of matched) if (o.includes(",")) out.push(`"${f.key}" option "${o}" has a comma`);
    if (f.exclusiveOption && !f.options.includes(f.exclusiveOption)) {
      out.push(`"${f.key}" exclusiveOption "${f.exclusiveOption}" is not one of its options`);
    }
    for (const r of f.cannotCombine ?? []) {
      for (const o of r.options) if (!f.options.includes(o)) out.push(`"${f.key}" cannotCombine names "${o}", which it does not offer`);
    }
  }

  // The renamed questions carry exactly the new answers.
  for (const [key, want] of Object.entries(EXPECTED_OPTIONS)) {
    if (canon(optionsOf(v2, key)) !== canon(want)) out.push(`"${key}" does not offer exactly the v2 answers`);
  }

  // Sessions: the same six Workshops, in the same order, every one drawn.
  const s1 = sessionSlugs(v1);
  const s2 = sessionSlugs(v2);
  if (canon(s1) !== canon(s2)) out.push(`its sessions reach ${s2.join(", ")} where v1 reaches ${s1.join(", ")}`);
  for (const slug of s2) if (slug.startsWith("(unresolved)")) out.push(`session option ${slug.slice(13)} reaches no Workshop`);
  const sessions = v2.fields.find((f) => f.key === "sessions");
  if (sessions) {
    if (sessions.slots.length !== sessions.options.length) out.push("the sessions question does not draw every option");
    for (const s of sessions.slots) {
      if (!sessions.options.includes(s.option)) out.push(`slot "${s.option}" is not an offered option`);
      const session = sessionForOption(s.option);
      if (session && (session.day !== s.day || session.start !== s.start || session.end !== s.end)) {
        out.push(`slot "${s.option}" runs ${s.start}–${s.end}, the schedule says ${session.start}–${session.end}`);
      }
      if (session && optionLabel(session) !== s.option) out.push(`slot "${s.option}" is not the schedule's current string`);
      const want = session ? V2_SLOT_CAPACITY[session.slug] : undefined;
      if (s.capacity !== want) out.push(`slot "${s.option}" says capacity ${s.capacity ?? "none"}, expected ${want ?? "none"}`);
    }
  }
  return out;
}

/* ── the build ───────────────────────────────────────────────────────── */

export interface TrainingWeekV2 {
  slug: string;
  title: string;
  description: string;
  doc: BuiltForm;
}

/**
 * v2, from the live v1 row.
 *
 * Throws rather than returning something half right: the output of this
 * is created on a public URL, and a document that fails its own checks
 * is not a draft, it is a bug with a link.
 */
export function buildTrainingWeekV2(v1: { title: string; description: string | null; fields: unknown }): TrainingWeekV2 {
  // Copied before anything reads it. zod hands back new objects anyway,
  // but "the frozen form is probably not mutated" is not a property worth
  // relying on when the input is the live v1.
  const raw = structuredClone(v1.fields);
  const source = parseForm(raw);

  // parseForm drops a malformed question silently. Building v2 on top of
  // that would lose it from v2 too, with nothing said.
  const rawCount = Array.isArray((raw as { fields?: unknown[] } | null)?.fields)
    ? (raw as { fields: unknown[] }).fields.length
    : 0;
  if (rawCount !== source.fields.length) {
    fail(`v1 has ${rawCount} questions but only ${source.fields.length} parse — refusing to build on a partial read.`);
  }
  for (const key of [...Object.keys(WORDING), ...Object.keys(RENAMES)]) {
    if (!source.fields.some((f) => f.key === key)) fail(`v1 has no question "${key}" to carry the feedback for.`);
  }

  const doc: BuiltForm = {
    version: 1,
    fields: source.fields.map(rewriteField),
    sources: source.sources,
    steps: source.steps.map((s) => ({ ...s, when: s.when.map((c) => renameCondition(c, `step "${s.id}"`)) })),
    submitNote: V2_SUBMIT_NOTE,
    presentation: V2_PRESENTATION,
  };

  const problems = v2Problems(source, doc);
  if (problems.length > 0) fail(`the built document fails its checks:\n  - ${problems.join("\n  - ")}`);

  return {
    slug: REGISTRATION_FORM_SLUG_V2,
    title: V2_TITLE,
    description: V2_DESCRIPTION,
    doc: BuiltFormSchema.parse(doc),
  };
}
