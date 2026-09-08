/**
 * Daily: make sure every open VentureConnect cycle has its posts drafted.
 *
 *   GET /api/cron/social-posts
 *
 * ADDS ONLY. It creates posts that should exist and refreshes drafts
 * nobody has touched; it never rewrites an edited or approved one and
 * never deletes anything. Running it twice in a morning is a no-op the
 * second time, because every post has a unique key.
 *
 * IT DOES NOT PUBLISH. Approving a post is a human action and posting
 * it is a human action — the job's whole output is a queue somebody
 * reads. That is the same rule EQUIP decision emails follow, and it is
 * why this endpoint is safe to run unattended.
 *
 * Security: Vercel injects `Authorization: Bearer ${CRON_SECRET}`, the
 * same gate as the event-reminders job. CRON_SECRET="" disables it for
 * local dev.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openCycles } from "@/lib/social/cycles";
import { syncCycle } from "@/lib/social/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const cycles = await openCycles(prisma, now);
  const summary: Record<string, unknown>[] = [];

  for (const cycle of cycles) {
    try {
      const r = await syncCycle(prisma, cycle, now);
      summary.push({
        cycle: cycle.cycleLabel,
        created: r.created.length,
        refreshed: r.refreshed.length,
        keptAsIs: r.keptAsIs.length,
      });
    } catch (err) {
      // One bad cycle must not stop the rest. Logged rather than
      // thrown: a cron that 500s is a cron nobody notices has stopped.
      console.error("[social-posts] cycle failed:", cycle.deadlineId, err);
      summary.push({ cycle: cycle.cycleLabel, error: true });
    }
  }

  return NextResponse.json({ ok: true, cycles: summary });
}
