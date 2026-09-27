/**
 * Vercel Cron — the nightly jobs, in one call.
 *
 *   GET /api/cron/nightly
 *
 * One schedule rather than one per job: plans cap how many cron entries
 * a project may have, and a deploy that exceeds the cap fails outright,
 * taking every other change down with it. Each job runs on its own and
 * one failing never stops the rest; the reply says how each went.
 *
 *   eligibility   — re-read the ENGAGE / EXPERIENCE sheet (if a link is set)
 *   backup        — email every registration in one file
 *   equipDrafts   — remove public EQUIP drafts two weeks after their
 *                   owners were emailed the link and the deadline
 *
 * The single-job routes still exist, to run any one of them by hand.
 */
import { NextResponse } from "next/server";
import { importFromSheet } from "@/lib/eligibility/apply";
import { backupAllRegistrations } from "@/lib/events/registration-backup";
import { purgeExpiredDrafts } from "@/lib/equip/draft-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run<T>(job: () => Promise<T>): Promise<T | { error: string }> {
  try { return await job(); } catch (err) { return { error: (err as Error)?.message ?? "failed" }; }
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const eligibility = process.env.ELIGIBILITY_SHEET_CSV
    ? await run(() => importFromSheet({ method: "cron" }))
    : { skipped: "ELIGIBILITY_SHEET_CSV is not set" };
  const backup = await run(async () => (await backupAllRegistrations()) ?? { skipped: "no mail server" });
  const equipDrafts = await run(() => purgeExpiredDrafts());

  return NextResponse.json({ ok: true, eligibility, backup, equipDrafts });
}
