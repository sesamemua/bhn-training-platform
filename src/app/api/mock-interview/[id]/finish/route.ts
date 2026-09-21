/**
 * Finish a session: synthesize an overall debrief (owner only).
 *   POST /api/mock-interview/[id]/finish
 *   → computes the average score, writes a summary, marks the session complete.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeInterview } from "@/lib/interview/ai";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const interview = await prisma.mockInterview.findFirst({
    where: { id, userId: uid },
    select: {
      id: true, role: true,
      answers: { orderBy: { order: "asc" }, select: { question: true, transcript: true, score: true, confidence: true } },
    },
  });
  if (!interview) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { overallScore, summary } = await summarizeInterview({
    role: interview.role,
    answers: interview.answers,
    userId: uid,
  });

  await prisma.mockInterview.update({
    where: { id: interview.id },
    data: { status: "complete", overallScore, summary },
  });

  return NextResponse.json({ ok: true, overallScore, summary });
}
