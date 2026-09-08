/**
 * Turning EQUIP rows into the facts a post is written from.
 *
 * The only module here that touches Prisma. Everything downstream —
 * the planner, the copy, the asset spec — is a pure function of what
 * this returns, which is what lets all of it be tested against fixed
 * data rather than against whatever is in the database today.
 */
import type { PrismaClient } from "@prisma/client";
import type { CycleFacts, Recipient } from "./types";

/** Matches the copy on the public VentureConnect page. */
export const VC_MAX_AWARD = 5000;
export const VC_APPLY_PATH = "/apply/venture-connect";

/**
 * The cycles worth posting about: open or extended, not yet past.
 *
 * A closed cycle is deliberately excluded — its reminders are history
 * and its recipients post is made from the decisions, not the window.
 */
export async function openCycles(prisma: PrismaClient, now: Date): Promise<CycleFacts[]> {
  const rows = await prisma.equipDeadline.findMany({
    where: {
      stream: "venture_connect",
      status: { in: ["open", "extended", "scheduled"] },
      deadlineAt: { gte: now },
    },
    orderBy: { deadlineAt: "asc" },
    select: { id: true, cycleLabel: true, deadlineAt: true, originalDeadlineAt: true },
  });
  return rows.map(toFacts);
}

export async function cycleById(prisma: PrismaClient, id: string): Promise<CycleFacts | null> {
  const row = await prisma.equipDeadline.findUnique({
    where: { id },
    select: { id: true, cycleLabel: true, deadlineAt: true, originalDeadlineAt: true },
  });
  return row ? toFacts(row) : null;
}

function toFacts(row: {
  id: string; cycleLabel: string | null; deadlineAt: Date; originalDeadlineAt: Date;
}): CycleFacts {
  return {
    stream: "venture_connect",
    deadlineId: row.id,
    // A cycle nobody labelled is named by its date rather than left
    // blank — "the  cycle" in a post is worse than a slightly clumsy one.
    cycleLabel: row.cycleLabel?.trim() || monthLabel(row.deadlineAt),
    deadlineAt: row.deadlineAt,
    originalDeadlineAt: row.originalDeadlineAt,
    maxAward: VC_MAX_AWARD,
    applyPath: VC_APPLY_PATH,
  };
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", month: "long", year: "numeric",
  }).format(d);
}

/**
 * Who may be named in a recipients post for this cycle.
 *
 * Two gates, both of which must pass. The application has to have been
 * decided with money — approved or funded, with an amount — and the
 * applicant has to have agreed to be named. Consent defaults to false,
 * so the failure mode is a post that names fewer people than it could,
 * which is the right way round.
 *
 * A cycle has no foreign key from its applications, so membership is by
 * decision date falling inside the window. Stated here rather than
 * assumed at the call site.
 */
export async function consentingRecipients(
  prisma: PrismaClient,
  cycle: CycleFacts,
): Promise<{ recipients: Recipient[]; withheld: number }> {
  const rows = await prisma.equipApplication.findMany({
    where: {
      stream: "venture_connect",
      status: { in: ["approved", "funded"] },
      approvedAmount: { not: null },
      decidedAt: { lte: cycle.deadlineAt, gte: new Date(cycle.deadlineAt.getTime() - 120 * 86_400_000) },
    },
    select: { applicantName: true, approvedAmount: true, formData: true, publicityConsent: true },
    orderBy: { approvedAmount: "desc" },
  });

  const recipients: Recipient[] = [];
  let withheld = 0;
  for (const r of rows) {
    if (!r.publicityConsent) { withheld++; continue; }
    const form = (r.formData ?? {}) as { companyName?: string; fullName?: string };
    const name = (r.applicantName ?? form.fullName ?? "").trim();
    if (!name) { withheld++; continue; }
    recipients.push({
      name,
      venture: (form.companyName ?? "").trim() || "their venture",
      amount: r.approvedAmount,
    });
  }
  return { recipients, withheld };
}
