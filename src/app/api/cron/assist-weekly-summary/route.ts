/**
 * POST /api/cron/assist-weekly-summary
 *
 * Runs once a week (Monday early-AM UTC). For every user with
 * activity in the previous 7 days, asks the LLM to write a 2–4
 * sentence narrative summary of their week. Stored on
 * AssistWeeklySummary and fed back into /api/assist/infer prompts
 * to give the AI cross-session context for infrequent users.
 *
 * Budget: one chat call per active user per week. At Haiku-class
 * pricing this is sub-cent / user / week even at scale.
 *
 * Auth: superadmin OR CRON_SECRET (same as the rollup cron).
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AI_CONFIGURED } from "@/lib/ai";
import { callText } from "@/lib/ai/reliability";
import { ASSIST_DISABLED } from "@/lib/assist/flags";

export const runtime = "nodejs";

const SYSTEM = `You write extremely terse weekly journey summaries for the BHN training platform's AI assist memory.

You will be given a user's last 7 days of behaviour signals
(per-surface aggregates + a few notable events). Write ONE
paragraph, 2–4 sentences, in the third person, describing what
they tried to do, where they got stuck, and what they finished.

Rules:
  • PROSE ONLY. No headings, lists, or markdown.
  • 2–4 sentences. ≤ 70 words.
  • Don't invent specifics not in the data.
  • Use surface names (e.g. /employer/postings), not internal jargon.
  • Past tense, neutral tone.
  • If the user did nothing notable, write "Visited briefly; no significant activity."`;

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function previousMonday(d: Date): Date {
  const x = startOfDayUTC(d);
  // Mon=1, Sun=0. We want Monday of the PREVIOUS week.
  const dow = x.getUTCDay();
  const back = dow === 0 ? 13 : 6 + dow; // → previous-week's Monday
  x.setUTCDate(x.getUTCDate() - back);
  return x;
}

async function authorised(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const got =
      req.headers.get("x-cron-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    // Timing-safe comparison (PT-04 fix, May 2026 pen test).
    if (
      got.length === secret.length &&
      timingSafeEqual(Buffer.from(got), Buffer.from(secret))
    ) {
      return true;
    }
  }
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role;
  return role === "superadmin";
}

export async function POST(req: Request) {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Master kill-switch: skip generating weekly assist summaries.
  if (ASSIST_DISABLED) return NextResponse.json({ ok: true, disabled: true, summarised: 0 });
  if (!AI_CONFIGURED.chat) {
    return NextResponse.json({ error: "AI not configured." }, { status: 503 });
  }

  const weekStart = previousMonday(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Find every user with at least one rollup row in the target week.
  const activeUsers: { userId: string }[] = await prisma.assistDailyRollup.findMany({
    where: { day: { gte: weekStart, lt: weekEnd } },
    distinct: ["userId"],
    select: { userId: true },
  });

  let written = 0;
  let skipped = 0;
  const errors: { userId: string; error: string }[] = [];

  for (const { userId } of activeUsers) {
    // Skip if a summary already exists for this user/week (re-run
    // safe).
    const existing = await prisma.assistWeeklySummary.findUnique({
      where: { userId_weekStart: { userId, weekStart } },
    });
    if (existing) { skipped++; continue; }

    const prefs = await prisma.assistPreferences.findUnique({
      where: { userId },
      select: { consented: true },
    });
    if (!prefs?.consented) { skipped++; continue; }

    const rollups = await prisma.assistDailyRollup.findMany({
      where: { userId, day: { gte: weekStart, lt: weekEnd } },
      orderBy: [{ day: "asc" }],
    });

    // Stuck surfaces — top 3 by (rageClicks + errors + formAbandons).
    const stuckScores = rollups.map((r) => ({
      surface: r.surface,
      score: r.rageClicks + r.errors + r.formAbandons,
    }));
    stuckScores.sort((a, b) => b.score - a.score);
    const stuckOn = stuckScores.filter((s) => s.score > 0).slice(0, 3).map((s) => s.surface);

    const aiInput = [
      `Week of ${weekStart.toISOString().slice(0, 10)}.`,
      `Per-surface aggregates:`,
      ...rollups.map(
        (r) =>
          `  - ${r.surface} (${r.day.toISOString().slice(0, 10)}): ` +
          `${r.views} views, ${r.clicks} clicks, ${r.rageClicks} rage-clicks, ` +
          `${r.deadClicks} dead-clicks, ${r.formAbandons} form abandons, ` +
          `${r.errors} errors, ${Math.round(r.dwellMs / 1000)}s dwell, ` +
          `completed=${r.completed}.`,
      ),
    ].join("\n");

    try {
      const result = await callText(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: aiInput },
        ],
        { feature: "assist_weekly_summary", maxTokens: 180, temperature: 0.2 },
      );
      if (!result.ok) {
        errors.push({ userId, error: result.error ?? "AI failed" });
        continue;
      }
      const summary = result.text.trim().slice(0, 600);
      await prisma.assistWeeklySummary.create({
        data: {
          userId,
          weekStart,
          summary,
          stuckOn,
        },
      });
      written++;
    } catch (err) {
      errors.push({ userId, error: (err as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    weekStart: weekStart.toISOString(),
    activeUsers: activeUsers.length,
    summariesWritten: written,
    skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 10), // cap response size
  });
}
