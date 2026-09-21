/**
 * Mock interview sessions (signed-in users only).
 *   POST /api/mock-interview { role, context?, count? }
 *     → generates a tailored question set and creates the session + answer
 *       rows; returns { id } to navigate into the runner.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInterviewQuestions } from "@/lib/interview/ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Sign in to practice." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { role?: unknown; context?: unknown; count?: unknown };
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 120) : "";
  if (role.length < 2) return NextResponse.json({ error: "Enter the role you're practising for." }, { status: 400 });
  const context = typeof body.context === "string" ? body.context.trim().slice(0, 4000) : "";
  const count = typeof body.count === "number" ? Math.max(3, Math.min(10, Math.round(body.count))) : 5;

  const questions = await generateInterviewQuestions({ role, context, count, userId: uid });

  const interview = await prisma.mockInterview.create({
    data: {
      userId: uid,
      role,
      context,
      answers: {
        create: questions.map((q, i) => ({
          order: i,
          question: q.question,
          questionKind: q.kind,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: interview.id }, { status: 201 });
}
