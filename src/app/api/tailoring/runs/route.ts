/**
 * Tailoring runs.
 *   POST { jobId } → run the full pipeline (gap → draft → verify → fit)
 *   GET → the user's recent runs
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runTailoring } from "@/lib/tailoring/pipeline";
import { atsPlan } from "@/lib/tailoring/ats";
import type { AtsKind } from "@/lib/tailoring/schemas";

export const runtime = "nodejs";

async function uid(): Promise<string | null> {
  const s = await requireSession().catch(() => null);
  return s ? (s.user as { id?: string }).id ?? null : null;
}

export async function GET() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runs = await prisma.tailoringRun.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, status: true, format: true, createdAt: true, job: { select: { title: true, company: true } } },
  });
  return NextResponse.json({ ok: true, runs });
}

export async function POST(req: NextRequest) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const res = await runTailoring({ userId, jobId: body.jobId });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  const job = await prisma.tailoringJob.findFirst({ where: { id: body.jobId, userId }, select: { ats: true } });
  const plan = atsPlan((job?.ats ?? "other") as AtsKind);
  return NextResponse.json({ ...res, plan });
}
