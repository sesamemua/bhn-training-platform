/**
 * Credit-expiry pipeline.
 *
 * Background — BioHubNet's ENGAGE program awards training credits to
 * Highly Qualified Personnel (HQP) at eligible Ontario institutions.
 * Per published policy, those credits expire 365 days from the
 * approval date. (The policy also expires the unused remainder if
 * fewer than 2 500 credits are used in the first 6 months; we surface
 * that warning in the UI but don't enforce it yet — see follow-up.)
 *
 * What this service does
 *   • CREDIT_GRANT_TTL_DAYS = 365 — single source of truth for the
 *     timer length. Re-export so admin pages can show it accurately.
 *   • grantCredits()   — preferred entry-point for issuing credits.
 *     Updates User.credits, writes the CreditTransaction with the
 *     expiry stamp set, returns the row.
 *   • sweepExpiredGrants() — finds every live grant past expiresAt
 *     and deducts the unspent remainder from the user's balance.
 *     Writes a paired "expiry" debit so the ledger keeps narrating
 *     where the credits went. Idempotent — second run touches 0.
 *   • notifyExpiringGrants() — sends 90/30/7-day-before-expiry
 *     warnings. Tracks which milestones have been sent per
 *     CreditTransaction so the same user doesn't get pinged twice.
 *     Best-effort email; failures don't block the sweep.
 *   • runDailyMaintenance() — composes the two for cron use.
 *
 * Why we don't track per-grant balances precisely
 *   Phase 1 keeps User.credits as the single source-of-truth balance
 *   (we update it on grant + spend + expiry). The CreditTransaction
 *   ledger is the audit trail, not the live balance. When a grant
 *   expires we deduct the *remaining* unspent amount of that specific
 *   grant — computed as grant.amount - grant.expiredAmount - (debits
 *   that consumed it). For Phase-1 trainee volumes (single grant per
 *   user is the common case), this maps cleanly. The more elaborate
 *   FIFO-per-grant accounting that some accountants would expect is
 *   a follow-up if/when a trainee accumulates multiple overlapping
 *   grants.
 */
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail";
import { isPausedPath } from "@/lib/deploy/paused";

/** Single source of truth for the policy length. */
export const CREDIT_GRANT_TTL_DAYS = 365;
export const CREDIT_GRANT_TTL_MS = CREDIT_GRANT_TTL_DAYS * 24 * 60 * 60 * 1000;
/** Notification milestones (days before expiry) — most → least urgent. */
export const NOTIFICATION_MILESTONES = [90, 30, 7] as const;

/**
 * Issue credits to a user with an attached expiry timestamp.
 * Preferred entry point for any admin / system that grants credits;
 * keeps the User.credits balance + audit ledger + expiry tracking
 * in lock-step.
 */
export async function grantCredits(
  userId: string,
  amount: number,
  reason: string = "admin_grant",
  expiresAt: Date | null = new Date(Date.now() + CREDIT_GRANT_TTL_MS),
): Promise<{ ok: true; newBalance: number; transactionId: string }> {
  if (amount <= 0) throw new Error("grantCredits: amount must be > 0");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user) throw new Error("grantCredits: user not found");

    const newBalance = user.credits + amount;
    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });
    const row = await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type: "credit",
        reason,
        balanceAfter: newBalance,
        expiresAt,
      },
      select: { id: true },
    });
    return { ok: true as const, newBalance, transactionId: row.id };
  });
}

/**
 * Find every grant past its expiresAt that still has unexpired
 * balance, deduct the remainder from the user, and stamp the grant
 * as expired so the next sweep doesn't touch it again.
 */
export async function sweepExpiredGrants(): Promise<{
  grantsExpired: number;
  creditsDeducted: number;
  usersAffected: number;
}> {
  const now = new Date();
  // Grants that have hit their expiry timer and haven't been swept yet.
  const expired = await prisma.creditTransaction.findMany({
    where: {
      type: "credit",
      expiresAt: { not: null, lt: now },
      expiredAt: null,
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      expiredAmount: true,
    },
    orderBy: { expiresAt: "asc" },
  });

  let grantsExpired = 0;
  let creditsDeducted = 0;
  const userIds = new Set<string>();

  for (const g of expired) {
    const remaining = Math.max(0, g.amount - g.expiredAmount);
    await prisma.$transaction(async (tx) => {
      if (remaining > 0) {
        // Cap deduction at the user's current balance — we never go
        // negative. If the trainee already spent down past this
        // grant, the remainder is effectively 0 from their seat
        // even if our per-grant math says otherwise.
        const user = await tx.user.findUnique({
          where: { id: g.userId },
          select: { credits: true },
        });
        const toDeduct = Math.min(user?.credits ?? 0, remaining);

        if (toDeduct > 0) {
          const newBalance = (user?.credits ?? 0) - toDeduct;
          await tx.user.update({
            where: { id: g.userId },
            data: { credits: newBalance },
          });
          await tx.creditTransaction.create({
            data: {
              userId: g.userId,
              amount: -toDeduct,
              type: "debit",
              reason: "expiry",
              balanceAfter: newBalance,
            },
          });
          creditsDeducted += toDeduct;
        }

        await tx.creditTransaction.update({
          where: { id: g.id },
          data: {
            expiredAt: now,
            expiredAmount: g.expiredAmount + remaining,
          },
        });
      } else {
        // Already fully consumed before expiry — just stamp.
        await tx.creditTransaction.update({
          where: { id: g.id },
          data: { expiredAt: now },
        });
      }
    });
    grantsExpired++;
    userIds.add(g.userId);
  }

  return { grantsExpired, creditsDeducted, usersAffected: userIds.size };
}

