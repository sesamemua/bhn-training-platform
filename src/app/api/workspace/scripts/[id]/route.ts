/**
 * One script (admin-only). Content saves write a ScriptRevision (history).
 *   GET    /api/workspace/scripts/[id]   → content snapshot + meta
 *   PATCH  /api/workspace/scripts/[id]   → { title?, format?, sections?, richContent?, summary? }
 *   DELETE /api/workspace/scripts/[id]   → soft-archive; ?force=true hard delete
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveScriptContent, type ScriptFormat, type SnapshotSection } from "@/lib/scripts/content";
import { parseRichContent } from "@/lib/scripts/sanitize";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const script = await prisma.script.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      project: { select: { id: true, title: true } },
    },
  });
  if (!script) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    script: {
      id: script.id,
      title: script.title,
      format: script.format,
      projectId: script.projectId,
      project: script.project,
      sections: script.sections.map((s) => ({ id: s.id, heading: s.heading, body: s.body, order: s.order })),
      richContent: (script.richContent as unknown) ?? null,
      updatedAt: script.updatedAt,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const uid = (session.user as { id?: string }).id ?? null;
  const name = (session.user as { name?: string }).name ?? "Admin";
  const { id } = await ctx.params;
  const exists = await prisma.script.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    format?: ScriptFormat;
    sections?: SnapshotSection[];
    richContent?: unknown;
    summary?: string;
  };
  const richContent = body.richContent === undefined ? undefined : parseRichContent(body.richContent, body.format);
  if (body.richContent !== undefined && richContent === undefined) {
    return NextResponse.json({ error: "Invalid script content." }, { status: 400 });
  }

  // Title-only update (rename) — no content revision.
  if (
    typeof body.title === "string" &&
    body.sections === undefined &&
    body.richContent === undefined &&
    body.format === undefined
  ) {
    const t = body.title.trim().slice(0, 160);
    if (!t) return NextResponse.json({ error: "Title required." }, { status: 400 });
    await prisma.script.update({ where: { id }, data: { title: t } });
    return NextResponse.json({ ok: true });
  }

  // Rename alongside a content save.
  if (typeof body.title === "string" && body.title.trim()) {
    await prisma.script.update({ where: { id }, data: { title: body.title.trim().slice(0, 160) } });
  }

  const snapshot = await saveScriptContent({
    scriptId: id,
    format: body.format,
    sections: body.sections,
    richContent,
    author: { userId: uid, name, kind: "user" },
    summary: body.summary,
  });
  return NextResponse.json({ ok: true, snapshot });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  if (force) {
    await prisma.script.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true, deleted: true });
  }
  await prisma.script.update({ where: { id }, data: { isArchived: true } }).catch(() => null);
  return NextResponse.json({ ok: true, archived: true });
}
