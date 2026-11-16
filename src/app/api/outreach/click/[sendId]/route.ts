/**
 * Click tracking for campaign e-mails:
 *   GET /api/outreach/click/<sendId>?u=<url>&s=<sig>
 * The signature covers send + URL, so this can't be used to bounce people
 * to an address we never sent. A click also counts as an open.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyClick } from "@/lib/outreach/crm-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params;
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const sig = req.nextUrl.searchParams.get("s") ?? "";
  let ok = false;
  try { ok = /^https?:\/\//.test(u) && verifyClick(sendId, u, sig); } catch { ok = false; }
  if (!ok) return NextResponse.redirect(new URL("/", req.url));
  const s = await prisma.outreachSend.findUnique({ where: { id: sendId }, select: { openedAt: true, clickedAt: true } }).catch(() => null);
  if (s) {
    const now = new Date();
    await prisma.outreachSend.update({
      where: { id: sendId },
      data: { clicks: { increment: 1 }, clickedAt: s.clickedAt ?? now, openedAt: s.openedAt ?? now },
    }).catch(() => null);
  }
  return NextResponse.redirect(u, 302);
}
