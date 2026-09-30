"use server";

/**
 * Server actions behind Workspace → Process → Admin.
 *
 * Every one re-checks the caller's role. A server action is a public
 * endpoint with a nice calling convention, not a private function: the
 * page guard says who may SEE the tab and has no bearing on who may POST
 * to it.
 */
import { personLetter, letterSummary, type LetterSeat } from "@/lib/allocation/person-letter";
import { institutionOf } from "@/lib/travel/far-email";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { parseRules, validateRules, type Rule } from "@/lib/allocation/model";
import {
  isAudience, isId, REGISTRANT_VIEWS_KEY, RULES_KEY,
  type Audience, type EmailPlan, type SubmissionRow, type TemplateBundle, type WorkshopInput,
} from "@/lib/allocation/admin-types";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2, REGISTRATION_FORM_WHERE } from "@/lib/allocation/symposium-2026";
import { INTERNAL_KEY, InternalPersonSchema, isInternal, parseInternal, type InternalPerson } from "@/lib/training-week/internal";
import { loadInternalSet } from "@/lib/training-week/internal-server";
import { HIGHLIGHTS_KEY, highlightProblem, highlightsOf, type Highlight } from "@/lib/allocation/highlights";
import { versionLabel, versionRoot } from "@/lib/formbuilder/versions";
import { ViewSchema, isBuiltIn as isBuiltInView, type View } from "@/lib/allocation/registrant-views";
import { registrantName } from "@/lib/allocation/registrant-name";
import { cantAttendUrl, passTokenFor, passUrl } from "@/lib/training-week/pass";
import { withPassQr } from "@/lib/training-week/pass-qr";
import { EntrySchema } from "@/lib/allocation/catering";
import { CATERING_SENT_KEY, parseSent, recordSent, type SentRecord } from "@/lib/allocation/catering-sent";
import { parseForm } from "@/lib/formbuilder/types";
import { rankedSessions } from "@/lib/formbuilder/submit";
import { personLetterDraft, sendComposed, sendPersonCombined } from "@/lib/formbuilder/acknowledge";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
import {
  describe as describeDecision, isDecision, letterDue, type Decision,
} from "@/lib/allocation/decisions";
import type { Receipt, SentMail } from "@/lib/formbuilder/receipt";
import type { Answers } from "@/lib/formbuilder/logic";
import {
  isEdit, OverrideSchema, parseOverrides, problemsWith, refusesMultiSession, render,
  resolveTemplates, SUPPORT_URL_KEY, templateById, TEMPLATES_KEY, unfilledGlobals,
  type Override,
} from "@/lib/allocation/email-templates";

const PAGE = "/admin/workspace/training-admin";

async function requireAdmin() {
  const session = await requireRole("admin");
  return session.user as { id?: string; email?: string; name?: string };
}

// ── the decision model ───────────────────────────────────────────────

export async function loadRules(): Promise<Rule[]> {
  // Guarded like the rest. It only reads, but a server action is a
  // public endpoint and "it only reads" is how the allocation policy
  // ends up readable by anyone who can spell the action id.
  await requireAdmin();
  const row = await prisma.platformSetting
    .findUnique({ where: { key: RULES_KEY } })
    .catch(() => null);
  return parseRules(row?.value);
}

/**
 * Replace the whole rule list.
 *
 * Whole-list rather than per-rule edits because the ORDER is the policy
 * — a patch that moved one rule would still have to rewrite the rest, so
 * there is nothing to gain from pretending otherwise. Refused outright
 * if the result could not explain its own output.
 */
export async function saveRules(rules: Rule[]): Promise<{ ok: boolean; problem?: string }> {
  await requireAdmin();
  const verdict = validateRules(rules);
  if (!verdict.ok) return verdict;

  await prisma.platformSetting.upsert({
    where: { key: RULES_KEY },
    create: { key: RULES_KEY, value: JSON.stringify(rules) },
    update: { value: JSON.stringify(rules) },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

// ── workshops ────────────────────────────────────────────────────────

/**
 * Clamp a capacity to something a room could have.
 *
 * The UI sends integers; a server action receives whatever the caller
 * sends. NaN would reach Prisma, a negative is meaningless, and a
 * fat-fingered 200000 is not a room.
 */
const capacityOf = (v: unknown, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : fallback;
};

/** An ISO date that Prisma will accept, or null. */
const dateOf = (v: unknown): Date | null => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workshop";

export async function createWorkshop(eventId: string, input: WorkshopInput) {
  await requireAdmin();
  const base = slugify(input.title);
  // Slugs are unique per event, so a second "CCRM tour" needs its own.
  const taken = new Set(
    (await prisma.workshop.findMany({ where: { eventId }, select: { slug: true } })).map((w) => w.slug),
  );
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

  const start = dateOf(input.startDateTime);
  const end = dateOf(input.endDateTime);
  if (!start || !end) return { ok: false as const, problem: "Those dates could not be read." };
  if (end <= start) return { ok: false as const, problem: "It has to end after it starts." };

  await prisma.workshop.create({
    data: {
      eventId,
      slug,
      title: input.title.trim().slice(0, 200),
      kind: input.kind,
      startDateTime: start,
      endDateTime: end,
      capacity: capacityOf(input.capacity, 20),
      waitlistCapacity: capacityOf(input.waitlistCapacity, 5),
      locationName: input.locationName || null,
      partnerOrganization: input.partnerOrganization || null,
      shortDescription: input.shortDescription || null,
      requiresApproval: input.requiresApproval,
      isActive: input.isActive,
    },
  });
  revalidatePath(PAGE);
  return { ok: true as const };
}

export async function updateWorkshop(id: string, patch: Partial<WorkshopInput>) {
  await requireAdmin();

  // Cutting capacity below the seats already given out does not take
  // anyone's seat away — it just makes the room permanently "over" and
  // every later number wrong. Refused, with the count that refused it,
  // because the admin nearly always meant a different number.
  if (patch.capacity !== undefined) {
    const next = capacityOf(patch.capacity, -1);
    if (next < 0) return { ok: false as const, problem: "That is not a number of seats." };
    const confirmed = await prisma.workshopBooking.count({
      where: { workshopId: id, status: "confirmed" },
    });
    if (next < confirmed) {
      return {
        ok: false as const,
        problem: `${confirmed} people already hold a confirmed seat here, so the room cannot be set to ${next}.`,
      };
    }
    patch = { ...patch, capacity: next };
  }
  if (patch.waitlistCapacity !== undefined) {
    patch = { ...patch, waitlistCapacity: capacityOf(patch.waitlistCapacity, 5) };
  }
  if (patch.startDateTime && !dateOf(patch.startDateTime)) {
    return { ok: false as const, problem: "That start time could not be read." };
  }
  if (patch.endDateTime && !dateOf(patch.endDateTime)) {
    return { ok: false as const, problem: "That end time could not be read." };
  }

  await prisma.workshop.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(patch.waitlistCapacity !== undefined ? { waitlistCapacity: patch.waitlistCapacity } : {}),
      ...(patch.locationName !== undefined ? { locationName: patch.locationName || null } : {}),
      ...(patch.partnerOrganization !== undefined
        ? { partnerOrganization: patch.partnerOrganization || null }
        : {}),
      ...(patch.shortDescription !== undefined
        ? { shortDescription: patch.shortDescription || null }
        : {}),
      ...(patch.requiresApproval !== undefined ? { requiresApproval: patch.requiresApproval } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.startDateTime ? { startDateTime: new Date(patch.startDateTime) } : {}),
      ...(patch.endDateTime ? { endDateTime: new Date(patch.endDateTime) } : {}),
    },
  });
  revalidatePath(PAGE);
  return { ok: true as const };
}

