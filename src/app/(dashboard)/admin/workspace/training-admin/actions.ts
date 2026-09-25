"use server";

/**
 * Server actions behind Workspace → Process → Admin.
 *
 * Every one re-checks the caller's role. A server action is a public
 * endpoint with a nice calling convention, not a private function: the
 * page guard says who may SEE the tab and has no bearing on who may POST
 * to it.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { parseRules, validateRules, type Rule } from "@/lib/allocation/model";
import {
  CATERING_COPY_KEY, isAudience, isId, REGISTRANT_VIEWS_KEY, RULES_KEY,
  type Audience, type EmailPlan, type SubmissionRow, type TemplateBundle, type WorkshopInput,
} from "@/lib/allocation/admin-types";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_WHERE } from "@/lib/allocation/symposium-2026";
import { versionLabel, versionRoot } from "@/lib/formbuilder/versions";
import { ViewSchema, isBuiltIn as isBuiltInView, type View } from "@/lib/allocation/registrant-views";
import { registrantName } from "@/lib/allocation/registrant-name";
import { EntrySchema, type Snapshot } from "@/lib/allocation/catering";
import { parseForm } from "@/lib/formbuilder/types";
import { rankedSessions } from "@/lib/formbuilder/submit";
import { sendDecisionLetter, sendPersonLetter } from "@/lib/formbuilder/acknowledge";
import { travelFromPostcode, travelWords } from "@/lib/travel/from-postcode";
import {
  describe as describeDecision, isDecision, letterDue, type Decision,
} from "@/lib/allocation/decisions";
import type { Receipt } from "@/lib/formbuilder/receipt";
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
      status: true,
      user: { select: { email: true, name: true } },
      workshop: { select: { id: true, title: true, startDateTime: true, endDateTime: true, locationName: true } },
    },
    orderBy: { bookedAt: "asc" },
  });

  const seen = new Set<string>();
  const workshopsSeen = new Set<string>();
  const recipients: EmailPlan["recipients"] = [];
  for (const b of bookings) {
    const email = b.user?.email;
    workshopsSeen.add(b.workshop.id);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const v = sessionVars(b.workshop);
    recipients.push({
      email,
      name: b.user?.name ?? "",
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
      const vars = {
        ...globals,
        name: r.name || "there",
        first_name: (r.name || "").trim().split(/\s+/)[0] || "there",
        session: r.workshop,
        session_date: r.sessionDate,
        session_time: r.sessionTime,
        session_venue: r.sessionVenue,
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
        await sendMail({ to: r.email, subject, text });
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
 * Record what was just copied for the caterer, so the next copy can be
 * "only what changed". Validated: a server action is a public endpoint.
 */
export async function saveCateringSnapshot(entries: unknown): Promise<{ ok: boolean; snapshot?: Snapshot; problem?: string }> {
  const admin = await requireAdmin();
  const parsed = EntrySchema.array().max(5000).safeParse(entries);
  if (!parsed.success) return { ok: false, problem: "That list could not be read." };
  const snapshot: Snapshot = { at: new Date().toISOString(), by: admin.name ?? "", entries: parsed.data };
  const value = JSON.stringify(snapshot);
  await prisma.platformSetting.upsert({
    where: { key: CATERING_COPY_KEY },
    create: { key: CATERING_COPY_KEY, value },
    update: { value },
  });
  return { ok: true, snapshot };
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
 * workshop, or everything owed at once (sendSeatLetter / sendLetters).
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
    const sent = await sendSeatLetter(bookingId);
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

/**
 * Send the letter a seat owes, if it owes one.
 *
 * The letter is the move from what the registrant was last told to where
 * the seat stands NOW — so approve-then-waitlist before sending is one
 * waitlist letter, and a decision taken back to what they already know
 * owes nothing. Only a letter that actually went out marks them told; a
 * failed one stays owed, so it shows up again rather than vanishing.
 */
export async function sendSeatLetter(bookingId: string): Promise<{ ok: boolean; delivered: boolean; receipt?: Receipt; problem?: string }> {
  const admin = await requireAdmin();
  if (!isId(bookingId)) return { ok: false, delivered: false, problem: "That is not a seat." };
  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, status: true, notifiedStatus: true, decisionNote: true, bookedAt: true, approvedAt: true,
      workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true } },
      user: { select: { name: true, email: true } },
      submission: { select: { data: true, email: true } },
    },
  });
  if (!booking) return { ok: false, delivered: false, problem: "That seat no longer exists." };
  const templateId = letterDue(booking.notifiedStatus, booking.status);
  if (!templateId) return { ok: true, delivered: false };

  const told = isDecision(booking.notifiedStatus) ? booking.notifiedStatus : "pending";
  const answers = ((booking.submission?.data ?? {}) as Record<string, unknown>) as Answers;
  /*
   * The calendar entry follows the SEAT, not the letter: an approval
   * carries one to add; a seat they were told was approved and no longer
   * is carries the withdrawal, or the session stays in their calendar and
   * they turn up to a room with no place for them.
   */
  const calendar =
    booking.status === "confirmed" ? "add" as const
    : told === "confirmed" ? "remove" as const
    : undefined;

  const receipt = await sendDecisionLetter(templateId, {
    to: booking.submission?.email ?? booking.user?.email ?? null,
    name: registrantName(answers) || booking.user?.name?.trim() || (await accountNameFor(booking.submission?.email)) || "",
    session: booking.workshop.title,
    start: booking.workshop.startDateTime,
    end: booking.workshop.endDateTime,
    venue: booking.workshop.locationName,
    note: booking.decisionNote?.trim() || null,
    bookingId: booking.id,
    bookedAt: booking.bookedAt,
    decidedAt: booking.approvedAt ?? new Date(),
    calendar,
  });

  if (delivered(receipt)) {
    await prisma.workshopBooking.update({
      where: { id: booking.id },
      data: { notifiedStatus: booking.status, notifiedAt: new Date() },
    });
  }
  await logSend(admin.id, "training_admin.seat_letter", {
    bookingId, template: templateId, state: receipt.state, workshop: booking.workshop.title,
  });
  revalidatePath(PAGE);
  return { ok: true, delivered: delivered(receipt), receipt };
}

