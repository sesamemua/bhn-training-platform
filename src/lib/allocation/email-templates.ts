/**
 * The letters Training Week sends, and the words they start from.
 *
 * Registration is a conversation with a person who applied and is now
 * waiting. Most of what goes wrong in that conversation is silence —
 * somebody registers and hears nothing for a month, or gets a place and
 * is never told what it costs them to keep it. So the stages are written
 * down as templates rather than typed fresh each time, and every one of
 * them says what happens next and by when.
 *
 * DEFAULTS LIVE IN CODE, EDITS LIVE IN THE DATABASE. Only the changed
 * subject and body are stored, keyed by template id. Three things fall
 * out of that: a new template added here appears for the coordinator
 * without a migration, "reset to the original" is just dropping the
 * override, and an edit to wording somebody relies on cannot be undone
 * by a deploy.
 *
 * Pure module: no React, no I/O.
 */
import { z } from "zod";

/** Where the overrides and the support-form link are stored. */
export const TEMPLATES_KEY = "trainingWeek.emailTemplates";
export const SUPPORT_URL_KEY = "trainingWeek.supportFormUrl";

/* ── merge fields ────────────────────────────────────────────────── */

export interface MergeField {
  key: string;
  /** What it becomes, said to whoever is editing a template. */
  means: string;
  /** What it looks like in the preview. */
  sample: string;
  /**
   * True when the value comes from ONE booking.
   *
   * It is the difference between a letter that can go to the whole week
   * and one that can only go to a single room: "your session is at
   * 11:00" is a lie to anybody whose session is not.
   */
  perSession?: boolean;
}

export const MERGE_FIELDS: MergeField[] = [
  { key: "first_name", means: "Their first name, or “there” if we have no name", sample: "Amara" },
  { key: "name", means: "Their full name, or “there”", sample: "Amara Okonkwo" },
  { key: "event", means: "The event this is about", sample: "BioHubNet Training Week 2026" },
  { key: "session", means: "The session they booked", sample: "CCRM tour + Lunch & Learn", perSession: true },
  { key: "session_date", means: "The day it runs", sample: "Monday 26 October", perSession: true },
  { key: "session_time", means: "The hours it runs, Toronto time", sample: "11:00–13:30", perSession: true },
  { key: "session_venue", means: "Where it is, or “to be confirmed”", sample: "CCRM (to be confirmed)", perSession: true },
  { key: "reply_by", means: "The date a reply is needed by", sample: "Monday 19 October" },
  { key: "check_in_link", means: "Self check-in for this session — it opens 30 minutes before the start. Drawn as a button", sample: "https://…/training-week/pass/…/check-in/…", perSession: true },
  { key: "cant_attend_link", means: "Where they cancel their place in this session. Drawn as a button; no reason is asked for", sample: "https://…/training-week/pass/…/cant-attend/…", perSession: true },
  { key: "pass_link", means: "Their Training Week pass — the QR they show at the door of every session", sample: "https://…/training-week/pass/…" },
  { key: "postcode", means: "The first three characters of the postal code they gave", sample: "M5V" },
  { key: "travel_time", means: "How long that postal code is from 144 College Street", sample: "about 15\u201345 minutes" },
  { key: "school", means: "The university or college their email address belongs to", sample: "Queen's University" },
  { key: "school_city", means: "Where that university or college is", sample: "Kingston" },
  { key: "school_travel_time", means: "How far that is from 144 College Street", sample: "about 2½ hours" },
  { key: "support_form_link", means: "The travel and accommodation form", sample: "https://…" },
  { key: "coordinator", means: "Who signs the message off", sample: "The BioHubNet team" },
];

const FIELD_KEYS = new Set(MERGE_FIELDS.map((f) => f.key));
const PER_SESSION = new Set(MERGE_FIELDS.filter((f) => f.perSession).map((f) => f.key));

