/** Tracked short link: GET /go/<slug> → counts the click, redirects to the UTM-tagged URL. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const link = await prisma.outreachLink
    .update({ where: { slug }, data: { clicks: { increment: 1 }, lastAt: new Date() }, select: { url: true } })
    .catch(() => null);
  return NextResponse.redirect(link?.url ?? new URL("/", req.url), 302);
}
