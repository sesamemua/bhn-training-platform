/**
 * Review notes pinned to elements of a rendered newsletter issue.
 *
 *   GET  → every note on the issue, oldest first
 *   POST → { action: add | edit | delete | setStatus }
 *
 * Permissions follow the Website Review precedent exactly: instructor+
 * may write, and there is NO ownership check — this is a shared editorial
 * workspace, so anyone can edit or resolve anyone's note. What changes is
 * that the edit is attributed: editedByName is stamped and shown, so the
 * record always says who touched it.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same ceiling as a page-review comment. */
const COMMENT_MAX = 1000;

const AddSchema = z.object({
  action: z.literal("add"),
  body: z.string().trim().min(1).max(COMMENT_MAX),
  pieceId: z.string().max(64).nullish(),
  anchorQuote: z.string().max(400).nullish(),
  anchorLabel: z.string().max(80).nullish(),
  cssPath: z.string().max(400).nullish(),
});

const EditSchema = z.object({
  action: z.literal("edit"),
  commentId: z.string().min(1),
  body: z.string().trim().min(1).max(COMMENT_MAX),
});

const DeleteSchema = z.object({
  action: z.literal("delete"),
  commentId: z.string().min(1),
});

const StatusSchema = z.object({
  action: z.literal("setStatus"),
  commentId: z.string().min(1),
  status: z.enum(["open", "resolved"]),
});

async function load(issueId: string) {
  return prisma.newsletterComment.findMany({
    where: { issueId },
    orderBy: { createdAt: "asc" },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const comments = await load(id);
  const openCount = comments.filter((c) => c.status === "open").length;
  return NextResponse.json({ ok: true, comments, openCount, total: comments.length });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: issueId } = await ctx.params;
  const issue = await prisma.newsletterIssue.findUnique({
    where: { id: issueId },
    select: { id: true },
  });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const user = session.user as { id?: string; name?: string; email?: string };
  const who = user.name ?? user.email ?? "Someone";
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  if (body.action === "add") {
    const parsed = AddSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await prisma.newsletterComment.create({
      data: {
        issueId,
        body: parsed.data.body,
        pieceId: parsed.data.pieceId ?? null,
        anchorQuote: parsed.data.anchorQuote ?? null,
        anchorLabel: parsed.data.anchorLabel ?? null,
        cssPath: parsed.data.cssPath ?? null,
        authorId: user.id ?? null,
        authorName: who,
      },
    });
    return NextResponse.json({ ok: true, comments: await load(issueId) });
  }

  if (body.action === "edit") {
    const parsed = EditSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const existing = await prisma.newsletterComment.findFirst({
      where: { id: parsed.data.commentId, issueId },
      select: { id: true, authorId: true },
    });
    if (!existing) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    // Attribute the edit only when someone else made it — a person
    // tidying their own wording shouldn't read as third-party editing.
    const byOther = existing.authorId !== (user.id ?? null);
    await prisma.newsletterComment.update({
      where: { id: existing.id },
      data: {
        body: parsed.data.body,
        editedAt: new Date(),
        editedById: byOther ? user.id ?? null : null,
        editedByName: byOther ? who : null,
      },
    });
    return NextResponse.json({ ok: true, comments: await load(issueId) });
  }

  if (body.action === "delete") {
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await prisma.newsletterComment.deleteMany({
      where: { id: parsed.data.commentId, issueId },
    });
    return NextResponse.json({ ok: true, comments: await load(issueId) });
  }

  if (body.action === "setStatus") {
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const resolving = parsed.data.status === "resolved";
    await prisma.newsletterComment.updateMany({
      where: { id: parsed.data.commentId, issueId },
      data: {
        status: parsed.data.status,
        resolvedAt: resolving ? new Date() : null,
        resolvedById: resolving ? user.id ?? null : null,
      },
    });
    return NextResponse.json({ ok: true, comments: await load(issueId) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