/**
 * Retire a workshop, or delete it if nobody ever booked.
 *
 * Deleting one with bookings would cascade them away, which is the sort
 * of thing you only discover when somebody asks why they are no longer
 * registered. With bookings it is deactivated instead: gone from the
 * public listing, still answerable.
 */
export async function removeWorkshop(id: string) {
  await requireAdmin();
  const count = await prisma.workshopBooking.count({ where: { workshopId: id } });
  if (count > 0) {
    await prisma.workshop.update({ where: { id }, data: { isActive: false } });
    revalidatePath(PAGE);
    return { ok: true as const, deactivated: true, bookings: count };
  }
  await prisma.workshop.delete({ where: { id } });
  revalidatePath(PAGE);
  return { ok: true as const, deactivated: false, bookings: 0 };
}

// ── email ────────────────────────────────────────────────────────────

/** Who a send would reach. Read-only: nothing leaves the building. */
/** "Monday 26 October" / "11:00–13:30" / a venue, all in Toronto. */
function sessionVars(w: { title: string; startDateTime: Date; endDateTime: Date; locationName: string | null }) {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long",
  }).format(w.startDateTime);
  const clock = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return {
    session: w.title,
    sessionDate: day,
    sessionTime: `${clock(w.startDateTime)}\u2013${clock(w.endDateTime)}`,
    sessionVenue: w.locationName || "to be confirmed",
  };
}

export async function previewAudience(eventId: string, audience: Audience, workshopId?: string): Promise<EmailPlan> {
  await requireAdmin();
  // Narrowed, not trusted. This one only reads, so an unrecognised
  // audience falls back to the safest interpretation rather than
  // refusing; the send path below refuses outright instead, because
  // quietly substituting a default is not a thing to do to a send.
  const who: Audience = isAudience(audience) ? audience : "confirmed";
  if (!isId(eventId)) return { recipients: [], configured: mailConfigured(), manySessions: false };
  const one = isId(workshopId) ? workshopId : undefined;

  const bookings = await prisma.workshopBooking.findMany({
    where: {
      workshop: { eventId, ...(one ? { id: one } : {}) },
      ...(who === "all" ? { status: { not: "cancelled" } } : { status: who }),
    },
    select: {
      id: true,
      status: true,
      user: { select: { email: true, name: true } },
      submission: { select: { id: true, email: true, data: true } },
      workshop: { select: { id: true, title: true, startDateTime: true, endDateTime: true, locationName: true } },
    },
    orderBy: { bookedAt: "asc" },
  });

  const seen = new Set<string>();
  const workshopsSeen = new Set<string>();
  const recipients: EmailPlan["recipients"] = [];
  for (const b of bookings) {
    /*
     * The registration's address first. Training Week registers people
     * through a public form, so almost no seat has an account behind it —
     * reading only the account's address meant a letter to "everyone
     * confirmed" reached nobody who had registered that way.
     */
    const email = b.submission?.email ?? b.user?.email;
    workshopsSeen.add(b.workshop.id);
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    const v = sessionVars(b.workshop);
    recipients.push({
      email,
      submissionId: b.submission?.id ?? null,
      bookingId: b.id,
      name: registrantName((b.submission?.data ?? {}) as Record<string, unknown>) || b.user?.name || "",
      status: b.status,
      workshop: v.session,
      sessionDate: v.sessionDate,
      sessionTime: v.sessionTime,
      sessionVenue: v.sessionVenue,
    });
  }
  return { recipients, configured: mailConfigured(), manySessions: workshopsSeen.size > 1 };
}

/**
 * Send. Requires an explicit confirmation from the caller.
 *
 * `confirmed` is not belt-and-braces — it is the difference between a
 * button that composes and a button that reaches several hundred people
 * who cannot be unreached. The UI asks; this refuses to act on a request
 * that did not.
 */
