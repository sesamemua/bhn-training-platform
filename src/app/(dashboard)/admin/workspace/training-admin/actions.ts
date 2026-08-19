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
import { RULES_KEY, type Audience, type EmailPlan, type WorkshopInput } from "@/lib/allocation/admin-types";

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
export async function previewAudience(eventId: string, audience: Audience, workshopId?: string): Promise<EmailPlan> {
  await requireAdmin();
  const bookings = await prisma.workshopBooking.findMany({
    where: {
      workshop: { eventId, ...(workshopId ? { id: workshopId } : {}) },
      ...(audience === "all" ? { status: { not: "cancelled" } } : { status: audience }),
    },
    select: {
      status: true,
      user: { select: { email: true, name: true } },
      workshop: { select: { title: true } },
    },
    orderBy: { bookedAt: "asc" },
  });

  const seen = new Set<string>();
  const recipients: EmailPlan["recipients"] = [];
  for (const b of bookings) {
    const email = b.user?.email;
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      email,
      name: b.user?.name ?? "",
      status: b.status,
      workshop: b.workshop.title,
    });
  }
  return { recipients, configured: mailConfigured() };
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
}): Promise<{ ok: boolean; sent: number; failed: number; problem?: string }> {
  const admin = await requireAdmin();
  if (!input.confirmed) {
    return { ok: false, sent: 0, failed: 0, problem: "Not confirmed." };
  }
  if (!input.subject.trim() || !input.body.trim()) {
    return { ok: false, sent: 0, failed: 0, problem: "A subject and a message are both needed." };
  }
  if (!mailConfigured()) {
    return { ok: false, sent: 0, failed: 0, problem: "Mail is not configured on this deployment." };
  }

  const plan = await previewAudience(input.eventId, input.audience, input.workshopId);
  if (plan.recipients.length === 0) {
    return { ok: false, sent: 0, failed: 0, problem: "That audience is empty." };
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
      const text = input.body.replace(/\{\{\s*name\s*\}\}/g, r.name || "there");
      // One message each, sequentially. Not a bcc blast: a bcc means one
      // bounce loses the lot, and personalising the greeting is the least
      // a registrant is owed.
      //
      // Counted by control flow, not by a return value. sendMail resolves
      // to undefined, so testing what it returns marked every DELIVERED
      // message as failed — and an admin told "0 sent, 240 failed" sends
      // the whole thing again.
      try {
        await sendMail({ to: r.email, subject: input.subject, text });
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
