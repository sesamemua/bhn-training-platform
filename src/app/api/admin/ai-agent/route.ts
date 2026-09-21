/**
 * Triage-agent controls (admin-only).
 *   POST /api/admin/ai-agent  { action }
 *     "enable" | "disable"  → flip the kill switch (PlatformSetting flag)
 *     "baseline" + baselineSeconds → set the manual-triage baseline (sec/item)
 *     "run"                 → run the agent now (also schedulable via Inngest)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRIAGE_AGENT } from "@/lib/agent/config";
import { runTriageAgent } from "@/lib/agent/runTriage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; baselineSeconds?: unknown };
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "enable" || action === "disable") {
    const value = action === "enable" ? "1" : "0";
    await prisma.platformSetting.upsert({
      where: { key: TRIAGE_AGENT.enabledKey },
      update: { value },
      create: { key: TRIAGE_AGENT.enabledKey, value },
    });
    return NextResponse.json({ ok: true, enabled: action === "enable" });
  }

  if (action === "baseline") {
    const n = Number(body.baselineSeconds);
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "Invalid baseline." }, { status: 400 });
    await prisma.platformSetting.upsert({
      where: { key: TRIAGE_AGENT.baselineKey },
      update: { value: String(Math.round(n)) },
      create: { key: TRIAGE_AGENT.baselineKey, value: String(Math.round(n)) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "run") {
    const result = await runTriageAgent("manual");
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
