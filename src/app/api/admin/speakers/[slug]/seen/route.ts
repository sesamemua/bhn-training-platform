/**
 * POST /api/admin/speakers/[slug]/seen — "an admin has looked at this
 * event's speaker submissions". Called by <MarkSpeakersSeen> from the
 * Headshots & Bios pages once the page is actually on screen.
 *
 * A POST from the browser, never a side effect of rendering the page: a
 * GET also runs for prefetches, tour previews, link checks and crawlers,
 * and every one of those would quietly clear the badge for people who
 * never saw the page. The first deploy did exactly that — both events
 * were "seen" within 900 ms of each other, by nobody.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markSpeakersSeen } from "@/lib/admin/workspace-queue";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { slug } = await ctx.params;
  const event = await prisma.bhnEvent.findUnique({ where: { slug }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "Unknown event." }, { status: 404 });
  await markSpeakersSeen(slug);
  return new NextResponse(null, { status: 204 });
}