export async function sendToAudience(input: {
  eventId: string;
  audience: Audience;
  workshopId?: string;
  subject: string;
  body: string;
  confirmed: boolean;
  /** Fills {{reply_by}}, when the letter asks for an answer by a date. */
  replyBy?: string;
}): Promise<{ ok: boolean; sent: number; failed: number; problem?: string }> {
  const admin = await requireAdmin();
  if (!input.confirmed) {
    return { ok: false, sent: 0, failed: 0, problem: "Not confirmed." };
  }
  if (!input.subject.trim() || !input.body.trim()) {
    return { ok: false, sent: 0, failed: 0, problem: "A subject and a message are both needed." };
  }
  // A typo in a merge field would be posted verbatim. Checked at the
  // door as well as in the editor, because a server action is reachable
  // without ever opening the editor.
  const wrong = problemsWith(input.subject, input.body);
  if (wrong.length > 0) return { ok: false, sent: 0, failed: 0, problem: wrong.join(" ") };
  // Refused, never narrowed. A send that quietly picked a different
  // audience from the one it was asked for would be worse than one
  // that failed.
  if (!isAudience(input.audience) || !isId(input.eventId)) {
    return { ok: false, sent: 0, failed: 0, problem: "That is not an audience this can send to." };
  }
  if (input.workshopId !== undefined && !isId(input.workshopId)) {
    return { ok: false, sent: 0, failed: 0, problem: "That is not a workshop." };
  }
  if (!mailConfigured()) {
    return { ok: false, sent: 0, failed: 0, problem: "Mail is not configured on this deployment." };
  }

  const event = await prisma.bhnEvent.findUnique({
    where: { id: input.eventId }, select: { title: true },
  }).catch(() => null);
  const eventName = event?.title ?? "BioHubNet Training Week";

  const plan = await previewAudience(input.eventId, input.audience, input.workshopId);
  if (plan.recipients.length === 0) {
    return { ok: false, sent: 0, failed: 0, problem: "That audience is empty." };
  }

  /*
   * A letter that names a session cannot go to a list that spans
   * several.
   *
   * "Your session is at 11:00 in Room 850" is not a formatting problem
   * when it reaches the Wednesday showcase — it is wrong information
   * sent with authority, and the reader has no way to know. The words
   * decide: only wording that actually uses a per-session field is held
   * back, so a general note still goes to everybody.
   *
   * The rule lives in one function shared with the tab that warns about
   * it, so the warning and the refusal cannot describe different rules.
   */
  const refusal = refusesMultiSession(input.subject, input.body, plan.manySessions);
  if (refusal) return { ok: false, sent: 0, failed: 0, problem: refusal };

  /*
   * Fields that are the same for everybody, checked BEFORE the lock.
   *
   * A support letter sent from a deployment where nobody has set the
   * form link used to take the fifteen-minute lock, write an audit row
   * claiming N recipients, then skip all N — leaving a record that said
   * it had reached people it never wrote to, and a feature that looked
   * jammed for a quarter of an hour.
   */
  const supportRow = await prisma.platformSetting
    .findUnique({ where: { key: SUPPORT_URL_KEY } })
    .catch(() => null);
  const globals = {
    event: eventName,
    reply_by: input.replyBy?.trim() || undefined,
    support_form_link: supportRow?.value || undefined,
    coordinator: "The BioHubNet team",
  };
  const unfilled = unfilledGlobals(input.subject, input.body, globals);
  if (unfilled.length > 0) {
    return {
      ok: false, sent: 0, failed: 0,
      problem: `Nothing to put in ${unfilled.map((f) => `{{${f}}}`).join(", ")}. Fill it in before sending.`,
    };
  }

  /*
   * A lock, taken before the first message goes out.
   *
   * Sending several hundred messages one at a time takes minutes, and
   * for all of those minutes a second call would send the whole audience
   * again. Nothing in the UI can be trusted to prevent that — a second
   * tab, a retried request or a reload all arrive here as a fresh call.
   * It expires on its own so a crash mid-send cannot wedge the feature
   * shut, which is the failure mode of every lock that only unlocks on
   * the happy path.
   */
  const LOCK = "trainingWeek.emailSendLock";
  const STALE_MS = 15 * 60 * 1000;
  const held = await prisma.platformSetting.findUnique({ where: { key: LOCK } }).catch(() => null);
  if (held && Date.now() - Number(held.value) < STALE_MS) {
    return {
      ok: false, sent: 0, failed: 0,
      problem: "A send is already running. Wait for it to finish rather than starting a second one.",
    };
  }
  await prisma.platformSetting.upsert({
    where: { key: LOCK },
    create: { key: LOCK, value: String(Date.now()) },
    update: { value: String(Date.now()) },
  });

  // Written BEFORE the first message. A send killed halfway used to
  // leave no trace at all, so nobody could tell whether a hundred people
  // had already been written to.
  await logSend(admin.id, "training_admin.email_started", {
    audience: input.audience,
    workshopId: input.workshopId ?? null,
    subject: input.subject,
    recipients: plan.recipients.length,
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  try {
    for (const r of plan.recipients) {
      let passToken: string | null = null;
      const vars = {
        ...globals,
        name: r.name || "there",
        first_name: (r.name || "").trim().split(/\s+/)[0] || "there",
        session: r.workshop,
        session_date: r.sessionDate,
        session_time: r.sessionTime,
        session_venue: r.sessionVenue,
        // Their own pass, made on first use. Only looked up when the
        // letter asks for it: a pass nobody is sent is a pass nobody needs.
        ...(await (async () => {
          const text = `${input.subject}\n${input.body}`;
          const wantsPass = /\{\{\s*pass_link\s*\}\}/.test(text);
          const wantsCant = /\{\{\s*cant_attend_link\s*\}\}/.test(text);
          if (!r.submissionId || (!wantsPass && !wantsCant)) return {};
          const token = await passTokenFor(r.submissionId);
          passToken = token;
          return {
            pass_link: wantsPass ? passUrl(token) : undefined,
            cant_attend_link: wantsCant && r.bookingId ? cantAttendUrl(token, r.bookingId) : undefined,
          };
        })()),
      };
      const rendered = render(input.body, vars);
      const renderedSubject = render(input.subject, vars);
      // A field left unresolved is skipped, not posted. Checked across
      // the SUBJECT as well as the body — a subject line is the one part
      // everybody reads, so "Reply by {{reply_by}}" in an inbox is the
      // worst place for this to show up, not an acceptable one.
      //
      // Per recipient rather than up front: the whole list stopping
      // because one person has no session is worse than one person not
      // hearing, and the report says which.
      const missing = [...new Set([...renderedSubject.missing, ...rendered.missing])];
      if (missing.length > 0) {
        failed += 1;
        if (errors.length < 5) errors.push(`${r.email}: nothing to put in {{${missing[0]}}}`);
        continue;
      }
      // A newline in a subject is a header break. nodemailer encodes
      // headers, but the subject is built from admin free text and a
      // registrant's own name, and neither is worth trusting to a
      // library's escaping when collapsing it costs one line.
      const subject = renderedSubject.text.replace(/[\r\n]+/g, " ").trim();
      const text = rendered.text;
      // One message each, sequentially. Not a bcc blast: a bcc means one
      // bounce loses the lot, and personalising the greeting is the least
      // a registrant is owed.
      //
      // Counted by control flow, not by a return value. sendMail resolves
      // to undefined, so testing what it returns marked every DELIVERED
      // message as failed — and an admin told "0 sent, 240 failed" sends
      // the whole thing again.
      try {
        // With a pass link in it, the QR goes in too — under the link.
        const qr = passToken && vars.pass_link ? withPassQr(text, vars.pass_link, passToken) : null;
        await sendMail({ to: r.email, subject, text, html: qr?.html, attachments: qr ? [qr.attachment] : undefined });
        sent += 1;
      } catch (err) {
        failed += 1;
        if (errors.length < 5) errors.push(`${r.email}: ${(err as Error)?.message ?? "unknown"}`);
      }
    }
  } finally {
    await prisma.platformSetting.delete({ where: { key: LOCK } }).catch(() => null);
  }

  await logSend(admin.id, "training_admin.email_sent", {
    audience: input.audience,
    workshopId: input.workshopId ?? null,
    subject: input.subject,
    sent,
    failed,
    errors,
  });

  revalidatePath(PAGE);
  return {
    ok: true,
    sent,
    failed,
    ...(failed ? { problem: `Some did not go out — ${errors.join("; ")}` } : {}),
  };
}

/**
 * Audit a send.
 *
 * actorId is required and FK-constrained, so a send by a session without
 * a resolvable user is left unlogged rather than throwing after the mail
 * has already gone out — losing the record is bad, sending twice because
 * the logging threw is worse.
 */
async function logSend(actorId: string | undefined, action: string, detail: unknown) {
  if (!actorId) return;
  await prisma.auditLog
    .create({ data: { action, actorId, detail: JSON.stringify(detail) } })
    .catch(() => null);
}

// ── email templates ──────────────────────────────────────────────────

export async function loadEmailTemplates(): Promise<TemplateBundle> {
  // Guarded even though it only reads. A server action is a public
  // endpoint, and the letters name who gets priority and what the fund
  // could not cover.
  await requireAdmin();
  const [stored, url] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: TEMPLATES_KEY } }).catch(() => null),
    prisma.platformSetting.findUnique({ where: { key: SUPPORT_URL_KEY } }).catch(() => null),
  ]);
  return {
    templates: resolveTemplates(parseOverrides(stored?.value)),
    supportFormUrl: url?.value ?? "",
  };
}

/**
 * Save one template's wording.
 *
 * Refused rather than saved when it names a field that does not exist:
 * an unresolved {{sesion}} is not a cosmetic problem, it is a hundred
 * people receiving a letter with a curly-braced typo where their session
 * should be, and the moment to catch it is while somebody is looking at
 * it.
 */
