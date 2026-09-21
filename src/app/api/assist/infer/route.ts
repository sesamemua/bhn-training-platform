/**
 * POST /api/assist/infer
 *
 * Gated AI inference. Called by an internal scheduler (or
 * triggered manually from /admin/assist) for users whose
 * rule-based stuck score crossed the AI-escalation threshold
 * (~0.75) AND whose per-user budget hasn't been spent.
 *
 * Body: { userId: string }
 *
 * Pipeline:
 *   1. Refuse if userId hasn't consented.
 *   2. Refuse if the user is over their daily LLM budget
 *      (20 calls / day, 1 call / 5 min).
 *   3. Load: last 20 raw events + last 7 daily-rollup rows +
 *      most-recent weekly summary (when it exists).
 *   4. Filter the help-card registry to (surface, role).
 *   5. Build a prompt — "what's this user trying to do? are they
 *      stuck? if yes, pick a card." Ask for structured JSON.
 *   6. Validate the response. Queue an AssistHint with the
 *      AI-selected card + the model's confidence.
 *
 * Auth: admin / superadmin only (or an internal cron secret).
 * Treated as machinery, not a user-facing endpoint.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { chat, AI_CONFIGURED } from "@/lib/ai";
import { availableHelpCards, findHelpCard } from "@/lib/assist/help-cards";
import { getAssistPrefs, shouldShowHint } from "@/lib/assist/preferences";
import { ASSIST_DISABLED } from "@/lib/assist/flags";

export const runtime = "nodejs";

const HINT_TTL_MS = 30 * 60 * 1000;
const DAILY_LLM_BUDGET = 20;
const MIN_GAP_MS = 5 * 60 * 1000;

const SYSTEM = `You're an assistive layer that interprets a user's recent behaviour on the BHN training platform and selects ONE help card from a curated list to surface — or none, if no help is appropriate.

You will receive:
  • The user's role and current surface.
  • A condensed list of their last ~20 actions, plus a weekly summary if available.
  • A JSON menu of HelpCard candidates: each has {key, title, body, surfaces}. PICK ONE KEY. Don't write prose.

Return ONLY JSON of this shape:

{
  "stuck": true | false,
  "intent": "string — one short sentence describing what the user is trying to do",
  "confidence": 0.0..1.0,
  "selectedHelpKey": "string — one of the keys from the menu, OR empty string if no card fits"
}

Rules:
  • If stuck is false OR confidence < 0.5, return selectedHelpKey: "".
  • Don't invent help keys. selectedHelpKey must come from the menu.
  • Don't return prose, markdown, or any field outside the schema above.
  • Be conservative — false positives cost user trust. When in doubt, return "".
`;

interface InferResult {
  stuck: boolean;
  intent: string;
  confidence: number;
  selectedHelpKey: string;
}

// Runtime shape check for the parsed model output. A type assertion gives zero
// runtime safety, so structurally-valid JSON with wrong field types (confidence
// as a string, stuck as "yes") would otherwise flow into !parsed.stuck /
// parsed.confidence < 0.5 / findHelpCard(...) and rely on JS coercion. We keep
// this route on chat() (NOT callStructured) on purpose — callStructured would
// collapse the two distinct observable responses (502 provider-failure vs the
// 200 ai_returned_non_json payload, which the admin tool renders with `raw`).
const InferResultSchema = z.object({
  stuck: z.boolean(),
  intent: z.string(),
  confidence: z.number(),
  selectedHelpKey: z.string(),
});

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: Request) {
  if (ASSIST_DISABLED) return NextResponse.json({ ok: true, disabled: true, hint: null });
  const session = await requireRole("admin").catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!AI_CONFIGURED.chat) {
    return NextResponse.json({ error: "AI not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  if (!body?.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  const userId = body.userId;

  const prefs = await getAssistPrefs(userId);
  if (!prefs.consented) {
    return NextResponse.json({ ok: false, reason: "not_consented" });
  }
  if (prefs.hintsDisabled) {
    return NextResponse.json({ ok: false, reason: "hints_disabled" });
  }

  // Budget check — count AI-triggered hints created today and the
  // last one to enforce the 5-minute gap.
  const aiHintsToday = await prisma.assistHint.count({
    where: {
      userId,
      triggeredBy: { startsWith: "ai:" },
      createdAt: { gte: startOfDay() },
    },
  });
  if (aiHintsToday >= DAILY_LLM_BUDGET) {
    return NextResponse.json({ ok: false, reason: "daily_budget_spent" });
  }
  const lastAi = await prisma.assistHint.findFirst({
    where: { userId, triggeredBy: { startsWith: "ai:" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastAi && Date.now() - lastAi.createdAt.getTime() < MIN_GAP_MS) {
    return NextResponse.json({ ok: false, reason: "rate_limited" });
  }

  // Load user context.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const recentEvents = await prisma.assistEvent.findMany({
    where: { userId },
    orderBy: { ts: "desc" },
    take: 20,
    select: { ts: true, kind: true, surface: true, target: true },
  });
  const lastSurface = recentEvents[0]?.surface ?? null;

  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weeklySummary = await prisma.assistWeeklySummary.findFirst({
    where: { userId, weekStart: { gte: weekStart } },
    orderBy: { weekStart: "desc" },
  });

  // Build the help-card menu — only cards available for this
  // (role, surface) pair.
  const role = user.role as Parameters<typeof availableHelpCards>[0]["role"];
  const menu = availableHelpCards({ surface: lastSurface, role });
  if (menu.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_cards_available" });
  }

  const aiPrompt = [
    `User role: ${role}`,
    `Current surface: ${lastSurface ?? "(unknown)"}`,
    "",
    `Recent actions (newest first):`,
    ...recentEvents.map(
      (e) =>
        `  - ${e.ts.toISOString()} ${e.kind}${e.surface ? ` @ ${e.surface}` : ""}${e.target ? ` (${e.target})` : ""}`,
    ),
    "",
    weeklySummary
      ? `Weekly summary: ${weeklySummary.summary}`
      : `Weekly summary: (none on file)`,
    "",
    `Help cards menu (pick ONE key, or "" for no help):`,
    JSON.stringify(
      menu.map((c) => ({ key: c.key, title: c.title, body: c.body, surfaces: c.surfaces ?? [] })),
      null,
      2,
    ),
  ].join("\n");

  const result = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: aiPrompt },
    ],
    { feature: "assist_infer", maxTokens: 300, temperature: 0.1 },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "AI failed" }, { status: 502 });
  }

  // Parse + validate the model's output. Strip code fences just in
  // case it ignored the instruction.
  const raw = result.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: InferResult;
  try {
    // Validate the shape at runtime — wrong field types (e.g. confidence as a
    // string) are rejected here rather than coerced downstream. Both non-JSON
    // and shape-mismatch return the SAME 200 ai_returned_non_json payload (with
    // raw) so the admin tool's existing handling is unchanged.
    const v = InferResultSchema.safeParse(JSON.parse(raw));
    if (!v.success) {
      return NextResponse.json({ ok: false, reason: "ai_returned_non_json", raw });
    }
    parsed = v.data;
  } catch {
    return NextResponse.json({ ok: false, reason: "ai_returned_non_json", raw });
  }

  if (!parsed.stuck || parsed.confidence < 0.5 || !parsed.selectedHelpKey) {
    return NextResponse.json({
      ok: true,
      stuck: false,
      intent: parsed.intent,
      confidence: parsed.confidence,
    });
  }

  const card = findHelpCard(parsed.selectedHelpKey);
  if (!card) {
    return NextResponse.json({
      ok: false,
      reason: "ai_picked_unknown_key",
      key: parsed.selectedHelpKey,
    });
  }

  const allow = shouldShowHint({ prefs, confidence: parsed.confidence });
  if (!allow) {
    return NextResponse.json({
      ok: true,
      stuck: true,
      intent: parsed.intent,
      confidence: parsed.confidence,
      queued: false,
      reason: "below_threshold",
    });
  }

  // Avoid same-key dupes within the hour.
  const dupe = await prisma.assistHint.findFirst({
    where: {
      userId,
      helpKey: card.key,
      status: { in: ["pending", "shown"] },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (dupe) {
    return NextResponse.json({
      ok: true,
      queued: false,
      reason: "duplicate_within_hour",
    });
  }

  await prisma.assistHint.create({
    data: {
      userId,
      helpKey: card.key,
      title: card.title,
      body: card.body,
      ctaLabel: card.ctaLabel ?? null,
      ctaHref: card.ctaHref ?? null,
      surface: lastSurface,
      triggeredBy: "ai:chat",
      confidence: parsed.confidence,
      expiresAt: new Date(Date.now() + HINT_TTL_MS),
    },
  });

  return NextResponse.json({
    ok: true,
    queued: true,
    intent: parsed.intent,
    confidence: parsed.confidence,
    selectedHelpKey: parsed.selectedHelpKey,
  });
}
