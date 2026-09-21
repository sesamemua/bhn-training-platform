/**
 * Transcribe a recorded answer to text (owner only).
 *   POST /api/mock-interview/[id]/transcribe   (raw audio bytes as the body)
 *   → { text } via Cloudflare Whisper. Size-capped; the client may edit the
 *     transcript before submitting it for scoring.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribe } from "@/lib/ai";
import { computeDelivery } from "@/lib/interview/ai";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // ~12 MB ≈ a few minutes of compressed audio
interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const owns = await prisma.mockInterview.findFirst({ where: { id, userId: uid }, select: { id: true } });
  if (!owns) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return NextResponse.json({ error: "No audio received." }, { status: 400 });
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long — keep answers under a few minutes." }, { status: 413 });
  }

  const result = await transcribe(buf, { feature: "mock_interview_transcribe", userId: uid });
  if (!result.ok) {
    return NextResponse.json({ error: `Couldn't transcribe: ${result.error}. You can type your answer instead.` }, { status: 502 });
  }
  // Objective delivery metrics from the word timings (pace, fillers, pauses).
  // Null when the model didn't return usable timestamps — the answer still works.
  const delivery = computeDelivery(result.words, result.text);
  return NextResponse.json({ ok: true, text: result.text, delivery });
}