/**
 * Send every letter owed — across the week, or for one workshop.
 *
 * One at a time through sendSeatLetter, so each is the same letter a
 * single send would be, and one failure never stops the rest.
 */
export async function sendLetters(scope: { workshopId?: string } = {}): Promise<{
  ok: boolean; sent: number; notSent: number; problem?: string;
}> {
  await requireAdmin();
  if (scope.workshopId && !isId(scope.workshopId)) return { ok: false, sent: 0, notSent: 0, problem: "That is not a workshop." };
  const eventId = await trainingWeekEventId();
  if (!eventId) return { ok: false, sent: 0, notSent: 0, problem: "No Training Week event." };
  const seats = await prisma.workshopBooking.findMany({
    where: { workshop: { eventId, ...(scope.workshopId ? { id: scope.workshopId } : {}) } },
    select: { id: true, status: true, notifiedStatus: true },
    orderBy: { bookedAt: "asc" },
  });
  let sent = 0, notSent = 0;
  for (const s of seats) {
    if (!letterDue(s.notifiedStatus, s.status)) continue;
    const r = await sendSeatLetter(s.id);
    if (r.delivered) sent++; else notSent++;
  }
  return { ok: true, sent, notSent };
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
    const r = await decideSeat(id, to, undefined, opts);
    if (!r.ok) { failed += 1; continue; }
    done += 1;
    if (opts?.send && r.receipt && !r.letterOwed) sent += 1;
  }
  return { ok: true, done, failed, sent };
}

/** The letters a set of already-decided seats owes. */
export async function sendSeatLetters(
  bookingIds: string[],
): Promise<{ ok: boolean; sent: number; failed: number }> {
  await requireAdmin();
  const ids = [...new Set(bookingIds)].filter(isId).slice(0, MAX_BULK);
  let sent = 0, failed = 0;
  for (const id of ids) {
    const r = await sendSeatLetter(id);
    if (r.ok && r.delivered) sent += 1; else failed += 1;
  }
  return { ok: true, sent, failed };
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
): Promise<{ ok: boolean; problem?: string; receipt?: Receipt }> {
  const admin = await requireAdmin();
  if (!isId(bookingId)) return { ok: false, problem: "That is not a seat." };

  const booking = await prisma.workshopBooking.findUnique({
    where: { id: bookingId },
    select: {
      submission: { select: { data: true, email: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!booking) return { ok: false, problem: "That registration no longer exists." };

  const answers = (booking.submission?.data ?? {}) as Record<string, unknown>;
  const postcode = String(answers.postcode ?? "").trim();
  const estimate = travelFromPostcode(postcode);
  if (!estimate) return { ok: false, problem: "There is no postal code on that registration to ask about." };

  const to = booking.submission?.email ?? booking.user?.email ?? null;
  const name = registrantName(answers) || booking.user?.name?.trim() || (await accountNameFor(to)) || "";
  const receipt = await sendPersonLetter("support_check_postcode", {
    to, name,
    vars: { postcode: estimate.fsa, travel_time: travelWords(estimate) },
  });

  await logSend(admin.id, TRAVEL_CHECK, { bookingId, email: to, postcode: estimate.fsa, state: receipt.state });
  revalidatePath(PAGE);
  return { ok: true, receipt };
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
