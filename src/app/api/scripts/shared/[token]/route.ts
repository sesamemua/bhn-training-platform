/**
 * Public (no login) content save for a shared script.
 *   PATCH /api/scripts/shared/[token]  { richContent, summary? }
 * Requires a valid edit link + the per-script collaborator cookie (set by
 * /join). Every save writes a ScriptRevision attributed to the collaborator
 * and bumps their editCount (drives the later account offer).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShareToken, getCollaborator } from "@/lib/scripts/share";
import { saveScriptContent } from "@/lib/scripts/content";
import { parseRichContent } from "@/lib/scripts/sanitize";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ token: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const res = await resolveShareToken(token);
  if (!res.ok) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  if (!res.token.canEdit) return NextResponse.json({ error: "This link is view-only." }, { status: 403 });

  const collab = await getCollaborator(res.script.id);
  if (!collab) return NextResponse.json({ error: "Please join with your name first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { richContent?: unknown; summary?: string };
  if (body.richContent === undefined) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  const richContent = parseRichContent(body.richContent, "html");
  if (!richContent) return NextResponse.json({ error: "Invalid script content." }, { status: 400 });

  const snapshot = await saveScriptContent({
    scriptId: res.script.id,
    format: "html",
    richContent,
    author: { userId: null, name: collab.name, kind: "anon" },
    summary: typeof body.summary === "string" ? body.summary.slice(0, 120) : "Edited script",
  });

  const updated = await prisma.scriptCollaborator.update({
    where: { id: collab.id },
    data: { editCount: { increment: 1 }, lastSeenAt: new Date() },
    select: { editCount: true, convertedUserId: true },
  }).catch(() => null);

  return NextResponse.json({ ok: true, snapshot, editCount: updated?.editCount ?? null, converted: !!updated?.convertedUserId });
}