export async function saveEmailTemplate(
  id: string, subject: string, body: string,
): Promise<{ ok: boolean; problems?: string[] }> {
  const admin = await requireAdmin();
  const shipped = templateById(id);
  if (!shipped) return { ok: false, problems: ["No template with that id."] };

  const problems = problemsWith(subject, body);
  if (problems.length > 0) return { ok: false, problems };

  const row = await prisma.platformSetting.findUnique({ where: { key: TEMPLATES_KEY } }).catch(() => null);
  const kept = parseOverrides(row?.value).filter((o) => o.id !== id);
  const entry: Override = { id, subject: subject.trim(), body };

  // The read path validates and DROPS what it cannot parse. A row that
  // would not survive that must not be written at all, or the save
  // reports success, vanishes on the next read, and takes the previous
  // good wording with it.
  const check = OverrideSchema.safeParse(entry);
  if (!check.success) return { ok: false, problems: ["That does not fit — shorten it and try again."] };

  // Wording identical to the shipped letter is stored as NOTHING. An
  // override that merely repeats the default cannot be told apart from
  // a real edit later, hides the reset button, and freezes that wording
  // through every future deploy.
  const next: Override[] = isEdit(shipped, entry) ? [...kept, entry] : kept;

  await prisma.platformSetting.upsert({
    where: { key: TEMPLATES_KEY },
    create: { key: TEMPLATES_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  await logSend(admin.id, "training_admin.template_saved", { id, subject: entry.subject });
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Put one template back to the wording it shipped with.
 *
 * Destructive and unversioned, so the discarded wording is written to
 * the audit log on the way out. Somebody negotiated those words; losing
 * them to a mis-click should at least be recoverable by reading the log.
 */
export async function resetEmailTemplate(id: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const row = await prisma.platformSetting.findUnique({ where: { key: TEMPLATES_KEY } }).catch(() => null);
  const all = parseOverrides(row?.value);
  const going = all.find((o) => o.id === id);
  if (!going) return { ok: true };

  const kept = all.filter((o) => o.id !== id);
  await prisma.platformSetting.upsert({
    where: { key: TEMPLATES_KEY },
    create: { key: TEMPLATES_KEY, value: JSON.stringify(kept) },
    update: { value: JSON.stringify(kept) },
  });
  await logSend(admin.id, "training_admin.template_reset", {
    id, discardedSubject: going.subject, discardedBody: going.body,
  });
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Set the travel-and-accommodation form link.
 *
 * Held as a setting rather than typed into the letter, because the same
 * URL appears in more than one template and a link that is right in one
 * of them and stale in another is worse than no link.
 */
export async function saveSupportFormUrl(url: string): Promise<{ ok: boolean; problem?: string }> {
  await requireAdmin();
  const trimmed = url.trim();
  if (trimmed) {
    let parsed: URL;
    try { parsed = new URL(trimmed); } catch { return { ok: false, problem: "That is not a URL." }; }
    // Anything else — javascript:, data:, mailto: — has no business
    // being posted to several hundred people as "the form".
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, problem: "The link has to be http or https." };
    }
  }
  await prisma.platformSetting.upsert({
    where: { key: SUPPORT_URL_KEY },
    create: { key: SUPPORT_URL_KEY, value: trimmed },
    update: { value: trimmed },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

// ── form submissions ─────────────────────────────────────────────────

/**
 * What people have actually sent in.
 *
 * Read from EventFormSubmission rather than from WorkshopBooking: a
 * submission is what somebody said, and a booking is what we did about
 * it. They are not the same thing, and until a coordinator has
 * approved anybody there are submissions and no bookings at all —
 * which is exactly when you most want to see them.
 */
export async function loadSubmissions(): Promise<SubmissionRow[]> {
  await requireAdmin();
  // Every version of the registration, pooled. Somebody who registered
  // on v1 and somebody on v2 are asking for the same seats, and a sheet
  // that shows only one of them is half a queue. By version root, not a
  // fixed list: seats are made from whatever form was submitted, so a
  // v3 made with Duplicate books seats and has to show up here too.
  const forms = (await prisma.eventForm.findMany({
    where: REGISTRATION_FORM_WHERE,
    select: { id: true, slug: true, fields: true },
  })).filter((f) => versionRoot(f.slug) === REGISTRATION_FORM_SLUG);
  if (forms.length === 0) return [];

  /*
   * Each row is read against the form it was SUBMITTED on, never one
   * shared document. rankedSessions keeps only answers the document
   * offers, so a v1 row read through v2 silently loses its "13:00–16:00"
   * Chameleon pick — and the two versions label the same key
   * differently, so the expanded answers would be mislabelled too.
   */
  const byForm = new Map(forms.map((f) => [f.id, {
    doc: parseForm(f.fields),
    form: versionLabel(f.slug),
  }]));

  const rows = await prisma.eventFormSubmission.findMany({
    where: { formId: { in: forms.map((f) => f.id) } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, formId: true, data: true, email: true, createdAt: true,
      user: { select: { name: true, email: true } },
      // The seats this registration asked for, which is what a
      // coordinator actually decides on.
      bookings: {
        orderBy: { rank: "asc" },
        select: {
          id: true, status: true, rank: true, decisionNote: true, approvedAt: true, notifiedStatus: true, notifiedAt: true,
          withdrawnAt: true, withdrawReason: true,
          workshop: { select: { title: true, capacity: true } },
        },
      },
    },
  });

  // Names from platform accounts with the same email — for registrations
  // that did not give one (v2 only asks since the Full name question).
  const accountNames = new Map(
    (await prisma.user.findMany({
      where: { email: { in: [...new Set(rows.map((r) => r.email).filter((e): e is string => !!e))], mode: "insensitive" }, name: { not: null } },
      select: { email: true, name: true },
    })).map((u) => [u.email.toLowerCase(), u.name as string]),
  );

  const internalSet = (await loadInternalSet()).keys;

  return rows.flatMap((r) => {
    const own = byForm.get(r.formId);
    if (!own) return [];
    const { doc } = own;
    const data = (r.data ?? {}) as Record<string, unknown>;
    const answers = data as Answers;
    return [{
      id: r.id,
      // Submitted timestamp: what first-come-first-served is decided on.
      at: r.createdAt.toISOString(),
      isTest: data.__test === true,
      internal: isInternal(
        [typeof data.trainee_email === "string" ? data.trainee_email : null, r.email, r.user?.email],
        data, internalSet,
      ),
      form: own.form,
      name: registrantName(answers) || r.user?.name || accountNames.get((r.email ?? "").toLowerCase()) || "",
      email: r.email ?? r.user?.email ?? "",
      status: typeof answers.bhn_status === "string" ? answers.bhn_status : "",
      sessions: rankedSessions(doc, answers),
      seats: r.bookings.map((b) => ({
        id: b.id,
        workshop: b.workshop.title,
        rank: b.rank ?? 0,
        status: b.status,
        note: b.decisionNote,
        decidedAt: b.approvedAt ? b.approvedAt.toISOString() : null,
        letterOwed: !!letterDue(b.notifiedStatus, b.status),
        toldAt: b.notifiedAt ? b.notifiedAt.toISOString() : null,
        withdrawnAt: b.withdrawnAt ? b.withdrawnAt.toISOString() : null,
        withdrawReason: b.withdrawReason ?? null,
      })),
      answers: Object.fromEntries(
        doc.fields
          .filter((f) => f.type !== "note" && answers[f.key] !== undefined)
          .map((f) => [f.label, Array.isArray(answers[f.key])
            ? (answers[f.key] as string[]).join(" · ")
            : String(answers[f.key] ?? "")]),
      ),
    }];
  });
}

/**
 * Delete a submission.
 *
 * Meant for clearing out the rows a coordinator left behind while
 * testing the form, which is why the UI only offers it on those. It
 * will delete a real one too — refusing would mean a genuine mistake
 * could never be removed — so it says which it was in the audit log.
 */
export async function deleteSubmission(id: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const row = await prisma.eventFormSubmission.findUnique({
    where: { id },
    select: { data: true, email: true },
  });
  if (!row) return { ok: true };
  const wasTest = ((row.data ?? {}) as Record<string, unknown>).__test === true;
  await prisma.eventFormSubmission.delete({ where: { id } });
  await logSend(admin.id, "training_admin.submission_deleted", { id, email: row.email, wasTest });
  revalidatePath(PAGE);
  return { ok: true };
}

// ── catering copy ────────────────────────────────────────────────────

/**
 * Record what the caterer was just given — tent cards printed, a list
 * printed, text copied — per session, so a new allergy after that is
 * flagged. The cards are worked out here from the entries, not trusted
 * from the page.
 */
export async function recordCateringSent(entries: unknown, how: "print" | "copy"): Promise<{ ok: boolean; sent?: SentRecord; problem?: string }> {
  const admin = await requireAdmin();
  const parsed = EntrySchema.array().max(5000).safeParse(entries);
  if (!parsed.success || (how !== "print" && how !== "copy")) return { ok: false, problem: "That list could not be read." };
  const row = await prisma.platformSetting.findUnique({ where: { key: CATERING_SENT_KEY }, select: { value: true } });
  const sent = recordSent(parseSent(row?.value), parsed.data, admin.name ?? admin.email ?? "", how, new Date().toISOString());
  const value = JSON.stringify(sent);
  await prisma.platformSetting.upsert({ where: { key: CATERING_SENT_KEY }, create: { key: CATERING_SENT_KEY, value }, update: { value } });
  return { ok: true, sent };
}

// ── saved registrant views ───────────────────────────────────────────

/**
 * Save the whole list of custom Registrants views — create, rename,
 * update and delete are all edits to this one list. Validated here, since
 * a server action is a public endpoint: built-in ids, duplicates and
 * anything malformed are dropped rather than stored.
 */
export async function saveRegistrantViews(views: unknown): Promise<{ ok: boolean; views: View[]; problem?: string }> {
  await requireAdmin();
  if (!Array.isArray(views)) return { ok: false, views: [], problem: "Nothing to save." };
  const seen = new Set<string>();
  const clean = views.flatMap((v) => {
    const r = ViewSchema.safeParse(v);
    if (!r.success || isBuiltInView(r.data.id) || seen.has(r.data.id)) return [];
    seen.add(r.data.id);
    return [r.data];
  }).slice(0, 50);
  const value = JSON.stringify(clean);
  await prisma.platformSetting.upsert({
    where: { key: REGISTRANT_VIEWS_KEY },
    create: { key: REGISTRANT_VIEWS_KEY, value },
    update: { value },
  });
  revalidatePath(PAGE);
  return { ok: true, views: clean };
}

// ── deciding on a seat ───────────────────────────────────────────────

/**
 * Apply the decision model's suggestions for one workshop — the seats the
 * coordinator just reviewed and confirmed on the Seat suggestions tab.
 *
 * Each seat goes through decideSeat, one at a time, so every one gets the
 * same audit line as a single click would. No letters go out here — they
 * are owed, and sent from the Letters box when the coordinator is ready.
 * Only seats still in this workshop and still undecided / waitlisted are
 * touched: anything decided in another tab since the page loaded is left
 * alone rather than overwritten.
 */
export async function applySeatSuggestions(
  workshopId: string,
  approve: string[],
  waitlist: string[],
): Promise<{ ok: boolean; approved: number; waitlisted: number; skipped: number; problem?: string }> {
  await requireAdmin();
  if (!isId(workshopId)) return { ok: false, approved: 0, waitlisted: 0, skipped: 0, problem: "That is not a workshop." };
  const wanted = [...approve.map((id) => [id, "confirmed"] as const), ...waitlist.map((id) => [id, "waitlist"] as const)]
    .filter(([id]) => isId(id))
    .slice(0, 200);
  const rows = await prisma.workshopBooking.findMany({
    where: { id: { in: wanted.map(([id]) => id) }, workshopId },
    select: { id: true, status: true },
  });
  const current = new Map(rows.map((r) => [r.id, r.status]));
  let approved = 0, waitlisted = 0, skipped = 0;
  for (const [id, to] of wanted) {
    const now = current.get(id);
    const movable = to === "confirmed" ? now === "pending" || now === "waitlist" : now === "pending";
    if (!movable) { skipped++; continue; }
    const r = await decideSeat(id, to);
    if (!r.ok) { skipped++; continue; }
    if (to === "confirmed") approved++; else waitlisted++;
  }
  revalidatePath(PAGE);
  return { ok: true, approved, waitlisted, skipped };
}

/**
 * Approve, waitlist, decline, or take it back — the DECISION only.
 *
 * REVERSIBLE by design: every decision is a move between four states,
 * and any move is allowed. Coordinators change their minds — somebody
 * drops out, a room grows, a mistake is spotted — and a system that
 * only moves forwards makes the fix a database job.
 *
 * Deciding no longer emails anyone. The seat now owes a letter (see
 * letterDue), sent when a coordinator chooses: one seat at a time, one
 * person, the people behind a selection, or everyone owed at once — one
 * letter per person (sendPersonLetterFor / sendAllPersonLetters).
 * Pass `send: true` to decide and send in one go.
 */
export async function decideSeat(
  bookingId: string,
  to: string,
  note?: string,
  opts?: { send?: boolean },
): Promise<{ ok: boolean; problem?: string; said?: string; letterOwed?: boolean; receipt?: Receipt }> {
  const admin = await requireAdmin();
  if (!isDecision(to)) return { ok: false, problem: "That is not a decision." };
  if (!isId(bookingId)) return { ok: false, problem: "That is not a seat." };

  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true, notifiedStatus: true, workshop: { select: { title: true } } },
  });
  if (!booking) return { ok: false, problem: "That seat no longer exists." };

  const from = isDecision(booking.status) ? booking.status : "pending";
  const decision = to as Decision;

  await prisma.workshopBooking.update({
    where: { id: bookingId },
    data: {
      status: decision,
      decisionNote: note?.trim() ? note.trim().slice(0, 500) : null,
      // Stamped only when a human actually decided. Taking it back to
      // undecided clears it, or the dashboard would keep counting a
      // decision nobody is standing behind.
      approvedAt: decision === "pending" ? null : new Date(),
      approvedById: decision === "pending" ? null : admin.id ?? null,
    },
  });

  await logSend(admin.id, "training_admin.seat_decided", {
    bookingId, from, to: decision, workshop: booking.workshop.title, note: note ?? null,
  });

  const said = `${booking.workshop.title}: ${describeDecision(from, decision)}`;
  revalidatePath(PAGE);

  if (opts?.send) {
    const seat = await prisma.workshopBooking.findUnique({ where: { id: bookingId }, select: { id: true, submissionId: true, userId: true } });
    const sent = seat ? await sendPersonLetterFor(keyOf(seat)) : { delivered: false, receipt: undefined };
    return { ok: true, said, letterOwed: !sent.delivered && !!sent.receipt, receipt: sent.receipt };
  }
  return { ok: true, said, letterOwed: !!letterDue(booking.notifiedStatus, decision) };
}

/** The name on a platform account with this email, if any. */
async function accountNameFor(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const u = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { name: true } });
  return u?.name?.trim() || null;
}

/** Did the letter reach somebody? A test registration's goes to the person running it. */
const delivered = (r: Receipt) => r.state === "sent" || r.state === "sent-to-you";

/* ── one letter per person ───────────────────────────────────────── */

const PERSON_LETTER = "training_admin.person_letter";

/** Who a seat belongs to: the registration, or the account for a seat booked without one. */
const keyOf = (b: { submissionId: string | null; userId: string | null; id: string }) =>
  b.submissionId ?? (b.userId ? `u:${b.userId}` : `b:${b.id}`);

const SEAT_SELECT = {
  id: true, status: true, notifiedStatus: true, decisionNote: true, bookedAt: true, approvedAt: true,
  submissionId: true, userId: true,
  workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true, eventId: true } },
  user: { select: { name: true, email: true } },
  submission: { select: { id: true, data: true, email: true, checkInToken: true } },
} as const;

