/**
 * Open pixel for campaign e-mails: GET /api/outreach/open/<sendId>.<sig>
 * Always answers with the 1×1 GIF — a bad token just isn't counted.
 * Note: Apple Mail Privacy Protection pre-loads images, so opens over-count.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PIXEL_GIF, readOpenToken } from "@/lib/outreach/crm-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const id = (() => { try { return readOpenToken(token); } catch { return null; } })();
  if (id) {
    const s = await prisma.outreachSend.findUnique({ where: { id }, select: { openedAt: true } }).catch(() => null);
    if (s) await prisma.outreachSend.update({ where: { id }, data: { opens: { increment: 1 }, openedAt: s.openedAt ?? new Date() } }).catch(() => null);
  }
  return new Response(new Uint8Array(PIXEL_GIF), {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
  });
}
