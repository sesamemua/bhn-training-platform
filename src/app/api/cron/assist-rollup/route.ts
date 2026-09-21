/**
 * POST /api/cron/assist-rollup
 *
 * Nightly job that:
 *   1. Aggregates yesterday's AssistEvent rows into
 *      AssistDailyRollup (one row per user × surface × day).
 *   2. Purges AssistEvent rows older than 90 days.
 *   3. Expires AssistHint rows whose expiresAt has passed.
 *
 * Auth: superadmin OR matching CRON_SECRET header. Designed to be
 * called by Vercel Cron / GitHub Actions / curl-from-laptop.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const RAW_RETENTION_DAYS = 90;

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Timing-safe secret check (PT-04 fix, May 2026 pen test).
 *  Direct === comparison leaks secret length/value via response-time
 *  analysis. timingSafeEqual requires same-length buffers — pad/length
 *  mismatch is returned as false before entering the comparison. */
async function authorised(req: Request): Promise<boolean> {
  // CRON secret short-circuit.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const got =
      req.headers.get("x-cron-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    if (
      got.length === secret.length &&
      timingSafeEqual(Buffer.from(got), Buffer.from(secret))
    ) {
      return true;
    }
  }
  // Or: superadmin.
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role;
  return role === "superadmin";
}

export async function POST(req: Request) {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const yesterdayEnd = startOfDayUTC(new Date()); // today 00:00 UTC
  const yesterdayStart = new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000);

  // ── 1. Aggregate yesterday's events into rollups ─────────
  // Raw SQL because the per-(user, surface) buckets are easier in
  // SQL than juggling groupBy in Prisma — and this runs once a day,
  // so the extra SQL is justified.
  // Existing rollups for yesterday get UPSERTed via the unique
  // index (userId, surface, day).
  const rollupRows: Array<{
    userId: string;
    surface: string;
    views: bigint;
    clicks: bigint;
    rageClicks: bigint;
    deadClicks: bigint;
    formAbandons: bigint;
    errors: bigint;
    dwellMs: bigint;
  }> = await prisma.$queryRaw`
    SELECT
      "userId",
      COALESCE("surface", '(unknown)') AS surface,
      COUNT(*) FILTER (WHERE kind = 'surface.view')   AS views,
      COUNT(*) FILTER (WHERE kind = 'click')          AS clicks,
      COUNT(*) FILTER (WHERE kind = 'rage_click')     AS "rageClicks",
      COUNT(*) FILTER (WHERE kind = 'dead_click')     AS "deadClicks",
      COUNT(*) FILTER (WHERE kind = 'form.abandon')   AS "formAbandons",
      COUNT(*) FILTER (WHERE kind = 'error.client')   AS errors,
      COALESCE(
        SUM((payload->>'ms')::int) FILTER (WHERE kind = 'dwell'),
        0
      ) AS "dwellMs"
    FROM "AssistEvent"
    WHERE ts >= ${yesterdayStart} AND ts < ${yesterdayEnd}
    GROUP BY "userId", "surface"
  `;

  let upserts = 0;
  for (const row of rollupRows) {
    await prisma.assistDailyRollup.upsert({
      where: {
        userId_surface_day: {
          userId: row.userId,
          surface: row.surface,
          day: yesterdayStart,
        },
      },
      create: {
        userId: row.userId,
        surface: row.surface,
        day: yesterdayStart,
        views: Number(row.views),
        clicks: Number(row.clicks),
        rageClicks: Number(row.rageClicks),
        deadClicks: Number(row.deadClicks),
        formAbandons: Number(row.formAbandons),
        errors: Number(row.errors),
        dwellMs: Number(row.dwellMs),
        // Loose completion heuristic: had a submit_attempt and no
        // error.client in the bucket. Computed below.
        completed: false,
      },
      update: {
        views: Number(row.views),
        clicks: Number(row.clicks),
        rageClicks: Number(row.rageClicks),
        deadClicks: Number(row.deadClicks),
        formAbandons: Number(row.formAbandons),
        errors: Number(row.errors),
        dwellMs: Number(row.dwellMs),
      },
    });
    upserts++;
  }

  // ── 2. Mark `completed` on rollups where the user submitted
  //      a form without a subsequent client error.
  await prisma.$executeRaw`
    UPDATE "AssistDailyRollup" r
    SET "completed" = true
    WHERE r.day = ${yesterdayStart}
      AND EXISTS (
        SELECT 1 FROM "AssistEvent" e
        WHERE e."userId" = r."userId"
          AND e."surface" = r."surface"
          AND e.kind = 'form.submit_attempt'
          AND e.ts >= ${yesterdayStart}
          AND e.ts < ${yesterdayEnd}
      )
      AND r.errors = 0
  `;

  // ── 3. Purge raw events older than 90 days ────────────────
  const purgeCutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const purged = await prisma.assistEvent.deleteMany({
    where: { ts: { lt: purgeCutoff } },
  });

  // ── 4. Expire stale pending hints ─────────────────────────
  const expired = await prisma.assistHint.updateMany({
    where: { status: "pending", expiresAt: { lt: new Date() } },
    data: { status: "expired", resolvedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    yesterday: yesterdayStart.toISOString(),
    rollupRows: upserts,
    rawEventsPurged: purged.count,
    hintsExpired: expired.count,
  });
}