/**
 * For each milestone (90, 30, 7 days before expiry), send a warning
 * email to grants that have crossed into the milestone window since
 * the last sweep and haven't been notified yet. Stamps the matching
 * notified*At field so the same milestone doesn't fire again on the
 * next run.
 *
 * SMTP not configured → notifications are silently skipped (we still
 * stamp the field, so the user won't get a barrage on the first day
 * SMTP comes online).
 */
export async function notifyExpiringGrants(): Promise<{
  notificationsSent: number;
  notificationsSkipped: number;
}> {
  // Where ENGAGE is paused (deploy/paused-routes.mjs) the email's links
  // (/courses, /credits) lead to /paused and there is nothing to spend
  // credits on, so treat it like SMTP being off: skip, but still stamp.
  const smtp = mailConfigured() && !isPausedPath("/courses");
  const now = new Date();
  let sent = 0;
  let skipped = 0;

  for (const days of NOTIFICATION_MILESTONES) {
    const milestoneField =
      days === 90 ? "notified90At" : days === 30 ? "notified30At" : "notified7At";
    // Grants where expiresAt is now within `days` of now AND we
    // haven't sent the milestone yet.
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const rows = await prisma.creditTransaction.findMany({
      where: {
        type: "credit",
        expiresAt: { not: null, gt: now, lte: cutoff },
        expiredAt: null,
        [milestoneField]: null,
      },
      include: {
        user: { select: { id: true, email: true, name: true, credits: true } },
      },
    });

    for (const row of rows) {
      if (!smtp) {
        skipped++;
      } else {
        const remaining = Math.max(0, row.amount - row.expiredAmount);
        const expiresWhen = row.expiresAt!.toLocaleDateString("en-CA", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
        const greeting = row.user.name
          ? `Hi ${row.user.name.split(/\s+/)[0]},`
          : "Hi,";
        const urgency =
          days >= 90
            ? "There's still plenty of time, but worth marking your calendar."
            : days >= 30
              ? "Now's a good moment to plan which courses you'd like to take."
              : "These will expire very soon — enroll in any courses you're considering now.";
        const text =
          `${greeting}\n\n` +
          `Your BioHubNet training credits expire in ${days} days (${expiresWhen}).\n\n` +
          `Current balance:   ${row.user.credits.toLocaleString()} credits\n` +
          `From this grant:   ${remaining.toLocaleString()} credits expiring\n\n` +
          `${urgency}\n\n` +
          `Browse the catalog:\n` +
          `  https://bhn-training-platform.vercel.app/courses\n\n` +
          `View your credit balance + transaction history:\n` +
          `  https://bhn-training-platform.vercel.app/credits\n\n` +
          `Questions? Reply to this email or contact support@biohubnet.ca.\n\n` +
          `— BioHubNet`;
        try {
          await sendMail({
            to: row.user.email,
            subject:
              days >= 30
                ? `Your BHN training credits expire in ${days} days`
                : `Last call — your BHN training credits expire in ${days} days`,
            text,
          });
          sent++;
        } catch (err) {
          console.error("credit-expiry email failed for", row.userId, (err as Error).message);
          skipped++;
        }
      }

      await prisma.creditTransaction.update({
        where: { id: row.id },
        data: { [milestoneField]: now },
      });
    }
  }

  return { notificationsSent: sent, notificationsSkipped: skipped };
}

/** Cron entry-point — does both the expire-and-deduct sweep and the
 *  upcoming-expiry notification pass. Idempotent. */
export async function runDailyMaintenance(): Promise<{
  sweep: Awaited<ReturnType<typeof sweepExpiredGrants>>;
  notifications: Awaited<ReturnType<typeof notifyExpiringGrants>>;
}> {
  // Notifications first so users hear about the deduction BEFORE it
  // happens (if today's run includes both a 7-day notify and a
  // tomorrow's sweep for the same grant, we want the warning to
  // land first). The order matters less for steady-state; this just
  // makes the first transition cleaner.
  const notifications = await notifyExpiringGrants();
  const sweep = await sweepExpiredGrants();
  return { sweep, notifications };
}

/**
 * Per-user expiring-credits summary for the dashboard banner +
 * /credits page. Returns at most one upcoming grant (the soonest).
 */
export async function nextExpiringGrant(userId: string): Promise<{
  amount: number;
  expiresAt: Date;
  daysRemaining: number;
} | null> {
  const next = await prisma.creditTransaction.findFirst({
    where: {
      userId,
      type: "credit",
      expiresAt: { not: null, gt: new Date() },
      expiredAt: null,
    },
    orderBy: { expiresAt: "asc" },
    select: { amount: true, expiredAmount: true, expiresAt: true },
  });
  if (!next || !next.expiresAt) return null;
  const remaining = Math.max(0, next.amount - next.expiredAmount);
  if (remaining <= 0) return null;
  const ms = next.expiresAt.getTime() - Date.now();
  return {
    amount: remaining,
    expiresAt: next.expiresAt,
    daysRemaining: Math.max(0, Math.ceil(ms / 86_400_000)),
  };
}