/** Every {{field}} used in a piece of text, in the order it appears. */
export function fieldsUsed(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Everything written in double braces, whatever is inside them.
 *
 * DELIBERATELY looser than `fieldsUsed`. A field name is letters and
 * underscores, so `{{first-name}}`, `{{session2}}` and `{{first.name}}`
 * are not fields at all — which meant they slipped past the check
 * entirely and were posted to people exactly as typed. Detection has to
 * see anything that LOOKS like a field; substitution stays strict.
 *
 * Bounded to 60 characters and stopped at a newline: an unbounded match
 * swallows whole paragraphs and turns the warning into a wall of text.
 */
export function bracedNames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{([^{}\n]{1,60})\}\}/g)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Fields that are written but do not exist — a typo about to be posted. */
export const unknownFields = (text: string) => bracedNames(text).filter((f) => !FIELD_KEYS.has(f));

/** True when this text can only honestly go to one session's list. */
export const needsOneSession = (text: string) => fieldsUsed(text).some((f) => PER_SESSION.has(f));

/**
 * Fill a template in.
 *
 * A field with no value is left as its own placeholder rather than
 * silently becoming an empty string, because "your session is at " is
 * worse than an obviously unfinished letter, and the caller is given the
 * list so it can refuse to send at all.
 */
export function render(text: string, vars: Record<string, string | undefined>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (whole, key: string) => {
    const v = vars[key];
    if (v === undefined || v === "") {
      if (!missing.includes(key)) missing.push(key);
      return whole;
    }
    return v;
  });
  return { text: out, missing };
}

/* ── the templates ───────────────────────────────────────────────── */

export const STAGES = ["registration", "support", "reminders"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  registration: "Registration",
  support: "Travel & accommodation",
  reminders: "Before the day",
};

export interface EmailTemplate {
  id: string;
  stage: Stage;
  /** What it is, in the list. */
  name: string;
  /** When a coordinator should reach for it. */
  when: string;
  subject: string;
  body: string;
}

/* Just the team's name: every message now ends with the BioHubNet
   signature (name, address, newsletter, LinkedIn) added by sendMail, and
   "BioHubNet" on its own line above it said the same thing twice. */
const SIGN_OFF = "\n\n{{coordinator}}";

/**
 * The starting wording.
 *
 * Written to be read by somebody who is anxious about the answer, so:
 * the outcome in the first line, what happens next with a date on it,
 * and no cheer that the situation does not support. A decline that opens
 * with "Thank you so much for your fantastic application" is a worse
 * letter than one that says what happened.
 */
