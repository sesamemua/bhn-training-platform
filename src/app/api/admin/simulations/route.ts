/**
 * POST /api/admin/simulations — create a Simulation directly, with no
 * SimulationRequest behind it.
 *
 * The admin pastes a job description (and optionally a source URL); we
 * either run the AI generator or accept a hand-authored payload, then
 * create the Simulation row (createdById = the admin). Once it exists
 * it's platform content: it appears in the trainee /simulator catalog
 * and anyone can launch their own attempt — and a later request for the
 * same JD cache-hits it by sourceHash instead of regenerating.
 *
 *   Body: { jdText?: string, sourceUrl?: string, payload?: object }
 *     - payload present → hand-author / upload path (validated, no AI).
 *       The JD is OPTIONAL here: pass one to dedup this sim against a
 *       future trainee request for the same posting, or omit it and we
 *       derive a stable hash + snippet from the payload itself.
 *     - payload absent  → AI generate path (JD required, ≥300 chars).
 *
 * Dedup: if a Simulation already exists for the resolved sourceHash, we
 * return it ({ existed: true }) rather than make a duplicate — the same
 * one-row-per-posting rule the request flow uses.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSimulation } from "@/lib/simulator/generator";
import { extractJobDescriptionFromText } from "@/lib/simulator/jd-extractor";
import { validatePayload } from "@/lib/simulator/validate";
import { PROMPT_VERSION, type SimulationPayload } from "@/lib/simulator/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminId = (session.user as { id?: string }).id;
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    jdText?: unknown;
    sourceUrl?: unknown;
    payload?: unknown;
  };

  const jdText = typeof body.jdText === "string" ? body.jdText.trim() : "";
  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim()
      ? body.sourceUrl.trim().slice(0, 2000)
      : null;
  const hasPayload = !!body.payload && typeof body.payload === "object";

  let payload: SimulationPayload;
  let modelUsed: string;
  let generationMs: number;
  let sourceHash: string;
  let jdSnippet: string;

  // Small helper: the same dedup check both paths run once their hash
  // is known. Returns the existing-row response, or null to proceed.
  async function existingFor(hash: string) {
    const existing = await prisma.simulation.findUnique({
      where: { sourceHash: hash },
      select: { id: true, jobTitle: true },
    });
    return existing
      ? NextResponse.json({
          ok: true,
          existed: true,
          simulationId: existing.id,
          jobTitle: existing.jobTitle,
        })
      : null;
  }

  if (hasPayload) {
    // Hand-authored / uploaded payload — validated, no AI call. The JD
    // is optional on this path.
    const validated = validatePayload(body.payload);
    if (!validated.ok) {
      return NextResponse.json(
        { error: `Payload didn't validate: ${validated.error}` },
        { status: 400 },
      );
    }
    payload = validated.payload;
    modelUsed = "hand-authored";
    generationMs = 0;

    if (jdText) {
      // A JD was supplied alongside the payload — hash it the trainee
      // way so this sim dedups against a future request for the posting.
      const extracted = extractJobDescriptionFromText(jdText, PROMPT_VERSION);
      if (!extracted.ok) {
        return NextResponse.json({ error: extracted.error }, { status: 400 });
      }
      sourceHash = extracted.sourceHash;
      jdSnippet = extracted.jdSnippet;
    } else {
      // No JD — derive a stable hash + snippet from the payload itself.
      // The "handauthored::" prefix keeps it from ever colliding with a
      // JD-derived hash (those are "<promptVersion>::<jd>").
      sourceHash = createHash("sha256")
        .update(`handauthored::${PROMPT_VERSION}::${JSON.stringify(payload)}`)
        .digest("hex");
      jdSnippet =
        [payload.jobTitle, payload.companyName, payload.location]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 800) || payload.jobTitle;
    }

    const dup = await existingFor(sourceHash);
    if (dup) return dup;
  } else {
    // AI generate path — a real JD is required.
    const extracted = extractJobDescriptionFromText(jdText, PROMPT_VERSION);
    if (!extracted.ok) {
      return NextResponse.json({ error: extracted.error }, { status: 400 });
    }
    sourceHash = extracted.sourceHash;
    jdSnippet = extracted.jdSnippet;

    const dup = await existingFor(sourceHash);
    if (dup) return dup;

    const gen = await generateSimulation(extracted.content, adminId);
    if (!gen.ok) {
      return NextResponse.json({ ok: false, error: gen.error }, { status: 502 });
    }
    payload = gen.payload;
    modelUsed = gen.modelUsed;
    generationMs = gen.generationMs;
  }

  const sim = await prisma.simulation.create({
    data: {
      sourceHash,
      sourceUrl,
      jdSnippet,
      jobTitle: payload.jobTitle,
      companyName: payload.companyName,
      location: payload.location,
      payload: payload as unknown as object,
      modelUsed,
      generationMs,
      promptVersion: PROMPT_VERSION,
      createdById: adminId,
    },
    select: { id: true, jobTitle: true },
  });

  return NextResponse.json({
    ok: true,
    existed: false,
    simulationId: sim.id,
    jobTitle: sim.jobTitle,
  });
}
