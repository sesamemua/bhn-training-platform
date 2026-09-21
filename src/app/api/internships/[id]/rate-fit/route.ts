/**
 * POST /api/internships/[id]/rate-fit
 *
 * Builds an AI fit-rating matrix for the signed-in trainee against a
 * specific internship posting: posting.positionDetails (the JD) vs the
 * trainee's most-recent active resume. Returns { matrix }.
 *
 * Sibling of the JobFolder rate-fit route, but resume-resolved from
 * the user's primary resume (there's no folder here). Ephemeral — no
 * persistence; a fresh read each time.
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
  const posting = await prisma.internshipPosting.findUnique({
    where: { id },
    select: { positionDetails: true, title: true },
  });
  if (!posting) {
    return NextResponse.json({ error: "Posting not found." }, { status: 404 });
  }

  // Use the trainee's most-recently-edited active resume as the
  // candidate side (there's no folder-linked resume on this surface).
  const resume = await prisma.resume.findFirst({
    where: { userId, isArchived: false },
    orderBy: { lastEditedAt: "desc" },
    select: { content: true },
  });
  if (!resume) {
    return NextResponse.json(
      { error: "Build a resume first — the matrix rates your resume against this posting." },
      { status: 400 },
    );
  }

  const result = await rateFitMatrix({
    jdSnippet: posting.positionDetails ?? "",
    resumeContent: resume.content,
    candidateName,
    userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, matrix: result.matrix });
}