type SeatRow = Awaited<ReturnType<typeof seatsOf>>[number];
async function seatsOf(where: object) {
  return prisma.workshopBooking.findMany({ where, select: SEAT_SELECT, orderBy: { bookedAt: "asc" } });
}

/** A person's seats as the letter reads them — with their pass links when the pass exists (or `makePass`). */
async function letterFor(rows: SeatRow[], makePass: boolean) {
  const b = rows[0];
  const answers = ((b.submission?.data ?? {}) as Record<string, unknown>) as Answers;
  const to = b.submission?.email ?? b.user?.email ?? null;
  const name = registrantName(answers) || b.user?.name?.trim() || (await accountNameFor(to)) || "";
  const token = b.submission ? (makePass ? await passTokenFor(b.submission.id) : b.submission.checkInToken) : null;
  const seats: LetterSeat[] = rows.map((r) => ({
    bookingId: r.id, session: r.workshop.title, start: r.workshop.startDateTime, end: r.workshop.endDateTime,
    venue: r.workshop.locationName, status: r.status, told: r.notifiedStatus, note: r.decisionNote,
    cantAttendLink: token ? cantAttendUrl(token, r.id) : undefined, bookedAt: r.bookedAt, decidedAt: r.approvedAt ?? new Date(),
  }));
  const passLink = token ? passUrl(token) : "(their pass link — made when the letter is sent)";
  return { to, name, token, seats, letter: personLetter({ name, seats, passLink }) };
}

