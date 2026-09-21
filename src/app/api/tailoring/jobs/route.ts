/**
 * Tailoring jobs.
 *   GET  → the user's recent jobs
 *   POST { url? , jdText? } → ingest + parse a job (rules 2–4)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestJob } from "@/lib/tailoring/ingest";

export const runtime = "nodejs";

async function uid(): Promise<string | null> {
  const s = await requireSession().catch(() => null);
  return s ? (s.user as { id?: string }).id ?? null : null;
}

export async function GET() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.tailoringJob.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, title: true, company: true, ats: true, location: true, createdAt: true, _count: { select: { runs: true } } },
  });
  return NextResponse.json({ ok: true, jobs });
}

export async function POST(req: NextRequest) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; jdText?: string };
  const res = await ingestJob({ userId, url: body.url, jdText: body.jdText });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
