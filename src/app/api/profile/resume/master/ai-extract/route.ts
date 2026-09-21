/**
 * Master resume — AI-extract from an existing tailored Resume.
 *
 *   POST /api/profile/resume/master/ai-extract
 *     body: { resumeId: string }
 *
 * Bootstrap the master library from one of the user's existing
 * tailored resumes. Walks the structured Resume.content tree and hands
 * it to the shared importer (embed → cosine-dedupe → insert with anchor
 * provenance + one-shot header copy). See lib/resume/master-import.ts.
 *
 *   Response: { ok, created, skipped, total, headerCopied, note? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importContentIntoMaster, EmbeddingUnavailableError } from "@/lib/resume/master-import";
import type { ResumeContent } from "@/lib/resume/types";

export const runtime = "nodejs";

async function getMyUserId(): Promise<string | null> {
  const session = await requireSession().catch(() => null);
  if (!session) return null;
  return (session.user as { id?: string }).id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await getMyUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { resumeId?: unknown };
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  if (!resumeId) {
    return NextResponse.json({ error: "resumeId required" }, { status: 400 });
  }

  // Ownership check — never extract from another user's resume.
  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    select: { id: true, userId: true, name: true, content: true },
  });
  if (!resume || resume.userId !== userId) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  // Legacy rows occasionally store content as a JSON string; accept
  // either and normalise to an object.
  let content: ResumeContent;
  if (typeof resume.content === "string") {
    try { content = JSON.parse(resume.content) as ResumeContent; }
    catch { content = { sections: [] }; }
  } else {
    content = (resume.content as unknown as ResumeContent) ?? { sections: [] };
  }

  try {
    const result = await importContentIntoMaster(userId, content, { sourceResumeId: resume.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof EmbeddingUnavailableError) {
      return NextResponse.json({ error: "Embedding service unavailable — try again in a moment." }, { status: 503 });
    }
    throw e;
  }
}
