/**
 * Per-question coaching (owner only).
 *   POST /api/mock-interview/[id]/guidance { answerId }
 *   → "how to answer this" + what employers really want to hear. Generated on
 *     first request and cached on the answer row; subsequent requests return
 *     the cached guidance (no repeat AI cost).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAnswerGuidance, type AnswerGuidance } from "@/lib/interview/ai";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

function asGuidance(v: unknown): AnswerGuidance | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.intent !== "string" && typeof o.approach !== "string") return null;
  return {
    intent: typeof o.intent === "string" ? o.intent : "",
    approach: typeof o.approach === "string" ? o.approach : "",
    wantToHear: Array.isArray(o.wantToHear) ? (o.wantToHear as string[]) : [],
    avoid: Array.isArray(o.avoid) ? (o.avoid as string[]) : [],
    modelOutline: Array.isArray(o.modelOutline) ? (o.modelOutline as string[]) : [],
  };
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { answerId?: unknown };
  const answerId = typeof body.answerId === "string" ? body.answerId : "";
  if (!answerId) return NextResponse.json({ error: "Missing question." }, { status: 400 });

  const answer = await prisma.mockInterviewAnswer.findFirst({
    where: { id: answerId, interviewId: id, interview: { userId: uid } },
    select: { id: true, question: true, questionKind: true, guidance: true, interview: { select: { role: true } } },
  });
  if (!answer) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Return cached guidance if we've already generated it.
  const cached = asGuidance(answer.guidance);
  if (cached) return NextResponse.json({ ok: true, guidance: cached, cached: true });

  const guidance = await generateAnswerGuidance({
    role: answer.interview.role,
    question: answer.question,
    questionKind: answer.questionKind,
    userId: uid,
  });
  if (!guidance) {
    return NextResponse.json({ error: "Couldn't generate coaching right now — try again." }, { status: 502 });
  }

  await prisma.mockInterviewAnswer.update({
    where: { id: answer.id },
    data: { guidance: guidance as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, guidance, cached: false });
}
