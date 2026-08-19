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

  await prisma.workshop.create({
    data: {
      eventId,
      slug,
      title: input.title,
      kind: input.kind,
      startDateTime: new Date(input.startDateTime),
      endDateTime: new Date(input.endDateTime),
      capacity: input.capacity,
      waitlistCapacity: input.waitlistCapacity,
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
  let sent = 0;
  let failed = 0;
  for (const r of plan.recipients) {
    const text = input.body.replace(/\{\{\s*name\s*\}\}/g, r.name || "there");
    // One message each, sequentially. Not a bcc blast: a bcc means one
    // bounce loses the lot, and personalising the greeting is the least
    // a registrant is owed.
    const res = await sendMail({ to: r.email, subject: input.subject, text }).catch(() => null);
    if (res) sent += 1;
    else failed += 1;
  }

  // actorId is required and FK-constrained, so a send by a session
  // without a resolvable user is left unlogged rather than throwing
  // after the mail has already gone out.
  if (admin.id) await prisma.auditLog
    .create({
      data: {
        action: "training_admin.email_sent",
        actorId: admin.id,
        detail: JSON.stringify({
          audience: input.audience,
          workshopId: input.workshopId ?? null,
          subject: input.subject,
          sent,
          failed,
        }),
      },
    })
    .catch(() => null);

  revalidatePath(PAGE);
  return { ok: true, sent, failed };
}
