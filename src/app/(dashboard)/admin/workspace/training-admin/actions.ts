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
  isAudience, isId, RULES_KEY,
  type Audience, type EmailPlan, type SubmissionRow, type TemplateBundle, type WorkshopInput,
} from "@/lib/allocation/admin-types";
import { REGISTRATION_FORM_SLUG } from "@/lib/allocation/symposium-2026";
import { parseForm } from "@/lib/formbuilder/types";
import { rankedSessions } from "@/lib/formbuilder/submit";
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
  const form = await prisma.eventForm.findUnique({
    where: { slug: REGISTRATION_FORM_SLUG },
    select: { id: true, fields: true },
  });
  if (!form) return [];

  const rows = await prisma.eventFormSubmission.findMany({
    where: { formId: form.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, data: true, email: true, createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const doc = parseForm(form.fields);
  return rows.map((r) => {
    const data = (r.data ?? {}) as Record<string, unknown>;
    const answers = data as Answers;
    return {
      id: r.id,
      // Submitted timestamp: what first-come-first-served is decided on.
      at: r.createdAt.toISOString(),
      isTest: data.__test === true,
      name: [answers.first_name, answers.last_name].filter(Boolean).join(" ")
        || (typeof answers.trainee_name === "string" ? answers.trainee_name : "")
        || r.user?.name
        || "",
      email: r.email ?? r.user?.email ?? "",
      status: typeof answers.bhn_status === "string" ? answers.bhn_status : "",
      sessions: rankedSessions(doc, answers),
      answers: Object.fromEntries(
        doc.fields
          .filter((f) => f.type !== "note" && answers[f.key] !== undefined)
          .map((f) => [f.label, Array.isArray(answers[f.key])
            ? (answers[f.key] as string[]).join(" · ")
            : String(answers[f.key] ?? "")]),
      ),
    };
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
