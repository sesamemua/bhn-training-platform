import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SocialChangeDetail, type SocialTextChange } from "@/lib/social/edit-history";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const exists = await prisma.socialPost.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const entries = await prisma.auditLog.findMany({
    where: { targetType: "socialPost", targetId: id, action: "social.post.edit" },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, detail: true, createdAt: true, actor: { select: { name: true } } },
  });
  const changes: SocialTextChange[] = [];
  for (const entry of entries) {
    try {
      const detail = SocialChangeDetail.parse(JSON.parse(entry.detail ?? "null"));
      changes.push({ ...detail, id: entry.id, at: entry.createdAt.toISOString(), author: entry.actor.name ?? "Team member" });
    } catch { /* Ignore audit entries from incompatible older formats. */ }
  }
  return NextResponse.json({ changes }, { headers: { "Cache-Control": "private, no-store" } });
}
