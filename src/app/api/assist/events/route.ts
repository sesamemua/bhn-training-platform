/**
 * POST /api/assist/events
 *
 * Batched ingestion of behaviour-assist events from the client.
 *
 * Body shape:
 *   {
 *     events: AssistEventInput[]   // 1..N events to persist
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     ingested: number,
 *     stuck?: { score, topSignal }  // included when the
 *                                   // pre-filter trips, so the
 *                                   // client can poll hints
 *   }
 *
 * The endpoint runs the cheap rule-based stuck-state scorer
 * synchronously and — if the pre-filter trips — queues a hint
 * directly. The expensive AI inference path runs separately (see
 * /api/assist/infer) so this endpoint stays fast.
 *
 * Gating: only writes if the user has consented. Unconsented users
 * are accepted (no 4xx) so the client SDK doesn't need to know the
 * consent state — we just silently drop the events. This is the
 * "fail safe rather than break the page" posture for telemetry.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAssistPrefs, shouldShowHint } from "@/lib/assist/preferences";
import {
  loadRecentBehaviour,
  scoreStuck,
  pickRuleCard,
  emptyStateCard,
} from "@/lib/assist/rules";
import { inferStuckHint, aiBudgetState } from "@/lib/assist/infer";
import { resolveStuckQueue, dedupeStatusesFor } from "@/lib/assist/stuck-logic";
import { AI_CONFIGURED } from "@/lib/ai";
import { ASSIST_DISABLED } from "@/lib/assist/flags";
import type { AssistEventInput } from "@/lib/assist/types";
import type { Role } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_KINDS = new Set([
  "click", "rage_click", "dead_click", "surface.view",
  "form.focus", "form.field_complete", "form.abandon",
  "form.submit_attempt", "error.client", "dwell",
  "idle.start", "idle.end",
]);

const HINT_TTL_MS = 30 * 60 * 1000; // 30 min — beyond this the moment is gone
// Stuck-score gates. At/above QUEUE_FLOOR we consider surfacing a
// canned card; at/above AI_ESCALATE we first try a generative,
// intent-aware suggestion (the smart path) and fall back to the card.
const STUCK_QUEUE_FLOOR = 0.6;
const AI_ESCALATE = 0.75;

export async function POST(req: Request) {
  // Master kill-switch: drop everything — no ingestion, no scoring, no hints.
  if (ASSIST_DISABLED) return NextResponse.json({ ok: true, ingested: 0, disabled: true });

  const session = await getSession();
  const userId = (session?.user as { id?: string })?.id;
  const role = (session?.user as { role?: string })?.role ?? "trainee";
  if (!session || !userId) {
    // Unauthenticated — accept-and-drop so noisy redirects on the
    // client SDK don't pile up in error logs.
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  const prefs = await getAssistPrefs(userId);
  if (!prefs.consented) {
    return NextResponse.json({ ok: true, ingested: 0, consented: false });
  }

  const body = (await req.json().catch(() => null)) as { events?: unknown } | null;
  if (!body || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "events[] required" }, { status: 400 });
  }

  // Validate + filter events. Reject malformed kinds rather than
  // throwing — the client SDK ships a known set, but we keep a
  // defensive parse for future changes.
  const valid: AssistEventInput[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.kind !== "string" || !VALID_KINDS.has(e.kind)) continue;
    if (typeof e.sessionId !== "string" || e.sessionId.length === 0) continue;
    valid.push({
      sessionId: e.sessionId,
      kind: e.kind as AssistEventInput["kind"],
      surface: typeof e.surface === "string" ? e.surface.slice(0, 200) : undefined,
      target: typeof e.target === "string" ? e.target.slice(0, 200) : undefined,
      payload: (e.payload && typeof e.payload === "object") ? (e.payload as Record<string, unknown>) : undefined,
      clientTs: typeof e.clientTs === "number" ? e.clientTs : undefined,
    });
  }

  if (valid.length === 0) {
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  // Bulk-insert. createMany is cheap for our payload sizes. Payload
  // needs the Prisma.InputJsonValue cast — TS won't accept a bare
  // Record<string, unknown> for a Json column.
  await prisma.assistEvent.createMany({
    data: valid.map((e) => ({
      userId,
      sessionId: e.sessionId,
      kind: e.kind,
      surface: e.surface ?? null,
      target: e.target ?? null,
      payload: (e.payload as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
    })),
  });

  // Run the cheap stuck-state pre-filter on the freshly-extended
  // recent window. We do this inline (not via cron) so the chip
  // dock can pick up the hint on the very next /hints poll.
  let stuck: { score: number; topSignal: string } | undefined;
  try {
    const behaviour = await loadRecentBehaviour(userId);
    const score = scoreStuck(behaviour);
    const lastSurface = valid[valid.length - 1].surface ?? behaviour.surface ?? null;

    // Skip all hint work when the user has muted hints — no point
    // spending an LLM call we'd only throw away at the show gate.
    const hintsLive =
      !prefs.hintsDisabled &&
      !(prefs.suppressUntil && prefs.suppressUntil.getTime() > Date.now());

    // Gather the inputs the (pure, unit-tested) planner needs — doing
    // the async work (empty-state lookup, budget check, the LLM call)
    // only when it can actually change the outcome — then let
    // resolveStuckQueue pick exactly one hint, or none.
    const aiEligible = hintsLive && AI_CONFIGURED.chat && score.score >= AI_ESCALATE;
    let emptyHint: Awaited<ReturnType<typeof emptyStateCard>> = null;
    let ruleCard: ReturnType<typeof pickRuleCard> = null;
    let budgetOk = false;
    let gen: Awaited<ReturnType<typeof inferStuckHint>> = null;

    if (hintsLive) {
      emptyHint = await emptyStateCard({ userId, role, surface: lastSurface });
      if (!emptyHint && score.score >= STUCK_QUEUE_FLOOR) {
        ruleCard = pickRuleCard(score, lastSurface);
        if (aiEligible) {
          budgetOk = (await aiBudgetState(userId)).ok;
          // Only spend the LLM call when it can win (eligible + budget).
          if (budgetOk) {
            gen = await inferStuckHint({
              userId,
              role: role as Role,
              surface: lastSurface,
              events: behaviour.events,
              topSignal: score.topSignal,
            });
          }
        }
      }
    }

    const queued = resolveStuckQueue({
      hintsLive,
      emptyHint,
      score,
      aiConfigured: AI_CONFIGURED.chat,
      queueFloor: STUCK_QUEUE_FLOOR,
      escalate: AI_ESCALATE,
      budgetOk,
      gen,
      ruleCard,
    });

    if (queued) {
      // De-dupe within the last hour, then honour per-user prefs.
      const recentSameKey = await prisma.assistHint.findFirst({
        where: {
          userId,
          helpKey: queued.key,
          status: { in: dedupeStatusesFor(queued.stuckKind) },
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      const allow = shouldShowHint({ prefs, confidence: queued.confidence });
      if (!recentSameKey && allow) {
        await prisma.assistHint.create({
          data: {
            userId,
            helpKey: queued.key,
            title: queued.title,
            body: queued.body,
            ctaLabel: queued.ctaLabel,
            ctaHref: queued.ctaHref,
            surface: lastSurface,
            triggeredBy: queued.triggeredBy,
            confidence: queued.confidence,
            expiresAt: new Date(Date.now() + HINT_TTL_MS),
          },
        });
      }
    }

    if (score.score >= STUCK_QUEUE_FLOOR) {
      stuck = { score: score.score, topSignal: score.topSignal };
    }
  } catch {
    // Pre-filter errors never propagate to the client — telemetry
    // ingestion must not fail because the rule engine choked.
  }

  return NextResponse.json({ ok: true, ingested: valid.length, ...(stuck ? { stuck } : {}) });
}
