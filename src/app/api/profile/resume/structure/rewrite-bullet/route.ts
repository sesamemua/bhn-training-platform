/**
 * AI-rewrite a single bullet on the caller's structured resume.
 *
 *   POST /api/profile/resume/structure/rewrite-bullet
 *     body: {
 *       bulletId:   string;      // id of the bullet inside Resume.content
 *       commentId?: string;      // optional — comment used as guidance
 *       apply?:     boolean;     // when true, persists; otherwise preview
 *     }
 *
 * Two-step flow — same shape as the tailor endpoint:
 *
 *   1) POST { bulletId, commentId? }       → { original, rewritten }
 *   2) POST { bulletId, ..., apply: true } → persists onto Resume.content,
 *                                            marks the bullet
 *                                            aiSuggested = true so the
 *                                            editor highlights it, and
 *                                            writes a ResumeRevision
 *                                            snapshot.
 *
 * Always self-scoped: the bullet must belong to the caller's resume.
 * Comments only contribute their `body` text to the prompt — author
 * info / status are not exposed.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ResumeContent } from "@/lib/resume/types";
import { rewriteBullet } from "@/lib/resume/tailor";
import { recordRevision } from "@/lib/resume/revisions";
import { getActiveResume } from "@/lib/resume/active";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    bulletId?: unknown;
    commentId?: unknown;
    apply?: unknown;
    resumeId?: unknown;
  };
  const bulletId = typeof body.bulletId === "string" ? body.bulletId : null;
  if (!bulletId) {
    return NextResponse.json({ error: "bulletId required" }, { status: 400 });
  }
  const commentId = typeof body.commentId === "string" ? body.commentId : null;
  const targetResumeId = typeof body.resumeId === "string" ? body.resumeId : null;
  const apply = body.apply === true;

  // Resolve which resume the bullet belongs to. Caller can pin a
  // specific resumeId (when editing a tailored copy); otherwise we
  // default to the most-recently-edited.
  const target = await getActiveResume({ userId, resumeId: targetResumeId });
  if (!target) {
    return NextResponse.json({ error: "No resume to rewrite against." }, { status: 400 });
  }
  // Fetch full content for the located resume.
  const resume = await prisma.resume.findUnique({
    where: { id: target.id },
    select: { id: true, content: true, version: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "No resume to rewrite against." }, { status: 400 });
  }
  const content = resume.content as unknown as ResumeContent;
  const located = locateBullet(content, bulletId);
  if (!located) {
    return NextResponse.json({ error: "Bullet not found on your resume." }, { status: 404 });
  }

  // Optional comment lookup — must belong to the same resume so a
  // commentId from someone else's tree can't influence this rewrite.
  let commentText: string | undefined;
  if (commentId) {
    const c = await prisma.resumeComment.findUnique({
      where: { id: commentId },
      select: { resumeId: true, body: true },
    });
    if (c && c.resumeId === resume.id) commentText = c.body;
  }

  const result = await rewriteBullet({
    original: located.bullet.body,
    comment: commentText,
    itemTitle: located.item.title,
    itemSubtitle: located.item.subtitle,
    userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  const rewritten = result.rewritten.trim();
  const changed = rewritten.replace(/\s+/g, " ") !== located.bullet.body.replace(/\s+/g, " ");

  // Preview mode — return both the original and the rewrite without
  // touching the DB. The editor renders a diff and the trainee decides.
  if (!apply) {
    return NextResponse.json({
      ok: true,
      preview: true,
      bulletId,
      original: located.bullet.body,
      rewritten,
      changed,
    });
  }

  if (!changed) {
    return NextResponse.json({
      ok: true,
      bulletId,
      changed: false,
      note: "AI returned an essentially identical bullet — nothing applied.",
    });
  }

  // Apply mode — clone the tree, mutate the target bullet, persist +
  // revision snapshot. Same transaction pattern as parse / tailor.
  const next: ResumeContent = JSON.parse(JSON.stringify(content));
  const locatedNext = locateBullet(next, bulletId);
  if (!locatedNext) {
    return NextResponse.json({ error: "Bullet vanished during apply — try again." }, { status: 500 });
  }
  locatedNext.bullet.body = rewritten;
  locatedNext.bullet.aiSuggested = true;

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.resume.update({
      where: { id: resume.id },
      data: {
        content: next as unknown as object,
        version: { increment: 1 },
        lastEditedAt: new Date(),
      },
      select: { id: true, version: true },
    });
    await recordRevision(tx, {
      resumeId: r.id,
      version: r.version,
      content: next as unknown as object,
      triggeredBy: "ai_suggest",
      note: commentText
        ? `Bullet rewrite (with mentor comment)`
        : `Bullet rewrite`,
    });
    return r;
  });

  // If a comment drove this rewrite, mark it `applied` so the thread
  // visibly closes the loop on the mentor's suggestion.
  if (commentId && commentText) {
    await prisma.resumeComment.update({
      where: { id: commentId },
      data: { status: "applied" },
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    bulletId,
    original: located.bullet.body,
    rewritten,
    changed: true,
    version: updated.version,
  });
}

/** Find a bullet inside the resume tree, returning the containing item
 *  + section so the rewrite prompt can ground in context. */
function locateBullet(content: ResumeContent, bulletId: string) {
  for (const section of content.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        if (bullet.id === bulletId) {
          return { section, item, bullet };
        }
      }
    }
  }
  return null;
}