export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "received",
    stage: "registration",
    name: "Registration received",
    when: "Sent automatically the moment somebody submits the registration form. It is the letter that stops them wondering.",
    subject: "We have your registration for {{event}}",
    body:
      `Hello {{first_name}},

We have your registration for {{event}}. This note is to say so, and to tell you how long the wait actually is.

Places are limited and every registration is reviewed together rather than as it arrives, so it takes us two to three weeks to come back to you. We will write to you either way, whether or not we can offer you a place — you do not need to do anything in the meantime. If you have not heard from us after three weeks, reply to this message and we will chase it.

Current BioHubNet trainees are given priority consideration. If you asked for travel or accommodation support, that is assessed separately and we will write to you about it.` + SIGN_OFF,
  },
  {
    id: "approved",
    stage: "registration",
    name: "Place approved",
    when: "When a seat is granted. No further response is required.",
    subject: "Your place at {{event}}: {{session}}",
    body:
      `Hello {{first_name}},

You have a place at {{session}}.

  When:  {{session_date}}, {{session_time}}

Location information will be provided in future communications.

Your seat in this session has been confirmed. Please add it to your calendar. You don't need to reply.

If you can't make it, withdraw here so the place can go to somebody else:
{{cant_attend_link}}

A no-show may affect your eligibility for future BioHubNet training and programmes.` + SIGN_OFF,
  },
  // No standing letters for "no place", "not this session" or "on the
  // waitlist": those go in the one decision email each person gets
  // (see person-letter.ts), so there is nothing separate to edit here.
  {
    id: "waitlist_promoted",
    stage: "registration",
    name: "A place has opened up",
    when: "When somebody moves off the waitlist into a seat.",
    subject: "A place has opened up: {{session}}",
    body:
      `Hello {{first_name}},

A place has come free at {{session}}, and your seat in this session has been confirmed.

  When:  {{session_date}}, {{session_time}}

Location information will be provided in future communications.

Please add the session to your calendar. You don't need to reply.

If you can't make it, withdraw here:
{{cant_attend_link}}` + SIGN_OFF,
  },
  {
    id: "seat_released",
    stage: "registration",
    name: "Place released",
    when: "When somebody tells us they cannot come and their seat is released.",
    subject: "Update: your place at {{session}} has been released",
    body:
      `Hello {{first_name}},

Your place in this session has been released, so it can go to somebody who is waiting for one:
  • {{session}} — {{session_date}}, {{session_time}}

If it is in your calendar, please remove it.

Thank you for letting us know — that is what makes the waitlist work. Nothing else is affected: any other sessions you have a place at still stand.` + SIGN_OFF,
  },
  {
    id: "support_invite",
    stage: "support",
    name: "Travel and accommodation — more details needed",
    when: "When somebody asked for support and we need the details to assess it.",
    subject: "Travel and accommodation support — a few more details",
    body:
      `Hello {{first_name}},

You asked about travel or accommodation support for {{event}}. To assess it we need a little more from you.

Please fill in this short form:
{{support_form_link}}

It asks where you are travelling from, what you expect it to cost, and whether you need somewhere to stay. It takes a few minutes.

Please send it back by {{reply_by}}. Support is limited and we assess requests together once, so a form that arrives after that date cannot be considered.` + SIGN_OFF,
  },
  {
    id: "support_approved",
    stage: "support",
    name: "Support granted",
    when: "When travel or accommodation support is agreed.",
    subject: "Your travel and accommodation support for {{event}}",
    body:
      `Hello {{first_name}},

We are able to support your travel to {{event}}. The details of what is covered, and what we need from you to reimburse it, are below.

  TO FILL IN: what is covered, and up to how much
  TO FILL IN: which receipts we need, and the date we need them by

Please keep your receipts — we cannot reimburse anything we have no record of. If your plans change and you no longer need the support, tell us, because it can go to somebody else.` + SIGN_OFF,
  },
  {
    id: "support_verify_travel",
    stage: "support",
    name: "Travel support — verifying the journey",
    when: "When somebody said their journey is over two hours but gave nothing to check it against (no postal code).",
    subject: "About your travel to {{event}} — a quick check",
    body:
      `Hello {{first_name}},

When you registered for {{event}}, you told us your one-way journey is more than two hours. Before we arrange travel support, we need to verify that.

Please reply to this message and tell us:

  1. Where will you be travelling from? (city, and the first three characters of your postal code)
  2. How will you travel — train, bus, car or flight?

Travel support is for journeys over two hours each way. Your place at the sessions is not affected by this.` + SIGN_OFF,
  },
  {
    id: "support_next_steps",
    stage: "support",
    name: "Travel support — reviewed, next steps",
    when: "When somebody's journey is over two hours and we need their travel and hotel plans.",
    subject: "Your travel to {{event}} — next steps",
    body:
      `Hello {{first_name}},

We have reviewed your registration for {{event}} and your one-way journey is over two hours, so you qualify for travel support.

To arrange it, please reply to this message and tell us:

  1. Do you need a hotel room booked for you? If so, for which nights?
  2. How will you travel to Toronto — train, bus, car or flight — and where from?

We will confirm the details once we have your answers.` + SIGN_OFF,
  },
  {
    /*
     * The one letter here that is asking a question rather than giving
     * an answer, and the only one where the recipient might feel
     * accused. So it says what we see, says plainly that the estimate
     * may be the thing that is wrong, and asks. Nobody is told they
     * made a mistake, and their seat is never in question.
     */
    id: "support_check_postcode",
    stage: "support",
    name: "Travel support — checking the journey",
    when: "When somebody asked for travel support but the postal code they gave is well inside two hours.",
    subject: "About your travel support request for {{event}}",
    body:
      `Hello {{first_name}},

You asked about travel support for {{event}} and told us your one-way journey is more than two hours. The postal code you gave us, {{postcode}}, works out at {{travel_time}} from 144 College Street, Toronto (BioHubNet) — under two hours, which is why I am writing rather than simply processing it.

The estimate may well be the thing that is wrong. It is worked out from the first three characters of a postal code, so it knows nothing about where you actually set off from in the morning, which bus or train you are on, or whether you are travelling from somewhere else that week.

So: if your journey really is over two hours each way, reply to this message and tell us the trip you would make — where you would be starting from, and the first service that gets you here in time. We will look at it again.

If it is under two hours, there is nothing you need to do, and nothing has gone wrong. Travel support is only for journeys over two hours each way, so we would not be able to cover this one — but your place at the session is not affected at all, and we will see you there.` + SIGN_OFF,
  },
  {
    /*
     * The other way round from the postal-code check: they said local
     * (or said nothing), but registered with an address at a university
     * over two hours away. Nothing is wrong — most such students live in
     * Toronto — so the letter only asks, and says what changes if the
     * answer is "far".
     */
    id: "support_check_email",
    stage: "support",
    name: "Travel — checking where they are coming from",
    when: "When somebody said they are local (or said nothing) but registered with an address at a university over two hours away.",
    subject: "A quick question about your trip to {{event}}",
    body:
      `Hello {{first_name}},

Thank you for registering for {{event}}. A quick question before we plan the sessions.

You registered with your {{school}} address, and {{school_city}} is {{school_travel_time}} from 144 College Street, Toronto (BioHubNet). Where will you be travelling from on the day?

If you are staying in Toronto that week, there is nothing to do — just let us know and we will see you there.

If you are coming from further away and the one-way trip is over two hours, reply and tell us where you will be starting from. Travel support is available for journeys over two hours each way, and we will send you the details.` + SIGN_OFF,
  },
  {
    id: "support_declined",
    stage: "support",
    name: "Support not available",
    when: "When support cannot be offered. Their place is not affected — say so.",
    subject: "About your travel and accommodation request",
    body:
      `Hello {{first_name}},

We are not able to offer travel or accommodation support for {{event}} this year. The fund was smaller than the number of requests, and it went to the applicants travelling furthest.

Your place at the session is not affected. You are still expected and still welcome — this is only about the costs of getting there.

If that makes attending impossible, tell us. We would rather know early enough to offer the place to somebody else than have an empty seat on the day.` + SIGN_OFF,
  },
  {
    id: "reminder_3day",
    stage: "reminders",
    name: "Three days before",
    when: "Three days out. A self check-in button; no withdraw link.",
    subject: "{{session}} is in three days",
    body:
      `Hello {{first_name}},

A reminder that {{session}} is in three days.

  When:  {{session_date}}, {{session_time}}
  Where: {{session_venue}}

On the day, check yourself in here — it opens 30 minutes before the session starts:
{{check_in_link}}

A no-show may affect your eligibility for future BioHubNet training and programmes.` + SIGN_OFF,
  },
  {
    id: "reminder_same_day",
    stage: "reminders",
    name: "On the day",
    when: "The morning of. Everything they need in the first three lines.",
    subject: "Today: {{session}}",
    body:
      `Hello {{first_name}},

{{session}} is today.

  Time:  {{session_time}}
  Where: {{session_venue}}

Check yourself in here — it opens 30 minutes before the session starts:
{{check_in_link}}

Please arrive ten minutes early. If you are running late, reply to this message and we will let the room know.

See you there.` + SIGN_OFF,
  },
];

