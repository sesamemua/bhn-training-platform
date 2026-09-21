/**
 * Generate cover letter OR interview prep for a job folder.
 *
 *   POST /api/profile/job-folders/[id]/generate
 *     body: { kind: "cover_letter" | "interview_prep"; save?: boolean }
 *
 * When `save: true`, the generated text is also written into the
 * folder (overwriting whatever was there). Otherwise the response
 * just carries the draft so the client can preview before applying.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCoverLetter, generateInterviewPrep } from "@/lib/job-folders/ai";
import type { ResumeContent } from "@/lib/resume/types";

export const runtime = "nodejs";

interface RouteCtx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; save?: unknown };
  const kind = body.kind === "cover_letter" || body.kind === "interview_prep" ? body.kind : null;
  if (!kind) {
    return NextResponse.json({ error: "kind must be 'cover_letter' or 'interview_prep'." }, { status: 400 });
  }
  const save = body.save === true;

  const folder = await prisma.jobFolder.findUnique({
    where: { id },
    include: {
      resume: { select: { id: true, content: true, userId: true } },
    },
  });
  if (!folder || folder.userId !== userId) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }

  // Pull candidate name from the user record for the letter salutation
  // fallback. Cover letter prompt prefers the resume's header.name.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  const resumeContent =
    folder.resume && folder.resume.userId === userId
      ? (folder.resume.content as unknown as ResumeContent)
      : null;

  const promptArgs = {
    jdSnippet: folder.jdSnippet,
    resumeContent,
    candidateName: user?.name ?? null,
    userId,
  };
  const result = kind === "cover_letter"
    ? await generateCoverLetter(promptArgs)
    : await generateInterviewPrep(promptArgs);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  if (save) {
    await prisma.jobFolder.update({
      where: { id },
      data: kind === "cover_letter"
        ? { coverLetter: result.text }
        : { interviewPrep: result.text },
    });
  }

  return NextResponse.json({ ok: true, text: result.text, kind, saved: save });
}
