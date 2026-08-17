/**
 * Which issue is "the current one".
 *
 * Before the calendar existed, both Compose and Review asked for the most
 * recent issue that wasn't sent — and since nothing ever marked an issue
 * sent, that resolved to the SAME row forever. Twelve months of planning
 * sat on top of one immortal draft: October's leads would have pasted
 * into September's issue and nobody would have been told.
 *
 * Now the calendar decides. Each cycle owns exactly one issue, created on
 * demand and recorded on `NewsletterCycle.issueId`, so "this month's
 * newsletter" is a fact about the schedule rather than a guess about
 * timestamps. With no calendar at all the old behaviour still applies,
 * so the workshop keeps working on its own.
 */
import { prisma } from "@/lib/prisma";

export interface ResolvedIssue {
  issueId: string;
  /** The cycle this issue belongs to, when the calendar is in use. */
  cycleId: string | null;
  /** "YYYY-MM-01" of the cycle, for labelling. */
  month: string | null;
  sendDate: string | null;
  cycleStatus: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
}

function monthTitle(month: string): { title: string; dateline: string } {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { title: `${label} Newsletter`, dateline: label };
}

/**
 * The cycle currently being produced: the one whose window contains today,
 * else the next one due, else the most recent. Pure selection — no writes.
 */
export async function currentCycle(today: string) {
  const inFlight = await prisma.newsletterCycle.findFirst({
    where: { draftOpen: { lte: today }, sendDate: { gte: today }, status: { not: "sent" } },
    orderBy: { sendDate: "asc" },
  });
  if (inFlight) return inFlight;

  const upcoming = await prisma.newsletterCycle.findFirst({
    where: { sendDate: { gte: today }, status: { not: "sent" } },
    orderBy: { sendDate: "asc" },
  });
  if (upcoming) return upcoming;

  return prisma.newsletterCycle.findFirst({ orderBy: { sendDate: "desc" } });
}

/**
 * Resolve — and if necessary create — the issue for the current cycle.
 * Falls back to the pre-calendar behaviour when no cycles exist.
 */
export async function resolveCurrentIssue(today: string): Promise<ResolvedIssue> {
  const cycle = await currentCycle(today);

  if (cycle) {
    if (cycle.issueId) {
      const existing = await prisma.newsletterIssue.findUnique({
        where: { id: cycle.issueId },
        select: { id: true },
      });
      if (existing) {
        return {
          issueId: existing.id,
          cycleId: cycle.id,
          month: cycle.month,
          sendDate: cycle.sendDate,
          cycleStatus: cycle.status,
          approvedAt: cycle.approvedAt,
          approvedByName: cycle.approvedByName,
        };
      }
    }

    // No issue yet for this month — open one and bind it.
    const { title, dateline } = monthTitle(cycle.month);
    const issue = await prisma.newsletterIssue.create({ data: { title, dateline } });
    await prisma.newsletterCycle.update({
      where: { id: cycle.id },
      data: { issueId: issue.id },
    });
    return {
      issueId: issue.id,
      cycleId: cycle.id,
      month: cycle.month,
      sendDate: cycle.sendDate,
      cycleStatus: cycle.status,
      approvedAt: cycle.approvedAt,
      approvedByName: cycle.approvedByName,
    };
  }

  // ── no calendar: the original behaviour ──────────────────────────
  const loose = await prisma.newsletterIssue.findFirst({
    where: { status: { not: "sent" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (loose) {
    return {
      issueId: loose.id,
      cycleId: null,
      month: null,
      sendDate: null,
      cycleStatus: null,
      approvedAt: null,
      approvedByName: null,
    };
  }

  const label = new Date().toLocaleString("en-CA", { month: "long", year: "numeric" });
  const created = await prisma.newsletterIssue.create({
    data: { title: `${label} Newsletter`, dateline: label },
  });
  return {
    issueId: created.id,
    cycleId: null,
    month: null,
    sendDate: null,
    cycleStatus: null,
    approvedAt: null,
    approvedByName: null,
  };
}