/* ── overrides ───────────────────────────────────────────────────── */

/**
 * The limits, in one place.
 *
 * They used to live only in the schema, which is the READ path — so an
 * over-long body saved happily, reported success, and was then dropped
 * on the next read, taking the previous good wording with it.
 */
export const SUBJECT_MAX = 200;
export const BODY_MAX = 20000;

export const OverrideSchema = z.object({
  id: z.string().min(1).max(60),
  subject: z.string().max(SUBJECT_MAX),
  body: z.string().max(BODY_MAX),
});
export type Override = z.infer<typeof OverrideSchema>;

const OverridesSchema = z.array(OverrideSchema).max(100);

/**
 * Read the stored edits, dropping anything unreadable.
 *
 * A broken row must not take the whole set of letters with it — the
 * default wording is better than an admin page that will not open.
 */
export function parseOverrides(raw: string | null | undefined): Override[] {
  if (!raw) return [];
  try {
    const parsed = OverridesSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    // Salvage: keep the rows that are fine, drop the ones that are not.
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => OverrideSchema.safeParse(r)).flatMap((r) => (r.success ? [r.data] : []));
  } catch {
    return [];
  }
}

export interface ResolvedTemplate extends EmailTemplate {
  /** True when a coordinator has changed this one from the original. */
  edited: boolean;
}

