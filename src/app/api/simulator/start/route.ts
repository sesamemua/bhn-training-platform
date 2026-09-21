/**
 * POST /api/simulator/start
 *
 * Body: { url?: string, text?: string }   — exactly one of the two
 *
 * Flow:
 *   1. URL mode  → pull clean text from the URL via Jina Reader.
 *      Text mode → use the pasted JD body verbatim (after whitespace
 *                   normalisation). Skips the network round-trip when
 *                   the source is auth-walled (LinkedIn, Workday) or
 *                   doesn't read cleanly through Jina (Indeed search
 *                   results, JS-heavy SPAs).
 *   2. Hash the cleaned text + prompt version. Both modes produce the
 *      same hash for identical content, so a paste of the same JD a
 *      URL would have returned still hits the cache.
 *   3. Look for an existing Simulation row with that hash.
 *      - Hit  → skip generation, save bytes.
 *      - Miss → generate with Gemini/Cloudflare, validate, persist.
 *   4. Create a SimulationAttempt for the trainee.
 *   5. Return { attemptId } so the client can redirect to the play page.
 *
 * Latency is dominated by the AI call (~12–25s) on a fresh JD. Cache
 * hits return in <1s. We don't stream — the loading state on the
 * paste-URL page handles the wait.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  extractJobDescription,
  extractJobDescriptionFromText,
} from "@/lib/simulator/jd-extractor";
import { generateSimulation } from "@/lib/simulator/generator";
import { initialState } from "@/lib/simulator/engine";
import { PROMPT_VERSION, type SimulationPayload } from "@/lib/simulator/types";

export async function POST(req: NextRequest) {
  // Locked to admins as of 2026-05-26. User-facing path moved to
  // POST /api/simulator/requests, which queues a SimulationRequest
  // for admin review. This endpoint is preserved so admins (or
  // internal scripts) can still trigger synchronous generation, e.g.
  // from /admin/simulator-requests/[id]/generate.
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role ?? "trainee";
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json(
      {
        error:
          "Self-serve AI generation has been retired. Submit a request at /simulator/new — an admin will publish your sim from /admin/simulator-requests.",
      },
      { status: 410 },
    );
  }
  const userId = (session.user as { id?: string }).id!;

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    text?: string;
  };
  const url = (body.url ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!url && !text) {
    return NextResponse.json(
      { error: "Provide a job-posting URL or paste the JD body." },
      { status: 400 },
    );
  }

  // 1. Extract — branch on which field was sent.
  const extracted = url
    ? await extractJobDescription(url, PROMPT_VERSION)
    : extractJobDescriptionFromText(text, PROMPT_VERSION);
  if (!extracted.ok) {
    return NextResponse.json({ error: extracted.error }, { status: 400 });
  }

  // 2. Cache lookup
  let simulation = await prisma.simulation.findUnique({
    where: { sourceHash: extracted.sourceHash },
  });

  // 3. Generate if no cache hit
  if (!simulation) {
    const gen = await generateSimulation(extracted.content, userId);
    if (!gen.ok) {
      return NextResponse.json(
        { error: `Couldn't generate the simulation: ${gen.error}` },
        { status: 502 },
      );
    }
    simulation = await prisma.simulation.create({
      data: {
        sourceHash: extracted.sourceHash,
        // null for pasted-JD mode — the schema has `sourceUrl String?`
        // precisely so the "Original posting" link can be omitted when
        // the trainee bypassed Jina with a direct paste.
        sourceUrl: url || null,
        jdSnippet: extracted.jdSnippet,
        jobTitle: gen.payload.jobTitle,
        companyName: gen.payload.companyName,
        location: gen.payload.location,
        payload: gen.payload as unknown as object,
        modelUsed: gen.modelUsed,
        generationMs: gen.generationMs,
        promptVersion: PROMPT_VERSION,
        createdById: userId,
      },
    });
  }

  // 4. Create the attempt
  const payload = simulation.payload as unknown as SimulationPayload;
  const seed = initialState(payload);
  const attempt = await prisma.simulationAttempt.create({
    data: {
      simulationId: simulation.id,
      userId,
      week: seed.week,
      scenarioIndex: seed.scenarioIndex,
      stats: seed.stats as unknown as object,
      log: [] as unknown as object,
      finished: false,
    },
  });

  return NextResponse.json({
    attemptId: attempt.id,
    simulationId: simulation.id,
    jobTitle: simulation.jobTitle,
    companyName: simulation.companyName,
    cached: !!simulation.id && simulation.createdAt.getTime() < Date.now() - 5000,
  });
}
