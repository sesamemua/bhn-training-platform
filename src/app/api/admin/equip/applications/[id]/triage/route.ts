/**
 * POST /api/admin/equip/applications/[id]/triage
 *
 * Generates an AI executive summary of the submitted application
 * so reviewers can triage fast. Returns:
 *
 *   • headline           — one sentence, the elevator pitch
 *   • strengths          — array of 2-3 bullets
 *   • concerns           — array of 0-3 bullets (honest, not piling on)
 *   • verdict            — "looks_promising" | "needs_more_info" | "weak_fit"
 *
 * Cached on the application via a short-lived in-memory key is
 * unnecessary — reviewers usually look once and the call is cheap.
 */
import { NextResponse } from "next/server";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { AI_CONFIGURED, chat } from "@/lib/ai";
import { applicantOf } from "@/lib/equip/applicant";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are an experienced biotech / biomanufacturing program reviewer. Read a single Equip funding application (either VentureConnect for events or VentureLift for commercialization) and produce a tight executive summary so a senior reviewer can decide in under 60 seconds.

Return ONLY a single JSON object with these keys:
  • headline   — one crisp sentence summarizing what the applicant is asking for and why.
  • strengths  — array of 2-3 short bullets. Each is one phrase / clause, not a sentence.
  • concerns   — array of 0-3 short bullets. Honest, calibrated; skip if nothing material.
  • verdict    — exactly one of: "looks_promising" | "needs_more_info" | "weak_fit"

Be candid; reviewers will use this to triage, not to decide. Don't pad — if there are no concerns, leave the array empty. CRITICAL: Output the JSON object only — no prose, no fences.`;

interface AiResult {
  headline?: string;
  strengths?: string[];
  concerns?: string[];
  verdict?: string;
}

function extractJsonBlock(text: string): string {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start >= 0) return stripped.slice(start, i + 1); }
  }
  return stripped;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]);
  if (!AI_CONFIGURED.chat) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { id } = await params;
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true, organization: true } } },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.status === "draft") {
    return NextResponse.json({ error: "Application is still a draft" }, { status: 400 });
  }

  // Condense the application body to plaintext for the AI prompt.
  const lines: string[] = [
    `Stream: ${app.stream}`,
    `Applicant: ${applicantOf(app).name} (${app.user?.organization ?? "no org listed"})`,
    `Applicant type: ${app.applicantType ?? "—"}`,
    `Institution: ${app.institution ?? app.institutionOther ?? "—"}`,
    `Requested: ${app.requestedAmount ? `$${app.requestedAmount.toLocaleString()}` : "—"}`,
    "",
    "Form body:",
    JSON.stringify(app.formData, null, 2),
  ];
  if (app.reviewerNote) lines.push("", "Existing reviewer note:", app.reviewerNote);

  const aiResp = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: lines.join("\n") },
    ],
    { feature: "equip_triage", maxTokens: 800, temperature: 0.15 },
  );
  if (!aiResp.ok) {
    return NextResponse.json({ error: aiResp.error ?? "AI request failed" }, { status: 502 });
  }

  let parsed: AiResult;
  try {
    parsed = JSON.parse(extractJsonBlock(aiResp.text)) as AiResult;
  } catch {
    return NextResponse.json({ error: "AI returned non-JSON" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    triage: {
      headline: typeof parsed.headline === "string" ? parsed.headline.trim() : "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s) => typeof s === "string").slice(0, 3) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter((s) => typeof s === "string").slice(0, 3) : [],
      verdict: parsed.verdict === "looks_promising" || parsed.verdict === "needs_more_info" || parsed.verdict === "weak_fit"
        ? parsed.verdict
        : "needs_more_info",
    },
  });
}
