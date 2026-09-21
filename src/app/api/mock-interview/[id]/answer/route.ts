/**
 * Submit + score one answer (owner only).
 *   POST /api/mock-interview/[id]/answer { answerId, transcript, inputMode? }
 *   → evaluates the transcript, saves score + feedback, returns the evaluation.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateAnswer, type DeliveryMetrics, type VoiceAcoustics } from "@/lib/interview/ai";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { answerId?: unknown; transcript?: unknown; inputMode?: unknown; delivery?: unknown; acoustics?: unknown };
  const answerId = typeof body.answerId === "string" ? body.answerId : "";
  const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 6000) : "";
  const inputMode = body.inputMode === "voice" ? "voice" : "text";
  // Trust delivery metrics only on voice answers (the client computes them
  // from the recording; a typed answer has no acoustic signal).
  const rawD = (typeof body.delivery === "object" && body.delivery !== null ? body.delivery : null) as Partial<DeliveryMetrics> | null;
  const delivery: DeliveryMetrics | null =
    inputMode === "voice" && rawD && typeof rawD.wpm === "number"
      ? {
          durationSec: Number(rawD.durationSec) || 0,
          wordCount: Number(rawD.wordCount) || 0,
          wpm: Math.max(0, Math.min(400, Math.round(Number(rawD.wpm) || 0))),
          fillerCount: Math.max(0, Math.round(Number(rawD.fillerCount) || 0)),
          fillerRate: Number(rawD.fillerRate) || 0,
          longPauses: Math.max(0, Math.round(Number(rawD.longPauses) || 0)),
          stumbleCount: Math.max(0, Math.round(Number(rawD.stumbleCount) || 0)),
        }
      : null;
  // Acoustic features (pitch/energy) computed client-side from the recording.
  const rawA = (typeof body.acoustics === "object" && body.acoustics !== null ? body.acoustics : null) as Partial<VoiceAcoustics> | null;
  const acoustics: VoiceAcoustics | null =
    inputMode === "voice" && rawA && typeof rawA.pitchVariation === "number"
      ? {
          pitchHzMean: Math.max(0, Math.round(Number(rawA.pitchHzMean) || 0)),
          pitchVariation: Number(rawA.pitchVariation) || 0,
          energyVariation: Number(rawA.energyVariation) || 0,
          voicedRatio: Number(rawA.voicedRatio) || 0,
          monotone: rawA.monotone === true,
        }
      : null;
  if (!answerId) return NextResponse.json({ error: "Missing answer." }, { status: 400 });
  if (!transcript) return NextResponse.json({ error: "Say or type an answer first." }, { status: 400 });

  // Load the answer + verify it belongs to this user's interview.
  const answer = await prisma.mockInterviewAnswer.findFirst({
    where: { id: answerId, interviewId: id, interview: { userId: uid } },
    select: { id: true, question: true, questionKind: true, interview: { select: { role: true } } },
  });
  if (!answer) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const evaluation = await evaluateAnswer({
    role: answer.interview.role,
    question: answer.question,
    questionKind: answer.questionKind,
    transcript,
    delivery,
    acoustics,
    userId: uid,
  });

  // Persist the voice read + the acoustics it was based on (for replay).
  const voiceBlob = evaluation.voice
    ? { ...evaluation.voice, acoustics: acoustics ?? undefined }
    : null;

  await prisma.mockInterviewAnswer.update({
    where: { id: answer.id },
    data: {
      transcript,
      inputMode,
      score: evaluation.score,
      feedback: evaluation.feedback,
      strengths: evaluation.strengths as unknown as Prisma.InputJsonValue,
      improvements: evaluation.improvements as unknown as Prisma.InputJsonValue,
      confidence: evaluation.confidence,
      wpm: delivery?.wpm ?? null,
      fillerCount: delivery?.fillerCount ?? null,
      stumbleCount: delivery?.stumbleCount ?? null,
      deliveryNote: evaluation.deliveryFeedback,
      voice: (voiceBlob as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      answeredAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, evaluation, delivery });
}