export interface OwedLetter {
  key: string;
  name: string;
  email: string;
  summary: { label: string; sessions: string[] }[];
  subject: string;
  body: string;
}

/** Everybody a letter is waiting for, one entry per person — for the mailbox. Writes nothing. */
export async function lettersOwed(): Promise<OwedLetter[]> {
  await requireAdmin();
  const eventId = await trainingWeekEventId();
  if (!eventId) return [];
  const rows = await seatsOf({ workshop: { eventId } });
  const byPerson = new Map<string, SeatRow[]>();
  for (const r of rows) byPerson.set(keyOf(r), [...(byPerson.get(keyOf(r)) ?? []), r]);
  const out: OwedLetter[] = [];
  for (const [key, list] of byPerson) {
    if (!list.some((r) => letterDue(r.notifiedStatus, r.status))) continue;
    const made = await letterFor(list, false);
    if (!made.letter) continue;
    out.push({ key, name: made.name || made.to || "No name given", email: made.to ?? "", summary: letterSummary(made.seats), subject: made.letter.subject, body: made.letter.body });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Send one person their letter — everything owed on all their seats, in one email. */
export async function sendPersonLetterFor(key: string): Promise<{ ok: boolean; delivered: boolean; receipt?: Receipt; problem?: string }> {
  const admin = await requireAdmin();
  const where = key.startsWith("u:") ? { userId: key.slice(2), submissionId: null }
    : key.startsWith("b:") ? { id: key.slice(2) }
    : { submissionId: key };
  if (!isId(key.replace(/^[ub]:/, ""))) return { ok: false, delivered: false, problem: "That is not a registration." };
  const eventId = await trainingWeekEventId();
  const rows = await seatsOf({ ...where, ...(eventId ? { workshop: { eventId } } : {}) });
  if (!rows.length) return { ok: false, delivered: false, problem: "That registration no longer exists." };
  const made = await letterFor(rows, true);
  if (!made.letter) return { ok: true, delivered: false };
  const receipt = await sendPersonCombined({
    to: made.to, name: made.name, subject: made.letter.subject, body: made.letter.body,
    passLink: made.letter.hasPlace && made.token ? passUrl(made.token) : undefined,
    passToken: made.letter.hasPlace && made.token ? made.token : undefined,
    calendar: made.letter.calendar,
  });
  if (delivered(receipt)) {
    // Told about each seat as it stands now.
    await prisma.$transaction(made.letter.seats.map((s) => prisma.workshopBooking.update({
      where: { id: s.bookingId }, data: { notifiedStatus: s.status, notifiedAt: new Date() },
    })));
  }
  await logSend(admin.id, PERSON_LETTER, { key, email: made.to, seats: made.letter.seats.map((s) => `${s.session}: ${s.status}`), state: receipt.state });
  revalidatePath(PAGE);
  return { ok: true, delivered: delivered(receipt), receipt };
}

/** Every letter waiting, one per person. Sequential; one failure never stops the rest. */
export async function sendAllPersonLetters(): Promise<{ ok: boolean; sent: number; notSent: number }> {
  await requireAdmin();
  const owed = await lettersOwed();
  let sent = 0, notSent = 0;
  for (const o of owed) {
    const r = await sendPersonLetterFor(o.key);
    if (r.delivered) sent++; else notSent++;
  }
  return { ok: true, sent, notSent };
}

/** The letters for the people behind these seats — each person once, with everything they are owed. */
export async function sendLettersForBookings(bookingIds: string[]): Promise<{ ok: boolean; sent: number; failed: number }> {
  await requireAdmin();
  const ids = [...new Set(bookingIds)].filter(isId).slice(0, MAX_BULK);
  const rows = await prisma.workshopBooking.findMany({ where: { id: { in: ids } }, select: { id: true, submissionId: true, userId: true } });
  let sent = 0, failed = 0;
  for (const key of new Set(rows.map(keyOf))) {
    const r = await sendPersonLetterFor(key);
    if (r.delivered) sent++; else if (r.receipt) failed++;
  }
  return { ok: true, sent, failed };
}

/** The Training Week event — the one carrying the most workshops, as the page picks it. */
async function trainingWeekEventId(): Promise<string | null> {
  const events = await prisma.bhnEvent.findMany({ select: { id: true, _count: { select: { workshops: true } } } });
  return [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0]?.id ?? null;
}

/** Decide several seats at once — the whole of one registration. */
export async function decideRegistration(
  submissionId: string,
  to: string,
  note?: string,
): Promise<{ ok: boolean; problem?: string; said?: string[] }> {
  await requireAdmin();
  if (!isDecision(to)) return { ok: false, problem: "That is not a decision." };
  const seats = await prisma.workshopBooking.findMany({
    where: { submissionId },
    orderBy: { rank: "asc" },
    select: { id: true },
  });
  const said: string[] = [];
  for (const s of seats) {
    const r = await decideSeat(s.id, to, note);
    if (r.said) said.push(r.said);
  }
  return { ok: true, said };
}

/*
 * One decision, several seats.
 *
 * Deciding a workshop's intake is done in one sitting against one list,
 * and doing it a row at a time is a hundred clicks and a page that
 * re-renders between each one. The loop is the whole implementation:
 * every seat still goes through decideSeat, so the audit log, the
 * letter-owed bookkeeping and the approvedAt stamp are the same as when
 * a coordinator decides one by hand.
 *
 * ponytail: serial, and each decideSeat re-checks the session — around
 * a second per 10 seats. Batch the auth check if a coordinator ever
 * needs to move more than a room at a time.
 */
const MAX_BULK = 300;

export async function decideSeats(
  bookingIds: string[],
  to: string,
  opts?: { send?: boolean },
): Promise<{ ok: boolean; problem?: string; done: number; failed: number; sent: number }> {
  await requireAdmin();
  if (!isDecision(to)) return { ok: false, problem: "That is not a decision.", done: 0, failed: 0, sent: 0 };
  const ids = [...new Set(bookingIds)].filter(isId).slice(0, MAX_BULK);
  let done = 0, failed = 0, sent = 0;
  for (const id of ids) {
    const r = await decideSeat(id, to);
    if (!r.ok) { failed += 1; continue; }
    done += 1;
  }
  // Then one letter per person, not one per seat.
  if (opts?.send) sent = (await sendLettersForBookings(ids)).sent;
  return { ok: true, done, failed, sent };
}

/**
 * Ask somebody about a travel claim their postal code does not support.
 *
 * The one letter in the set that asks rather than tells, so it is sent
 * one at a time and deliberately: no bulk button, no "send to everyone
 * under two hours". A coordinator looks at the row, decides the
 * question is worth asking, and asks it.
 *
 * The postal code and the estimate come from the registration on the
 * server, never from the page — the address a letter goes to is not
 * something a browser gets to choose.
 */
export async function sendTravelCheck(
  bookingId: string,
  edited?: { subject: string; body: string },
): Promise<{ ok: boolean; problem?: string; receipt?: Receipt }> {
  const admin = await requireAdmin();
  const made = await travelCheckFor(bookingId);
  if ("problem" in made) return { ok: false, problem: made.problem };

  /*
   * The coordinator's wording, if they changed it — but never their
   * idea of the address. `to` comes off the registration every time,
   * so an edited draft cannot be redirected by whatever the page sent
   * back.
   */
  const subject = edited?.subject.trim().replace(/[\r\n]+/g, " ").slice(0, 300);
  const body = edited?.body.trim().slice(0, 20_000);
  if (edited && (!subject || !body)) return { ok: false, problem: "An empty letter is not a letter." };

  const receipt = await sendComposed(
    edited ? { to: made.mail.to, subject: subject!, body: body! } : made.mail,
  );

  await logSend(admin.id, TRAVEL_CHECK, {
    bookingId, email: made.mail.to, postcode: made.fsa, state: receipt.state, edited: Boolean(edited),
  });
  revalidatePath(PAGE);
  return { ok: true, receipt };
}

/** The same letter, shown rather than sent — what the compose box opens with. */
export async function draftTravelCheck(
  bookingId: string,
): Promise<{ ok: boolean; problem?: string; to?: string; name?: string; subject?: string; body?: string }> {
  await requireAdmin();
  const made = await travelCheckFor(bookingId);
  if ("problem" in made) return { ok: false, problem: made.problem };
  return { ok: true, to: made.mail.to, name: made.name, subject: made.mail.subject, body: made.mail.body };
}

/** Everything both of those need: who, where they said they were, and the letter. */
async function travelCheckFor(
  bookingId: string,
): Promise<{ mail: SentMail; name: string; fsa: string } | { problem: string }> {
  if (!isId(bookingId)) return { problem: "That is not a seat." };

  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: {
      submission: { select: { data: true, email: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!booking) return { problem: "That registration no longer exists." };

  const answers = (booking.submission?.data ?? {}) as Record<string, unknown>;
  const estimate = travelFromPostcode(String(answers.postcode ?? "").trim());
  if (!estimate) return { problem: "There is no postal code on that registration to ask about." };

  const to = booking.submission?.email ?? booking.user?.email ?? null;
  const name = registrantName(answers) || booking.user?.name?.trim() || (await accountNameFor(to)) || "";
  const draft = await personLetterDraft("support_check_postcode", {
    to, name,
    vars: { postcode: estimate.fsa, travel_time: travelWords(estimate) },
  });
  if (!draft.ok) return { problem: receiptProblem(draft.receipt) };
  return { mail: draft.mail, name, fsa: estimate.fsa };
}

/** Why a letter could not even be written, in words a coordinator can act on. */
function receiptProblem(r: Receipt): string {
  switch (r.state) {
    case "no-address": return "There is no email address on that registration.";
    case "no-template": return "The “Travel support — checking the journey” letter has been deleted from the standing letters.";
    case "unfilled": return `The letter has nothing to put in ${r.missing.map((m) => `{{${m}}}`).join(", ")}.`;
    default: return "That letter could not be written.";
  }
}

const TRAVEL_CHECK = "training_admin.travel_check";

/** Who has already been asked, so the button does not offer it twice. */
export async function loadTravelChecks(): Promise<string[]> {
  await requireAdmin();
  const rows = await prisma.auditLog.findMany({
    where: { action: TRAVEL_CHECK },
    select: { detail: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const out = new Set<string>();
  for (const r of rows) {
    try {
      const d = JSON.parse(r.detail ?? "{}") as { email?: string; state?: string };
      // Only a letter that actually went counts as asked. A failed send
      // has to stay offered, or somebody is waiting on a reply to a
      // message nobody received.
      if (d.email && (d.state === "sent" || d.state === "sent-to-you")) out.add(d.email.toLowerCase());
    } catch { /* a log line we cannot read is not a reason to fail the page */ }
  }
  return [...out];
}

/* ── distance check by email address ──────────────────────────────── */

const DISTANCE_CHECK = "training_admin.distance_check";

/**
 * Said local (or nothing), registered with a university over two hours
 * away: the letter that asks where they are travelling from. Who it goes
 * to and which school it names come off the registration on the server,
 * never from the page.
 */
async function distanceCheckFor(bookingId: string): Promise<{ mail: SentMail; school: string } | { problem: string }> {
  if (!isId(bookingId)) return { problem: "That is not a seat." };
  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: { submission: { select: { data: true, email: true } }, user: { select: { name: true, email: true } } },
  });
  if (!booking) return { problem: "That registration no longer exists." };
  const answers = (booking.submission?.data ?? {}) as Record<string, unknown>;
  const trainee = typeof answers.trainee_email === "string" ? answers.trainee_email : null;
  const far = [trainee, booking.submission?.email, booking.user?.email].map((e) => institutionOf(e)).find((i) => i && i.band === "far");
  if (!far) return { problem: "Their email address is not at a university over two hours away." };
  const to = booking.submission?.email ?? booking.user?.email ?? trainee;
  const name = registrantName(answers) || booking.user?.name?.trim() || (await accountNameFor(to)) || "";
  const draft = await personLetterDraft("support_check_email", {
    to, name,
    vars: { school: far.school, school_city: far.city, school_travel_time: travelWords({ fsa: "", place: far.city, ...far }) },
  });
  if (!draft.ok) return { problem: draft.receipt.state === "no-template" ? "The “Travel — checking where they are coming from” letter has been deleted from the standing letters." : receiptProblem(draft.receipt) };
  return { mail: draft.mail, school: far.school };
}

/** The letter, shown rather than sent — what the card beside the warning opens with. */
export async function draftDistanceCheck(bookingId: string): Promise<{ ok: boolean; problem?: string; to?: string; subject?: string; body?: string }> {
  await requireAdmin();
  const made = await distanceCheckFor(bookingId);
  if ("problem" in made) return { ok: false, problem: made.problem };
  return { ok: true, to: made.mail.to, subject: made.mail.subject, body: made.mail.body };
}

/** Send it — only ever from a coordinator pressing Send on the draft they read. */
export async function sendDistanceCheck(bookingId: string, edited: { subject: string; body: string }): Promise<{ ok: boolean; problem?: string; receipt?: Receipt }> {
  const admin = await requireAdmin();
  const made = await distanceCheckFor(bookingId);
  if ("problem" in made) return { ok: false, problem: made.problem };
  const subject = edited.subject.trim().replace(/[\r\n]+/g, " ").slice(0, 300);
  const body = edited.body.trim().slice(0, 20_000);
  if (!subject || !body) return { ok: false, problem: "An empty letter is not a letter." };
  const receipt = await sendComposed({ to: made.mail.to, subject, body });
  await logSend(admin.id, DISTANCE_CHECK, { bookingId, email: made.mail.to, school: made.school, state: receipt.state });
  revalidatePath(PAGE);
  return { ok: true, receipt };
}

/** When each address was last asked, so the warning can say so. */
export async function loadDistanceChecks(): Promise<Record<string, string>> {
  await requireAdmin();
  const rows = await prisma.auditLog.findMany({ where: { action: DISTANCE_CHECK }, select: { detail: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 });
  const out: Record<string, string> = {};
  for (const r of rows) {
    try {
      const d = JSON.parse(r.detail ?? "{}") as { email?: string; state?: string };
      if (d.email && (d.state === "sent" || d.state === "sent-to-you") && !out[d.email.toLowerCase()]) out[d.email.toLowerCase()] = r.createdAt.toISOString();
    } catch { /* unreadable log line */ }
  }
  return out;
}

/* ── internal people ─────────────────────────────────────────────── */

/** What an internal person's registration says — what catering reads. */
function internalData(p: InternalPerson) {
  return {
    full_name: p.name,
    trainee_email: p.email || undefined,
    dietary: p.dietary ? ["Other — please describe"] : ["No dietary requirements"],
    dietary_other: p.dietary || undefined,
    // The mark that makes it internal whatever address it carries.
    __internal: true,
  };
}

/** The registrations made for internal people, with who they are for. */
async function internalRegistrations() {
  const form = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 }, select: { id: true } });
  if (!form) return { formId: null, rows: [] as { id: string; name: string; email: string }[] };
  const subs = await prisma.eventFormSubmission.findMany({
    where: { formId: form.id, data: { path: ["__internal"], equals: true } },
    select: { id: true, email: true, data: true },
  });
  const rows = subs.map((s) => {
    const d = (s.data ?? {}) as Record<string, unknown>;
    return { id: s.id, name: String(d.full_name ?? ""), email: s.email ?? "" };
  });
  return { formId: form.id, rows };
}

/** The same person: by address when there is one, by name otherwise. */
const samePerson = (p: { name: string; email: string }, r: { name: string; email: string }) =>
  p.email ? r.email.toLowerCase() === p.email.toLowerCase() : !r.email && r.name === p.name;

/**
 * Save the Internal list.
 *
 * Their dietary needs are copied onto the registrations already made
 * for them, so a change reaches the caterer's list without anybody
 * removing and re-adding them to a session.
 */
export async function saveInternalPeople(raw: unknown): Promise<{ ok: boolean; people?: InternalPerson[]; problem?: string }> {
  const admin = await requireAdmin();
  const parsed = InternalPersonSchema.array().max(200).safeParse(raw);
  if (!parsed.success) return { ok: false, problem: "Every person needs a name; addresses and dietary notes must be short." };
  const people = parsed.data;

  await prisma.platformSetting.upsert({
    where: { key: INTERNAL_KEY },
    create: { key: INTERNAL_KEY, value: JSON.stringify(people) },
    update: { value: JSON.stringify(people) },
  });
  const { rows } = await internalRegistrations();
  for (const p of people) {
    for (const r of rows.filter((x) => samePerson(p, x))) {
      await prisma.eventFormSubmission.update({ where: { id: r.id }, data: { data: internalData(p) } });
    }
  }
  await logSend(admin.id, "training_admin.internal_saved", { count: people.length });
  revalidatePath(PAGE);
  return { ok: true, people };
}

/**
 * Put an internal person in a session, or take them out.
 *
 * Their seat is made confirmed and marked told, so no letter is ever
 * owed on it and no reminder rota counts them twice — it exists so the
 * room count, the check-in list and the caterer know they are coming.
 * Only seats made here are touched: somebody who registered through the
 * form keeps the seat they asked for.
 */
export async function setInternalAttendance(
  person: unknown,
  workshopId: string,
  attending: boolean,
): Promise<{ ok: boolean; problem?: string }> {
  const admin = await requireAdmin();
  const parsed = InternalPersonSchema.safeParse(person);
  if (!parsed.success || !isId(workshopId)) return { ok: false, problem: "That is not a person and a session." };
  const p = parsed.data;
  const list = parseInternal((await prisma.platformSetting.findUnique({ where: { key: INTERNAL_KEY } }))?.value);
  if (!list.some((x) => samePerson(p, x))) return { ok: false, problem: "Add them to the Internal list first." };

  const { formId, rows } = await internalRegistrations();
  if (!formId) return { ok: false, problem: "The Training Week registration form is missing." };
  let reg = rows.find((r) => samePerson(p, r));

  /*
   * Never a second seat in one room. If they asked for this session
   * through the form themselves, that request is their seat — decided
   * like anyone's — and a seat made here beside it would count them twice.
   */
  if (attending && p.email) {
    const theirOwn = await prisma.workshopBooking.findFirst({
      where: {
        workshopId,
        status: { not: "cancelled" },
        submission: { email: { equals: p.email, mode: "insensitive" }, NOT: { data: { path: ["__internal"], equals: true } } },
      },
      select: { id: true },
    });
    if (theirOwn) return { ok: false, problem: `${p.name} already asked for this session through the form — decide that seat in Registrants.` };
  }

  if (!attending) {
    if (reg) await prisma.workshopBooking.deleteMany({ where: { submissionId: reg.id, workshopId } });
  } else {
    if (!reg) {
      const made = await prisma.eventFormSubmission.create({
        data: { formId, email: p.email || null, userId: null, data: internalData(p) },
        select: { id: true },
      });
      reg = { id: made.id, name: p.name, email: p.email };
    }
    const existing = await prisma.workshopBooking.findFirst({ where: { submissionId: reg.id, workshopId }, select: { id: true } });
    const now = new Date();
    const seat = { status: "confirmed", notifiedStatus: "confirmed", notifiedAt: now, approvedAt: now, approvedById: admin.id ?? null };
    if (existing) {
      await prisma.workshopBooking.update({ where: { id: existing.id }, data: seat });
    } else {
      await prisma.workshopBooking.create({ data: { workshopId, submissionId: reg.id, rank: 1, ...seat } });
    }
  }
  await logSend(admin.id, "training_admin.internal_attendance", { name: p.name, workshopId, attending });
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Accept somebody's out-of-town claim despite their postal code — they
 * explained (travelling from elsewhere that week, a second home) — or
 * take the acceptance back. Written on the registration as
 * __ootAccepted, so every seat they hold follows it and the decision
 * model gives them their out-of-town priority again.
 */
export async function setOotAccepted(bookingId: string, accepted: boolean): Promise<{ ok: boolean; problem?: string }> {
  const admin = await requireAdmin();
  if (!isId(bookingId)) return { ok: false, problem: "That is not a seat." };
  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: { submission: { select: { id: true, data: true } } },
  });
  if (!booking?.submission) return { ok: false, problem: "That registration no longer exists." };
  const data = { ...((booking.submission.data ?? {}) as Record<string, unknown>) };
  if (accepted) data.__ootAccepted = true; else delete data.__ootAccepted;
  await prisma.eventFormSubmission.update({ where: { id: booking.submission.id }, data: { data: data as object } });
  await logSend(admin.id, "training_admin.oot_accepted", { bookingId, accepted });
  revalidatePath(PAGE);
  return { ok: true };
}

/* ── highlights ──────────────────────────────────────────────────── */

/** The registration behind a seat, with its data — where highlights live. */
async function registrationOf(bookingId: string) {
  if (!isId(bookingId)) return null;
  const b = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: { submission: { select: { id: true, data: true } } },
  });
  return b?.submission ?? null;
}

