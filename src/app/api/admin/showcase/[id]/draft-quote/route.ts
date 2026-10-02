/**
 * POST /api/admin/showcase/[id]/draft-quote — admin only. Draft (again) the
 * short quote for a testimonial from its answers and recordings' transcripts.
 * Returns { ok, quote } — saved on the submission, for the team to edit.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai";
import { AnswerSchema, cleanQuote, quotePrompt } from "@/lib/showcase/testimonial";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const s = await prisma.showcaseSubmission.findUnique({ where: { id }, select: { name: true, programs: true, answers: true } });
  if (!s) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const answers = (Array.isArray(s.answers) ? s.answers : []).flatMap((a) => { const r = AnswerSchema.safeParse(a); return r.success ? [r.data] : []; });
  if (!answers.length) return NextResponse.json({ error: "This submission has no answers to draft from." }, { status: 400 });
  const q = await chat(quotePrompt(s.name, s.programs, answers), { userId: (session.user as { id?: string }).id ?? null, feature: "showcase-testimonial-quote", maxTokens: 160, temperature: 0.4, timeoutMs: 25000 });
  if (!q.ok || !q.text.trim()) return NextResponse.json({ error: "The AI didn't answer — try again in a moment." }, { status: 502 });
  const quote = cleanQuote(q.text);
  await prisma.showcaseSubmission.update({ where: { id }, data: { quote } });
  return NextResponse.json({ ok: true, quote });
}