/** The templates as they should be shown: defaults, with edits applied. */
export function resolveTemplates(overrides: Override[]): ResolvedTemplate[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  return DEFAULT_TEMPLATES.map((t) => {
    const o = byId.get(t.id);
    // An override that merely repeats the default is treated as ABSENT,
    // not as an edit that happens to match. Otherwise saving the shipped
    // words back — or leaving a trailing space in the subject, which is
    // trimmed on the way in — writes a row that wins silently, cannot be
    // cleared from the page because the reset button is hidden, and pins
    // that wording through every future deploy. Self-heals rows already
    // written, which a guard on the write path alone could not.
    if (!o || !isEdit(t, o)) return { ...t, edited: false };
    return { ...t, subject: o.subject, body: o.body, edited: true };
  });
}

/** Does this stored row actually differ from the shipped wording? */
export const isEdit = (t: EmailTemplate, o: { subject: string; body: string }) =>
  o.subject.trim() !== t.subject.trim() || o.body !== t.body;

export const templateById = (id: string) => DEFAULT_TEMPLATES.find((t) => t.id === id);

/** Everything wrong with a template, said plainly, before it is saved. */
export function problemsWith(subject: string, body: string): string[] {
  const out: string[] = [];
  if (!subject.trim()) out.push("It needs a subject.");
  if (!body.trim()) out.push("It needs a message.");
  // Measured on what is STORED — the subject is trimmed on the way in,
  // so checking the untrimmed length would refuse one that would fit.
  if (subject.trim().length > SUBJECT_MAX) {
    out.push(`The subject is ${subject.trim().length} characters; the most it can be is ${SUBJECT_MAX}.`);
  }
  if (body.length > BODY_MAX) {
    out.push(`The message is ${body.length} characters; the most it can be is ${BODY_MAX}.`);
  }
  for (const f of [...unknownFields(subject), ...unknownFields(body)]) {
    out.push(`“{{${f}}}” is not a field — it would be sent to people exactly as written.`);
  }
  return [...new Set(out)];
}

/**
 * Why a message may not go to this audience, or null if it may.
 *
 * ONE implementation, called by the send action and by the tab that
 * warns before you get there. It was written out three times — twice as
 * a condition and once as the sentence explaining it — which is how a
 * warning and the refusal it warns about end up disagreeing.
 */
export function refusesMultiSession(subject: string, body: string, manySessions: boolean): string | null {
  if (!manySessions || !needsOneSession(`${subject}\n${body}`)) return null;
  return "This message names a session, but the audience covers more than one — some people would be told a time that is not theirs. Pick a single workshop, or take the session details out.";
}

/**
 * Fields the SENDER has to supply that are still empty.
 *
 * Only the ones that are the same for everybody. A per-session gap is
 * deliberately a per-recipient skip, but a missing support-form link
 * fails the entire list — and it used to do that only after taking the
 * send lock and writing an audit row claiming N recipients, so the one
 * record of the attempt said it reached people it never wrote to.
 */
export const GLOBAL_FIELDS = ["event", "reply_by", "support_form_link", "coordinator"] as const;

export function unfilledGlobals(subject: string, body: string, vars: Record<string, string | undefined>): string[] {
  const used = new Set(fieldsUsed(`${subject}\n${body}`));
  return GLOBAL_FIELDS.filter((f) => used.has(f) && !vars[f]);
}
