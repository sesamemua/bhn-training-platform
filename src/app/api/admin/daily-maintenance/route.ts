/**
 * Consolidated daily maintenance — runs every cleanup the platform
 * needs in a single Vercel cron call. Replaces the prior pair of
 * hourly+daily crons that exceeded Vercel Hobby's 1-cron-per-day
 * cap; both jobs collapse into this 06:00 UTC sweep.
 *
 *   POST /api/admin/daily-maintenance
 *   GET  /api/admin/daily-maintenance   (Vercel cron sends GET)
 *
 * Composes
 *   • newsletter reminders    — advances cycle statuses and sends any
 *                                nudge whose day has arrived (folded in
 *                                here rather than taking a third cron
 *                                slot, which the plan does not allow)
 *   • sweepExpiredPhantoms()  — deletes any phantom user past TTL
 *   • runDailyMaintenance()   — expires credit grants past their
 *                                365-day TTL + sends 90/30/7-day
 *                                notification emails
 *
 * Both sub-sweepers are idempotent — second run inside the same
 * window does nothing. The individual endpoints
 *   /api/admin/phantom-users/sweep
 *   /api/admin/credits/sweep
 * stay live so admins can still trigger either one manually from
 * the dashboard "Run sweep now" buttons.
 *
 * Trade-off vs the previous hourly phantom sweep: phantoms can now
 * live up to ~24h past their TTL before cleanup arrives. Functional
 * impact is minimal — phantoms are already test fixtures, and the
 * accountKind="phantom" filter keeps them out of every "real" stat
 * the admin UI surfaces. If hourly cadence becomes important, the
 * fix is a Vercel Pro upgrade.
 *
 * Auth: Vercel cron bearer secret OR admin session.
 */
import { NextRequest, NextResponse } from "next/server";
import { advanceCycleStatuses } from "@/lib/newsletter/calendar";
import { getNewsletterConfig } from "@/lib/newsletter/config";
import { sweepDueReminders } from "@/lib/newsletter/reminders";
import { requireRole } from "@/lib/auth";
import { sweepExpiredPhantoms } from "@/lib/phantom";
import { runDailyMaintenance } from "@/lib/credits/expiry";

export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const cronAuthed = cronSecret && auth === `Bearer ${cronSecret}`;
  if (!cronAuthed) {
    const session = await requireRole("admin").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Run the two sweeps independently. If one throws, we still want
  // the other to attempt its work — partial maintenance is better
  // than none. Results are echoed back to the cron log for ops
  // visibility.
  const startedAt = new Date().toISOString();
  const results: {
    phantoms: { deleted?: number; failed?: number; error?: string };
    credits:  {
      sweep?: { grantsExpired: number; creditsDeducted: number; usersAffected: number };
      notifications?: { notificationsSent: number; notificationsSkipped: number };
      error?: string;
    };
    newsletter: {
      activated?: number;
      cycleSent?: number;
      due?: number;
      sent?: number;
      skipped?: number;
      failed?: number;
      error?: string;
    };
  } = { phantoms: {}, credits: {}, newsletter: {} };

  try {
    const r = await sweepExpiredPhantoms();
    results.phantoms = { deleted: r.deleted, failed: r.failed };
  } catch (err) {
    results.phantoms = { error: (err as Error).message };
  }

  try {
    const r = await runDailyMaintenance();
    results.credits = { sweep: r.sweep, notifications: r.notifications };
  } catch (err) {
    results.credits = { error: (err as Error).message };
  }

  try {
    // Today in Toronto, not UTC: the cron fires at 06:00 UTC, which is
    // still the previous evening locally, and a reminder scheduled for
    // "the 14th" must not go out on the evening of the 13th.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const config = await getNewsletterConfig();
    const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
    const advanced = await advanceCycleStatuses(today);
    const swept = await sweepDueReminders({
      today,
      config,
      workshopUrl: `${base}/admin/workspace/marketing/newsletter`,
    });
    results.newsletter = {
      activated: advanced.activated,
      cycleSent: advanced.sent,
      due: swept.due,
      sent: swept.results.filter((r) => r.status === "sent").length,
      skipped: swept.results.filter((r) => r.status === "skipped").length,
      failed: swept.results.filter((r) => r.status === "failed").length,
    };
  } catch (err) {
    results.newsletter = { error: (err as Error).message };
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...results,
  });
}

export const POST = handle;
export const GET  = handle;