/**
 * Highlight a registrant, with the reason. Who did it is taken from the
 * session, never from the page, so a highlight always says truthfully
 * whose it is.
 */
export async function addHighlight(bookingId: string, reason: string): Promise<{ ok: boolean; problem?: string }> {
  const admin = await requireAdmin();
  const problem = highlightProblem(String(reason ?? ""));
  if (problem) return { ok: false, problem };
  const reg = await registrationOf(bookingId);
  if (!reg) return { ok: false, problem: "That registration no longer exists." };

  const data = { ...((reg.data ?? {}) as Record<string, unknown>) };
  const byName = admin.name?.trim()
    || (admin.id ? (await prisma.user.findUnique({ where: { id: admin.id }, select: { name: true } }))?.name?.trim() : null)
    || admin.email || "An admin";
  const next: Highlight = {
    id: randomUUID().slice(0, 12),
    byId: admin.id ?? null,
    byName,
    reason: reason.trim(),
    at: new Date().toISOString(),
  };
  data[HIGHLIGHTS_KEY] = [...highlightsOf(data), next];
  await prisma.eventFormSubmission.update({ where: { id: reg.id }, data: { data: data as object } });
  await logSend(admin.id, "training_admin.highlighted", { bookingId, reason: next.reason });
  revalidatePath(PAGE);
  return { ok: true };
}

/** Take a highlight off. Written to the audit log with what it said. */
export async function removeHighlight(bookingId: string, highlightId: string): Promise<{ ok: boolean; problem?: string }> {
  const admin = await requireAdmin();
  const reg = await registrationOf(bookingId);
  if (!reg) return { ok: false, problem: "That registration no longer exists." };
  const data = { ...((reg.data ?? {}) as Record<string, unknown>) };
  const all = highlightsOf(data);
  const going = all.find((h) => h.id === highlightId);
  if (!going) return { ok: true };
  data[HIGHLIGHTS_KEY] = all.filter((h) => h.id !== highlightId);
  await prisma.eventFormSubmission.update({ where: { id: reg.id }, data: { data: data as object } });
  await logSend(admin.id, "training_admin.highlight_removed", { bookingId, by: going.byName, reason: going.reason });
  revalidatePath(PAGE);
  return { ok: true };
}
