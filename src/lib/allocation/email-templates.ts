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
import { CONFIRM_DAYS_BEFORE } from "@/lib/formbuilder/training-week";

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

/** Fields that are written but do not exist — a typo about to be posted. */
export const unknownFields = (text: string) => fieldsUsed(text).filter((f) => !FIELD_KEYS.has(f));

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

const SIGN_OFF = "\n\n{{coordinator}}\nBioHubNet";

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
    when: "As soon as somebody registers. It is the letter that stops them wondering.",
    subject: "We have your registration for {{event}}",
    body:
      `Hello {{first_name}},

Thank you for registering for {{event}}. This is to confirm we have your request — you do not need to do anything else yet.

What happens next: places are limited and every registration is reviewed, so it takes us two to three weeks to come back to you. We will write to you either way, whether or not we can offer you a place. If you have not heard from us after three weeks, reply to this message and we will chase it.

Current BioHubNet trainees are given priority consideration. If you asked for travel or accommodation support, we will send you a separate note about that.` + SIGN_OFF,
  },
  {
    id: "approved",
    stage: "registration",
    name: "Place approved",
    when: "When a seat is granted. Say what they have and what holds it.",
    subject: "Your place at {{event}}: {{session}}",
    body:
      `Hello {{first_name}},

You have a place at {{session}}.

  When:  {{session_date}}, {{session_time}}
  Where: {{session_venue}}

Please put it in your calendar now. About ${CONFIRM_DAYS_BEFORE} days before the session we will write once more to ask whether you can still make it — a reply to that message is what holds your seat, and no reply releases it to the next person on the waitlist.

If you already know you cannot come, tell us now rather than later. Somebody else can have the place and will be glad of it.` + SIGN_OFF,
  },
  {
    id: "declined",
    stage: "registration",
    name: "Not able to offer a place",
    when: "When there is no seat. Short, clear, and it does not pretend.",
    subject: "About your registration for {{event}}",
    body:
      `Hello {{first_name}},

We are not able to offer you a place at {{event}} this year. We had more registrations than the rooms hold, and priority went to current BioHubNet trainees.

This is not a judgement of your application. If you are not yet a BioHubNet trainee, applying to ENGAGE, EXPERIENCE or EQUIP is the thing that changes the outcome next time, and we would encourage it.

We will write to you when registration opens again.` + SIGN_OFF,
  },
  {
    id: "waitlisted",
    stage: "registration",
    name: "On the waitlist",
    when: "When the room is full but they are next in line.",
    subject: "You are on the waitlist for {{session}}",
    body:
      `Hello {{first_name}},

{{session}} is full, so you are on the waitlist.

That is not a no. Places come free regularly — people's plans change, and everyone with a seat has to confirm it about ${CONFIRM_DAYS_BEFORE} days before the session, which is when most of the movement happens. If one opens we will write to you.

You do not need to do anything. If you would rather we took you off the list, reply and say so.` + SIGN_OFF,
  },
  {
    id: "waitlist_promoted",
    stage: "registration",
    name: "A place has opened up",
    when: "When somebody moves off the waitlist into a seat.",
    subject: "A place has opened up: {{session}}",
    body:
      `Hello {{first_name}},

A place has come free at {{session}} and it is yours if you want it.

  When:  {{session_date}}, {{session_time}}
  Where: {{session_venue}}

Please reply by {{reply_by}} to say whether you can come. If we do not hear from you by then we will pass it to the next person, which we would rather not do.` + SIGN_OFF,
  },
  {
    id: "confirm_attendance",
    stage: "registration",
    name: "Can you still make it?",
    when: `The batch send about ${CONFIRM_DAYS_BEFORE} days before a session. A reply holds the seat.`,
    subject: "Can you still make it to {{session}}?",
    body:
      `Hello {{first_name}},

{{session}} is nearly here and we are confirming numbers.

  When:  {{session_date}}, {{session_time}}
  Where: {{session_venue}}

Please reply by {{reply_by}} and tell us one of two things: that you are still coming, or that you are not.

If we do not hear from you by {{reply_by}} we will treat it as a no and give your place to somebody on the waitlist. That is not us being strict — an empty seat at a session this oversubscribed is a place somebody else could have used.` + SIGN_OFF,
  },
  {
    id: "seat_released",
    stage: "registration",
    name: "Place released",
    when: "When somebody tells us they cannot come, or the deadline passes.",
    subject: "Your place at {{session}} has been released",
    body:
      `Hello {{first_name}},

Your place at {{session}} has been released and offered to somebody on the waitlist. Thank you for letting us know — telling us is genuinely useful and it is what makes the waitlist work.

Nothing else is affected. Any other sessions you were given a place at still stand, and you are welcome to register again next year.` + SIGN_OFF,
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
    when: "Three days out. The last chance to tell us they cannot come.",
    subject: "{{session}} is in three days",
    body:
      `Hello {{first_name}},

A reminder that {{session}} is in three days.

  When:  {{session_date}}, {{session_time}}
  Where: {{session_venue}}

Please arrive ten minutes early. Bring photo ID if the venue asks for it at reception.

If something has changed and you cannot come, reply today. At this notice we can usually still fill the place.` + SIGN_OFF,
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

Please arrive ten minutes early. If you are running late or cannot make it after all, reply to this message and we will let the room know.

See you there.` + SIGN_OFF,
  },
];

/* ── overrides ───────────────────────────────────────────────────── */

export const OverrideSchema = z.object({
  id: z.string().min(1).max(60),
  subject: z.string().max(200),
  body: z.string().max(20000),
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
    if (!o) return { ...t, edited: false };
    const edited = o.subject !== t.subject || o.body !== t.body;
    return { ...t, subject: o.subject, body: o.body, edited };
  });
}

export const templateById = (id: string) => DEFAULT_TEMPLATES.find((t) => t.id === id);

/** Everything wrong with a template, said plainly, before it is saved. */
export function problemsWith(subject: string, body: string): string[] {
  const out: string[] = [];
  if (!subject.trim()) out.push("It needs a subject.");
  if (!body.trim()) out.push("It needs a message.");
  for (const f of [...unknownFields(subject), ...unknownFields(body)]) {
    out.push(`“{{${f}}}” is not a field — it would be sent to people exactly as written.`);
  }
  return [...new Set(out)];
}
