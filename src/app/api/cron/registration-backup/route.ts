/**
 * Vercel Cron — one file with every registration in it.
 *
 *   GET /api/cron/registration-backup
 *
 * Scheduled through /api/cron/nightly now; kept as its own route so it
 * can still be run by hand. The work is backupAllRegistrations().
 */
import { NextResponse } from "next/server";
import { backupAllRegistrations } from "@/lib/events/registration-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const done = await backupAllRegistrations();
  return NextResponse.json(
    done ? { ok: true, ...done } : { ok: false, reason: "No mail server is configured, so there is nowhere to send it." },
  );
}
