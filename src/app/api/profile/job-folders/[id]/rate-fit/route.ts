/**
 * POST /api/profile/job-folders/[id]/rate-fit
 *
 * Sends the folder's JD body + linked resume content to the AI for a
 * requirement-by-requirement fit MATRIX. Returns { score, verdict,
 * rows: [{requirement, rating, evidence, tip}], nextMove }. Owner-only.
 *
 * No persistence — the matrix is ephemeral. If we want history later
 * we'd store it in a sibling table; for now the trainee gets a fresh
 * read each time they ask (resume / JD edits change the answer).
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateFitMatrix } from "@/lib/job-folders/ai";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id;
  const candidateName = (session.user as { name?: string }).name ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const folder = await prisma.jobFolder.findUnique({
    where: { id },
    select: {
      userId: true,
      jdSnippet: true,
      resume: { select: { content: true } },
    },
  });
  if (!folder || folder.userId !== userId) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  const result = await rateFitMatrix({
    jdSnippet: folder.jdSnippet,
    resumeContent: folder.resume?.content ?? null,
    candidateName,
    userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, matrix: result.matrix });
}
